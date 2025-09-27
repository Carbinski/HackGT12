"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Check, Download } from "lucide-react"
import type { MicroserviceNode, ServiceConnection } from "@/lib/file-analyzer"

interface FullCdkGeneratorProps {
  services: MicroserviceNode[]
  connections: ServiceConnection[]
}

export function FullCdkGenerator({ services, connections }: FullCdkGeneratorProps) {
  const [copied, setCopied] = React.useState(false)

  const generateFullCdkCode = () => {
    const imports = new Set<string>()
    const serviceDefinitions: string[] = []
    const connectionDefinitions: string[] = []
    const outputs: string[] = []

    // Generate imports and service definitions
    services.forEach(service => {
      const serviceName = service.name.replace(/[^a-zA-Z0-9]/g, '')
      
      switch (service.technologies[0]) {
        case "Lambda":
          imports.add("import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';")
          imports.add("import { Duration } from 'aws-cdk-lib';")
          
          const runtime = service.runtime === "python" ? "Runtime.PYTHON_3_9" : 
                         service.runtime === "go" ? "Runtime.GO_1_X" : 
                         service.runtime === "java" ? "Runtime.JAVA_11" : 
                         service.runtime === "dotnet" ? "Runtime.DOTNET_6" : "Runtime.NODEJS_18_X"
          
          serviceDefinitions.push(`
// Lambda Function - ${service.name}
const ${serviceName}Function = new Function(this, '${serviceName}Function', {
  functionName: '${service.name}',
  runtime: ${runtime},
  handler: 'index.handler',
  code: Code.fromAsset('lambda/${service.name}'),
  memorySize: ${service.memoryMb || 512},
  timeout: Duration.seconds(${service.timeoutSec || 30}),
  environment: {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info'
  }
});`)
          break

        case "Table":
          imports.add("import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';")
          imports.add("import { RemovalPolicy, TableEncryption } from 'aws-cdk-lib';")
          
          const tableName = service.tableName || service.name
          const billingMode = service.billingMode === "PROVISIONED" ? "BillingMode.PROVISIONED" : "BillingMode.PAY_PER_REQUEST"
          
          serviceDefinitions.push(`
// DynamoDB Table - ${tableName}
const ${serviceName}Table = new Table(this, '${serviceName}Table', {
  tableName: '${tableName}',
  partitionKey: {
    name: 'id',
    type: AttributeType.STRING
  },
  sortKey: {
    name: 'createdAt',
    type: AttributeType.STRING
  },
  billingMode: ${billingMode},
  ${service.billingMode === "PROVISIONED" ? `
  readCapacity: 5,
  writeCapacity: 5,` : ''}
  removalPolicy: RemovalPolicy.DESTROY,
  pointInTimeRecovery: true,
  encryption: TableEncryption.AWS_MANAGED
});`)
          break

        case "Queue":
          imports.add("import { Queue } from 'aws-cdk-lib/aws-sqs';")
          imports.add("import { Duration } from 'aws-cdk-lib';")
          
          const queueSuffix = service.fifoQueue ? ".fifo" : ""
          
          serviceDefinitions.push(`
// SQS Queue - ${service.name}${queueSuffix}
const ${serviceName}Queue = new Queue(this, '${serviceName}Queue', {
  queueName: '${service.name}${queueSuffix}',
  visibilityTimeout: Duration.seconds(${service.visibilityTimeoutSec || 30}),
  messageRetentionPeriod: Duration.seconds(${service.messageRetentionSec || 345600}),
  ${service.fifoQueue ? `
  fifo: true,
  contentBasedDeduplication: ${service.contentBasedDeduplication || false},` : ''}
  deadLetterQueue: {
    queue: new Queue(this, '${serviceName}DLQ', {
      queueName: '${service.name}-dlq${queueSuffix}',
      retentionPeriod: Duration.days(14)
    }),
    maxReceiveCount: 3
  }
});`)
          break

        case "ApiGateway":
          imports.add("import { RestApi, LambdaIntegration, Cors } from 'aws-cdk-lib/aws-apigateway';")
          
          serviceDefinitions.push(`
// API Gateway - ${service.name}
const ${serviceName}Api = new RestApi(this, '${serviceName}Api', {
  restApiName: '${service.name} API',
  description: 'API Gateway for ${service.name}',
  defaultCorsPreflightOptions: {
    allowOrigins: Cors.ALL_ORIGINS,
    allowMethods: Cors.ALL_METHODS,
    allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key']
  }
});`)
          break
      }
    })

    // Generate connections and permissions
    connections.forEach(conn => {
      const fromService = services.find(s => s.id === conn.from)
      const toService = services.find(s => s.id === conn.to)
      
      if (!fromService || !toService) return
      
      const fromName = fromService.name.replace(/[^a-zA-Z0-9]/g, '')
      const toName = toService.name.replace(/[^a-zA-Z0-9]/g, '')
      
      switch (conn.type) {
        case "http":
          if (fromService.technologies[0] === "ApiGateway" && toService.technologies[0] === "Lambda") {
            connectionDefinitions.push(`
// API Gateway to Lambda connection
const ${fromName}Integration = new LambdaIntegration(${toName}Function);
const ${fromName}Resource = ${fromName}Api.root.addResource('${conn.endpoint || 'api'}');
${fromName}Resource.addMethod('${conn.method || 'GET'}', ${fromName}Integration);`)
          }
          break
          
        case "database":
          if (fromService.technologies[0] === "Lambda" && toService.technologies[0] === "Table") {
            imports.add("import { PolicyStatement } from 'aws-iam';")
            connectionDefinitions.push(`
// Lambda to DynamoDB permissions
${fromName}Function.addToRolePolicy(
  new PolicyStatement({
    actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:Scan'],
    resources: [${toName}Table.tableArn]
  })
);`)
          }
          break
          
        case "message":
          if (fromService.technologies[0] === "Lambda" && toService.technologies[0] === "Queue") {
            connectionDefinitions.push(`
// Lambda to SQS permissions
${fromName}Function.addToRolePolicy(
  new PolicyStatement({
    actions: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage'],
    resources: [${toName}Queue.queueArn]
  })
);
${toName}Queue.grantSendMessages(${fromName}Function);`)
          }
          break
      }
    })

    // Generate outputs
    services.forEach(service => {
      const serviceName = service.name.replace(/[^a-zA-Z0-9]/g, '')
      
      switch (service.technologies[0]) {
        case "Lambda":
          outputs.push(`new CfnOutput(this, '${serviceName}FunctionArn', {
  value: ${serviceName}Function.functionArn,
  exportName: '${serviceName}FunctionArn'
});`)
          break
        case "Table":
          outputs.push(`new CfnOutput(this, '${serviceName}TableName', {
  value: ${serviceName}Table.tableName,
  exportName: '${serviceName}TableName'
});`)
          break
        case "Queue":
          outputs.push(`new CfnOutput(this, '${serviceName}QueueUrl', {
  value: ${serviceName}Queue.queueUrl,
  exportName: '${serviceName}QueueUrl'
});`)
          break
        case "ApiGateway":
          outputs.push(`new CfnOutput(this, '${serviceName}ApiUrl', {
  value: ${serviceName}Api.url,
  exportName: '${serviceName}ApiUrl'
});`)
          break
      }
    })

    if (outputs.length > 0) {
      imports.add("import { CfnOutput } from 'aws-cdk-lib';")
    }

    return `import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
${Array.from(imports).join('\n')}

export class MicroservicesStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Service Definitions
${serviceDefinitions.join('\n')}

    // Connections and Permissions
${connectionDefinitions.join('\n')}

    // Outputs
${outputs.join('\n')}
  }
}`
  }

  const code = generateFullCdkCode()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/typescript' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'microservices-stack.ts'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Complete CDK Stack</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="flex items-center gap-2"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
            
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 text-sm text-muted-foreground">
          Complete CDK stack with {services.length} services and {connections.length} connections
        </div>
        <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm max-h-96">
          <code>{code}</code>
        </pre>
      </CardContent>
    </Card>
  )
}
