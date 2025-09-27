#!/usr/bin/env python3
"""
Architecture Reviewer: consumes cached CDK scan + graph and produces actionable feedback.

Usage:
  python3 backend/architecture_reviewer.py --in .cache/cdk-scans/<cacheKey>.json --out .cache/ai-reviews/<cacheKey>.json [--openai-key <key>]

Behavior:
  - If an OpenAI key is provided (or OPENAI_KEY env is set), attempts an AI-driven
    review similar to causality.py's approach (structured JSON output only).
  - If no key or API call fails, falls back to deterministic heuristic checks
    for common AWS architecture best-practices around reliability, cost, and ops.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

try:
    import urllib.request
    import urllib.error
except Exception:  # pragma: no cover
    urllib = None  # type: ignore


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Review architecture from cached scan+graph")
    parser.add_argument("--in", dest="in_path", required=True, help="Path to cached scan result JSON")
    parser.add_argument("--out", dest="out_path", required=True, help="Path to write review JSON")
    parser.add_argument("--openai-key", dest="openai_key", help="OpenAI API key (or set OPENAI_KEY)")
    return parser.parse_args()


def load_json(path: str) -> Dict[str, Any]:
    with Path(path).expanduser().open("r", encoding="utf-8") as f:
        return json.load(f)


def safe_get(d: Dict[str, Any], *path: str, default: Any = None) -> Any:
    cur: Any = d
    for p in path:
        if not isinstance(cur, dict) or p not in cur:
            return default
        cur = cur[p]
    return cur


def build_compact_graph_snapshot(data: Dict[str, Any]) -> Dict[str, Any]:
    graph = data.get("graph") or {}
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []
    # Trim props to keep prompt light
    compact_nodes = [
        {
            "id": n.get("id"),
            "type": n.get("type"),
            "label": n.get("label"),
            "props": {k: v for k, v in (n.get("props") or {}).items() if k in ("timeoutMs", "memorySize", "billingMode")},
        }
        for n in nodes
    ]
    compact_edges = [
        {
            "from": e.get("from"),
            "to": e.get("to"),
            "kind": e.get("kind"),
            "sync": e.get("sync", True),
        }
        for e in edges
    ]
    return {
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "nodes": compact_nodes,
        "edges": compact_edges,
    }


def ai_review(data: Dict[str, Any], api_key: str) -> Dict[str, Any]:
    if not urllib or not api_key:
        raise RuntimeError("AI review unavailable: urllib or API key missing")

    cdk_summary = safe_get(data, "cdkResult", "summary", default={})
    graph_snapshot = build_compact_graph_snapshot(data)

    prompt = f"""
You are an experienced AWS Solutions Architect. Review the following CDK scan summary and resource graph. Identify risks, misconfigurations, and opportunities for cost, reliability, performance, and operational excellence improvements. Return STRICT JSON ONLY using the exact schema described.

CDK Summary (from static analysis):
{json.dumps(cdk_summary, indent=2)}

Resource Graph (from AI causality):
{json.dumps(graph_snapshot, indent=2)}

RESPONSE JSON SCHEMA (return ONLY JSON):
{{
  "summary": "one-paragraph executive summary",
  "findings": [
    {{
      "id": "stable_slug",
      "severity": "info|low|medium|high|critical",
      "category": "reliability|security|cost|performance|operability",
      "message": "short title",
      "details": "clear, specific guidance",
      "nodes": ["optional_node_ids"],
      "edges": [{{"from":"id","to":"id","kind":"..."}}],
      "references": ["optional urls to docs"]
    }}
  ],
  "recommendations": ["bullet list of concrete next steps"],
  "meta": {{
    "source": "ai_reviewer",
    "model": "gpt-4.1",
    "generated_at": "ISO8601"
  }}
}}

