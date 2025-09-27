"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "lucide-react"

interface CodeSnippetProps {
  serviceType: string
  serviceName?: string
  runtime?: string
  memoryMb?: number
  timeoutSec?: number
  routePath?: string
  routeMethod?: string
  tableName?: string
  billingMode?: string
  visibilityTimeoutSec?: number
  messageRetentionSec?: number
  fifoQueue?: boolean
  contentBasedDeduplication?: boolean
}

export function CodeSnippet({ 
  serviceType, 
  serviceName, 
  runtime = "nodejs",
  memoryMb = 512,
  timeoutSec = 30,
  routePath = "/",
  routeMethod = "GET",
  tableName,
  billingMode = "PAY_PER_REQUEST",
  visibilityTimeoutSec = 30,
  messageRetentionSec = 345600,
  fifoQueue = false,
  contentBasedDeduplication = false
}: CodeSnippetProps) {
  const [copied, setCopied] = React.useState(false)

  const getCodeSnippet = (type: string, name?: string) => {
    const finalServiceName = name || `my-${type.toLowerCase()}`
    
    switch (type) {
      case "Lambda":
        const lambdaRuntime = runtime === "python" ? "Runtime.PYTHON_3_9" : 
                             runtime === "go" ? "Runtime.GO_1_X" : 
                             runtime === "java" ? "Runtime.JAVA_11" : 
                             runtime === "dotnet" ? "Runtime.DOTNET_6" : "Runtime.NODEJS_18_X"
        
        return `// CDK Lambda Function - ${finalServiceName}
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';

// Create Lambda function
const ${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Function = new Function(this, '${finalServiceName}Function', {
  functionName: '${finalServiceName}',
  runtime: ${lambdaRuntime},
  handler: 'index.handler',
  code: Code.fromAsset('lambda/${finalServiceName}'),
  memorySize: ${memoryMb},
  timeout: Duration.seconds(${timeoutSec}),
  environment: {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info'
  }
});

// Grant permissions (example)
// ${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Function.addToRolePolicy(
//   new PolicyStatement({
//     actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
//     resources: ['arn:aws:dynamodb:*:*:table/*']
//   })
// );`

      case "Table":
        const finalTableName = tableName || finalServiceName
        const billingModeEnum = billingMode === "PROVISIONED" ? "BillingMode.PROVISIONED" : "BillingMode.PAY_PER_REQUEST"
        return `// CDK DynamoDB Table - ${finalTableName}
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';

// Create DynamoDB table
const ${finalTableName.replace(/[^a-zA-Z0-9]/g, '')}Table = new Table(this, '${finalTableName}Table', {
  tableName: '${finalTableName}',
  partitionKey: {
    name: 'id',
    type: AttributeType.STRING
  },
  sortKey: {
    name: 'createdAt',
    type: AttributeType.STRING
  },
  billingMode: ${billingModeEnum},
  ${billingMode === "PROVISIONED" ? `
  readCapacity: 5,
  writeCapacity: 5,` : ''}
  removalPolicy: RemovalPolicy.DESTROY, // Change to RETAIN for production
  pointInTimeRecovery: true,
  encryption: TableEncryption.AWS_MANAGED
});

// Add Global Secondary Index (example)
// ${finalTableName.replace(/[^a-zA-Z0-9]/g, '')}Table.addGlobalSecondaryIndex({
//   indexName: 'GSI1',
//   partitionKey: {
//     name: 'gsi1pk',
//     type: AttributeType.STRING
//   },
//   sortKey: {
//     name: 'gsi1sk',
//     type: AttributeType.STRING
//   }
// });

// Export table name for use in Lambda functions
// new CfnOutput(this, '${finalTableName}TableName', {
//   value: ${finalTableName.replace(/[^a-zA-Z0-9]/g, '')}Table.tableName,
//   exportName: '${finalTableName}TableName'
// });`

      case "Queue":
        const queueSuffix = fifoQueue ? ".fifo" : ""
        return `// CDK SQS Queue - ${finalServiceName}${queueSuffix}
import { Queue, QueueProps } from 'aws-cdk-lib/aws-sqs';
import { Duration } from 'aws-cdk-lib';

// Create SQS queue
const ${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Queue = new Queue(this, '${finalServiceName}Queue', {
  queueName: '${finalServiceName}${queueSuffix}',
  visibilityTimeout: Duration.seconds(${visibilityTimeoutSec}),
  messageRetentionPeriod: Duration.seconds(${messageRetentionSec}),
  ${fifoQueue ? `
  fifo: true,
  contentBasedDeduplication: ${contentBasedDeduplication},` : ''}
  deadLetterQueue: {
    queue: new Queue(this, '${finalServiceName}DLQ', {
      queueName: '${finalServiceName}-dlq${queueSuffix}',
      retentionPeriod: Duration.days(14)
    }),
    maxReceiveCount: 3
  }
});

// Grant permissions to Lambda function (example)
// ${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Queue.grantSendMessages(${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Function);
// ${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Queue.grantConsumeMessages(${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Function);

// Export queue URL for use in Lambda functions
// new CfnOutput(this, '${finalServiceName}QueueUrl', {
//   value: ${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Queue.queueUrl,
//   exportName: '${finalServiceName}QueueUrl'
// });`

      case "ApiGateway":
        return `// CDK API Gateway - ${finalServiceName}
import { RestApi, LambdaIntegration, Cors } from 'aws-cdk-lib/aws-apigateway';
import { Function } from 'aws-cdk-lib/aws-lambda';

// Create REST API
const ${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Api = new RestApi(this, '${finalServiceName}Api', {
  restApiName: '${finalServiceName} API',
  description: 'API Gateway for ${finalServiceName}',
  defaultCorsPreflightOptions: {
    allowOrigins: Cors.ALL_ORIGINS,
    allowMethods: Cors.ALL_METHODS,
    allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key']
  }
});

// Create Lambda integration
const ${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Integration = new LambdaIntegration(${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Function, {
  requestTemplates: { 'application/json': '{ "statusCode": "200" }' }
});

// Add resource and method
const ${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Resource = ${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Api.root.addResource('${routePath.replace(/^\//, '')}');
${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Resource.addMethod('${routeMethod}', ${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Integration);

// Add CORS method (if needed)
// ${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Resource.addMethod('OPTIONS', new MockIntegration({
//   integrationResponses: [{
//     statusCode: '200',
//     responseParameters: {
//       'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
//       'method.response.header.Access-Control-Allow-Origin': "'*'",
//       'method.response.header.Access-Control-Allow-Methods': "'${routeMethod},OPTIONS'"
//     }
//   }]
// }));

// Export API URL
// new CfnOutput(this, '${finalServiceName}ApiUrl', {
//   value: ${finalServiceName.replace(/[^a-zA-Z0-9]/g, '')}Api.url,
//   exportName: '${finalServiceName}ApiUrl'
// });`

      default:
        return `// ${type} Service
// Add your ${type} implementation here
console.log('${serviceName} service initialized');`
    }
  }

  const code = getCodeSnippet(serviceType, serviceName)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Code Snippet - {serviceType}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="flex items-center gap-2"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy Code
              </>
            )}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
          <code>{code}</code>
        </pre>
      </CardContent>
    </Card>
  )
}
