#!/usr/bin/env python3
"""Normalize CloudFormation templates and CDK code into a simple resource graph using AI."""

from __future__ import annotations

import argparse
import json
import os
import urllib.request
from pathlib import Path
from typing import Any, Dict


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--in", dest="in_path", required=True, help="Path to CloudFormation JSON template or CDK TypeScript file")
    parser.add_argument("--out", dest="out_path", required=True, help="Path to write graph JSON")
    parser.add_argument("--openai-key", dest="openai_key", help="OpenAI API key (or set OPENAI_KEY env var)")
    return parser.parse_args()


def load_file(path: str) -> str:
    """Load file content as string."""
    with Path(path).expanduser().open("r", encoding="utf-8") as handle:
        return handle.read()


def ai_parse_file(file_content: str, file_path: str, api_key: str) -> Dict[str, Any]:
    """Parse CloudFormation JSON or CDK TypeScript using OpenAI to extract resource graph."""
    # Use provided key or environment variable (checking OPENAI_KEY as you specified)
    openai_key = api_key or os.getenv("OPENAI_KEY")
    if not openai_key:
        raise ValueError("OpenAI API key required. Provide --openai-key or set OPENAI_KEY environment variable")
    
    # Determine file type and create appropriate prompt
    file_ext = Path(file_path).suffix.lower()
    if file_ext == '.ts':
        file_type = "CDK TypeScript"
        code_block = f"```typescript\n{file_content}\n```"
        source_meta = "cdk"
    elif file_ext == '.json':
        file_type = "CloudFormation JSON"
        code_block = f"```json\n{file_content}\n```"
        source_meta = "cloudformation"
    else:
        raise ValueError(f"Unsupported file type: {file_ext}")
    
    # Construct the prompt
    prompt = f"""
TASK: Parse this {file_type} code and extract EXACT resource relationships. Be PRECISE about edge directions.

{file_type} Code:
{code_block}

CRITICAL ANALYSIS RULES - READ CAREFULLY:

1. GRANT RELATIONSHIPS (MOST IMPORTANT):
   - grantWriteData(lambda) → Edge: FROM lambda TO table, KIND: "write"
   - grantReadData(lambda) → Edge: FROM lambda TO table, KIND: "read"  
   - grantSendMessages(lambda) → Edge: FROM lambda TO queue, KIND: "publish"
   - grantStreamRead(lambda) → Edge: FROM table TO lambda, KIND: "trigger"

2. ENVIRONMENT VARIABLES:
   - If Lambda has env var with table/queue name → create edge based on grant direction
   - Example: env: {{TABLE_NAME: table.tableName}} + grantWriteData → Lambda WRITES TO table

3. EVENT SOURCES:
   - addEventSource(DynamoEventSource(table)) → Edge: FROM table TO lambda, KIND: "trigger"

4. FAILURE DESTINATIONS:
   - onFailure: SqsDestination(dlq) → Edge: FROM lambda TO dlq, KIND: "publish"

5. API INTEGRATIONS:
   - API Gateway integration → Edge: FROM api TO lambda, KIND: "invoke"

6. EXTRACT KEY PROPERTIES:
   - Lambda timeout: Duration.seconds(X) → "timeoutMs": X*1000
   - Lambda memorySize: number → "memorySize": number
   - Queue retentionPeriod: Duration.days(X) → "retentionDays": X
   - Table billingMode → extract as string

EDGE DIRECTION EXAMPLES:
✅ CORRECT: fanoutQueue.grantSendMessages(fanoutLambda) → "from": "FanoutLambda", "to": "FanoutQueue", "kind": "publish"
❌ WRONG: "from": "FanoutQueue", "to": "FanoutLambda", "kind": "consume"

✅ CORRECT: dedupTable.grantWriteData(fanoutLambda) → "from": "FanoutLambda", "to": "DedupTable", "kind": "write"  
❌ WRONG: "from": "DedupTable", "to": "FanoutLambda", "kind": "write"

CRITICAL: Respond with ONLY valid JSON. No explanations, no markdown, no text - JUST JSON.

{{
  "nodes": [
    {{"id": "resource_logical_id", "type": "Lambda|Table|Queue|Topic|ApiGateway|StepFn", "label": "optional_name", "props": {{"timeoutMs": 10000, "memorySize": 128}}}},
  ],
  "edges": [
    {{"id": "edge-1", "from": "source_id", "to": "target_id", "kind": "invoke|publish|write|read|trigger", "sync": true}}
  ],
  "meta": {{"source": "{source_meta}"}}
}}

VERIFY edge directions. Output ONLY JSON."""

    # Prepare the API request (using o1-mini reasoning model)
    data = {
        "model": "o1-mini",
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "max_completion_tokens": 4000
    }
    
    # Make the API request
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(data).encode(),
        headers={
            "Authorization": f"Bearer {openai_key}",
            "Content-Type": "application/json"
        }
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode())
            content = result["choices"][0]["message"]["content"].strip()
            
            # Extract JSON from the response (in case there's extra text)
            if content.startswith("```json"):
                content = content[7:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            
            # Debug: print the actual content if JSON parsing fails
            try:
                return json.loads(content)
            except json.JSONDecodeError as json_err:
                print(f"AI Response was: {content[:500]}...")
                raise RuntimeError(f"AI returned invalid JSON: {json_err}")
            
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if hasattr(e, 'read') else str(e)
        raise RuntimeError(f"OpenAI API Error {e.code}: {error_body}")
    except Exception as e:
        raise RuntimeError(f"Failed to parse with AI: {e}")


def main() -> None:
    args = parse_args()
    input_path = Path(args.in_path)
    
    print(f"Processing file: {input_path}")
    
    # Load file content and parse with AI
    file_content = load_file(str(input_path))
    graph = ai_parse_file(file_content, str(input_path), args.openai_key)
    
    # Write output
    out_path = Path(args.out_path).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as handle:
        json.dump(graph, handle, indent=2)
    
    print(f"Graph written to: {out_path}")
    print(f"Found {len(graph['nodes'])} nodes and {len(graph['edges'])} edges")


if __name__ == "__main__":
    main()


