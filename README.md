# HackGT12

## Microservice JSON Schema
{
  "services": [
    {
      "id": "string",                    # Unique identifier
      "name": "string",                  # Display name
      "description": "string",           # What it does
      "type": "enum",                    # ecs | eks | lambda | ec2 | fargate | apigateway | queue | table | other

      "upstream_services": ["string"],   # Who calls this service
      "downstream_services": ["string"], # What this service calls
      "databases": ["string"],

      "traffic": {
        "requests_per_second": "number",
        "latency_ms": {
          "p50": "number",
          "p95": "number",
          "p99": "number"
        },
        "error_rate": {
          "4xx": "number",
          "5xx": "number"
        }
      },

      "health": {
        "uptime_percentage": "number",
        "status": "enum",                # healthy | degraded | down | unknown
        "cpu_percent": "number",
        "memory_percent": "number"
      },

      "security": {
        "endpoint_visibility": "enum",   # public | private
        "auth_method": "string"          # jwt | cognito | iam | none
      },

      "cost": {
        "monthly_estimate_usd": "number"
      },

      "last_deployment": "datetime"
    }
  ],

  "connections": [
    {
      "id": "string",
      "from": "string",                  # source service id
      "to": "string",                    # target service id
      "kind": "enum",                    # invoke | read | write | publish | trigger | other
      "sync": "boolean"
    }
  ],

  "meta": {
    "source": "string"                   # e.g., cdk, terraform, manual
  }
}