ONLY RETURN JSON. Do not include markdown backticks or commentary.
"""

    payload = {
        "model": "gpt-4.1",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 2000,
    }

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode())
            content = result["choices"][0]["message"]["content"].strip()
            # Clean accidental code fences
            if content.startswith("```json"):
                content = content[7:]
            if content.endswith("```"):
                content = content[:-3]
            return json.loads(content)
    except Exception as e:  # Network or JSON issues
        raise RuntimeError(f"AI call failed: {e}")


def finding(
    fid: str,
    severity: str,
    category: str,
    message: str,
    details: str,
    nodes: List[str] | None = None,
    edges: List[Dict[str, Any]] | None = None,
    refs: List[str] | None = None,
) -> Dict[str, Any]:
    return {
        "id": fid,
        "severity": severity,
        "category": category,
        "message": message,
        "details": details,
        "nodes": nodes or [],
        "edges": edges or [],
        "references": refs or [],
    }


def heuristic_review(data: Dict[str, Any]) -> Dict[str, Any]:
    cdk_summary = safe_get(data, "cdkResult", "summary", default={}) or {}
    graph = data.get("graph") or {}
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []

    node_by_id = {n.get("id"): n for n in nodes if n.get("id")}
    queue_nodes = [n for n in nodes if n.get("type") == "Queue"]
    dlq_nodes = [n for n in queue_nodes if "dlq" in (n.get("label", "") + n.get("id", "")).lower()]
    lambda_nodes = [n for n in nodes if n.get("type") == "Lambda"]
    table_nodes = [n for n in nodes if n.get("type") == "Table"]
    apigw_nodes = [n for n in nodes if n.get("type") == "ApiGateway"]

    findings: List[Dict[str, Any]] = []

    # 1) Lambdas: ensure memory/timeout configured
    for ln in lambda_nodes:
        lid = ln.get("id")
        mem = safe_get(ln, "props", "memorySize")
        to_ms = safe_get(ln, "props", "timeoutMs")
        if mem is None:
            findings.append(
                finding(
                    fid=f"lambda-mem-not-set-{lid}",
                    severity="low",
                    category="operability",
                    message="Lambda memorySize not explicitly set",
                    details=(
                        "Set an appropriate memorySize to control performance/cost and predictable cold-starts. "
                        "Consider 256–1024MB depending on workload; benchmark with Lambda Power Tuning."
                    ),
                    nodes=[lid] if lid else [],
                    refs=[
                        "https://docs.aws.amazon.com/lambda/latest/operatorguide/computing-power.html",
                        "https://github.com/alexcasalboni/aws-lambda-power-tuning",
                    ],
                )
            )
        if to_ms is None:
            findings.append(
                finding(
                    fid=f"lambda-timeout-not-set-{lid}",
                    severity="low",
                    category="operability",
                    message="Lambda timeout not explicitly set",
                    details=(
                        "Set a timeout aligned with upstream timeouts and idempotency strategy. "
                        "Avoid long timeouts for API-facing Lambdas; consider retries and DLQs."
                    ),
                    nodes=[lid] if lid else [],
                    refs=["https://docs.aws.amazon.com/lambda/latest/dg/configuration-function-common.html"],
                )
            )

    # 2) API Gateway to Lambda timeouts
    for api in apigw_nodes:
        api_id = api.get("id")
        # Look for invokes from API to Lambda
        api_edges = [e for e in edges if e.get("from") == api_id and e.get("kind") == "invoke"]
        for e in api_edges:
            target = node_by_id.get(e.get("to"))
            if target and target.get("type") == "Lambda":
                lid = target.get("id")
                to_ms = safe_get(target, "props", "timeoutMs")
                # API Gateway has ~29s timeout; warn if lambda configured >= 30000ms
                if isinstance(to_ms, int) and to_ms >= 29000:
                    findings.append(
                        finding(
                            fid=f"apigw-lambda-timeout-bound-{lid}",
                            severity="medium",
                            category="reliability",
                            message="API Gateway → Lambda near/over 29s timeout limit",
                            details=(
                                "API Gateway imposes a ~29s integration timeout. For synchronous invocations, ensure the Lambda timeout is below this and that the handler completes well within bounds, or adopt async patterns (SQS/EventBridge)."
                            ),
                            nodes=[api_id, lid],
                            refs=[
                                "https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html",
                            ],
                        )
                    )

    # 3) SQS DLQ presence
    if queue_nodes:
        has_dlq = bool(dlq_nodes)
        if not has_dlq:
            findings.append(
                finding(
                    fid="sqs-missing-dlq",
                    severity="medium",
                    category="reliability",
                    message="SQS queues without a dead-letter queue",
                    details=(
                        "Configure a DLQ for production SQS queues to capture poison messages and enable retries/alerting."
                    ),
                    nodes=[q.get("id") for q in queue_nodes if q.get("id")],
                    refs=["https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html"],
                )
            )

    # 4) DynamoDB tables: explicit billing mode
    for t in table_nodes:
        tid = t.get("id")
        billing = safe_get(t, "props", "billingMode")
        if not billing:
            findings.append(
                finding(
                    fid=f"dynamodb-billingmode-not-set-{tid}",
                    severity="info",
                    category="cost",
                    message="DynamoDB billing mode not explicitly set",
                    details=(
                        "Set PAY_PER_REQUEST (on-demand) for spiky/unknown traffic or PROVISIONED with auto-scaling for predictable workloads."
                    ),
                    nodes=[tid] if tid else [],
                    refs=["https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadWriteCapacityMode.html"],
                )
            )

    # 5) Cross-service reliability cues (example: Lambda -> Queue should have DLQ)
    for e in edges:
        if e.get("kind") == "publish":
            to_node = node_by_id.get(e.get("to"))
            if to_node and to_node.get("type") == "Queue" and not dlq_nodes:
                findings.append(
                    finding(
                        fid=f"lambda-publish-no-dlq-{e.get('to')}",
                        severity="medium",
                        category="reliability",
                        message="Publish to SQS without DLQ",
                        details=(
                            "When publishing to SQS, configure a DLQ on the target queue and alerting on DLQ depth/time for visibility."
                        ),
                        edges=[{"from": e.get("from"), "to": e.get("to"), "kind": e.get("kind")}],
                        refs=["https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html"],
                    )
                )

    services = cdk_summary.get("aws_services", []) or []
    recs: List[str] = []
    if "iam" in services:
        recs.append("Review IAM policies for least privilege; avoid overly broad actions like '*'.")
    if "lambda" in services:
        recs.append("Enable structured logging and tracing (X-Ray), ship logs to a central sink, set concurrency limits if needed.")
    if "apigateway" in services:
        recs.append("Enable request validation, auth (Cognito/JWT), throttling, and meaningful error mappings in API Gateway.")

    summary = (
        f"Analyzed {len(nodes)} resources and {len(edges)} relationships. "
        f"Identified {len(findings)} improvement opportunities across reliability, cost, and operations."
    )

    return {
        "summary": summary,
        "findings": findings,
        "recommendations": recs,
        "meta": {
            "source": "heuristic_reviewer",
            "generated_at": datetime.utcnow().isoformat() + "Z",
        },
    }


def main() -> None:
    args = parse_args()
    in_path = Path(args.in_path).expanduser()
    out_path = Path(args.out_path).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    data = load_json(str(in_path))

    # Try AI first if key provided; fallback to heuristics.
    openai_key = args.openai_key or os.getenv("OPENAI_KEY") or os.getenv("OPENAI_API_KEY")
    review: Dict[str, Any]
    if openai_key:
        try:
            review = ai_review(data, openai_key)
            # Ensure minimal keys exist
            review.setdefault("meta", {})
            review["meta"]["source"] = review.get("meta", {}).get("source", "ai_reviewer")
            review["meta"]["generated_at"] = review.get("meta", {}).get("generated_at", datetime.utcnow().isoformat() + "Z")
        except Exception as e:
            # Fall back to heuristics on any failure
            review = heuristic_review(data)
            review.setdefault("meta", {})
            review["meta"]["fallback_reason"] = f"AI failed: {e}"[:500]
    else:
        review = heuristic_review(data)

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(review, f, indent=2)

    # Print a concise status line for caller logs
    print(f"wrote review: {out_path} ({len(review.get('findings', []))} findings)")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"review failed: {exc}", file=sys.stderr)
        sys.exit(1)
