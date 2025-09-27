// Graph mapper to convert our AI-generated graph to UI format
import type { MicroserviceNode, ServiceConnection } from "./file-analyzer"

export interface AiGraphNode {
  id: string
  type: "Lambda" | "Table" | "Queue" | "Topic" | "ApiGateway" | "StepFn"
  label?: string
  props: Record<string, any>
}

export interface AiGraphEdge {
  id: string
  from: string
  to: string
  kind: "invoke" | "publish" | "write" | "read" | "trigger"
  sync?: boolean
}

export interface AiGraph {
  nodes: AiGraphNode[]
  edges: AiGraphEdge[]
  meta?: Record<string, any>
}

// Map AI graph node types to UI service types
const NODE_TYPE_MAPPING: Record<string, MicroserviceNode["type"]> = {
  "Lambda": "compute",
  "Table": "database", 
  "Queue": "queue",
  "Topic": "message",
  "ApiGateway": "api",
  "StepFn": "stepfn"
}

// Map AI graph edge kinds to UI connection types
const EDGE_KIND_MAPPING: Record<string, ServiceConnection["type"]> = {
  "invoke": "http",
  "publish": "message",
  "write": "database",
  "read": "database", 
  "trigger": "message"
}

export function mapAiGraphToUiFormat(aiGraph: AiGraph): {
  services: MicroserviceNode[]
  connections: ServiceConnection[]
} {
  // Accept alternative shapes and guard against undefined
  const fallbackServices = (aiGraph as any)?.services as MicroserviceNode[] | undefined
  const fallbackConnections = (aiGraph as any)?.connections as ServiceConnection[] | undefined

  // Prefer nodes/edges from AI graph; fall back if provided in UI format already
  const nodes: AiGraphNode[] = Array.isArray((aiGraph as any)?.nodes)
    ? ((aiGraph as any).nodes as AiGraphNode[])
    : []
  const edges: AiGraphEdge[] = Array.isArray((aiGraph as any)?.edges)
    ? ((aiGraph as any).edges as AiGraphEdge[])
    : []

  // If the input is already in UI format, just return it as-is
  if ((!nodes || nodes.length === 0) && Array.isArray(fallbackServices) && Array.isArray(fallbackConnections)) {
    return {
      services: fallbackServices,
      connections: fallbackConnections,
    }
  }

  // Convert nodes (safe)
  const services: MicroserviceNode[] = (nodes || []).map(node => {
    const uiNode: MicroserviceNode = {
      id: node.id,
      name: node.label || node.id,
      type: NODE_TYPE_MAPPING[node.type] || "external",
      path: `/services/${node.id}`,
      dependencies: [],
      technologies: [node.type],
      description: generateDescription(node)
    }

    // Add type-specific properties (with null checks)
    if (node.type === "Lambda") {
      if (node.props?.timeoutMs) {
        uiNode.description += ` (${node.props.timeoutMs}ms timeout)`
        uiNode.timeoutSec = Math.round(Number(node.props.timeoutMs) / 1000)
      }
      if (node.props?.memorySize) {
        uiNode.memoryMb = Number(node.props.memorySize)
      }
      if (node.props?.runtime) {
        const rt = String(node.props.runtime).toLowerCase()
        // Normalize runtime
        uiNode.runtime = rt.includes("python") ? "python" : rt.includes("node") ? "nodejs" : rt.includes("java") ? "java" : rt.includes("go") ? "go" : rt.includes("dotnet") ? "dotnet" : undefined
      }
    }
    if (node.type === "Queue") {
      if (node.props?.visibilityTimeoutSec != null) {
        uiNode.visibilityTimeoutSec = Number(node.props.visibilityTimeoutSec)
      }
      if (node.props?.messageRetentionSec != null) {
        uiNode.messageRetentionSec = Number(node.props.messageRetentionSec)
      }
      if (node.props?.fifoQueue != null) {
        uiNode.fifoQueue = Boolean(node.props.fifoQueue)
      }
      if (node.props?.contentBasedDeduplication != null) {
        uiNode.contentBasedDeduplication = Boolean(node.props.contentBasedDeduplication)
      }
    }
    
    if (node.type === "ApiGateway") {
      uiNode.endpoints = [`/${node.id.toLowerCase()}`]
      uiNode.port = 443
    }

    if (node.type === "Table") {
      if (node.label) {
        uiNode.tableName = node.label
      }
      if (node.props?.billingMode) {
        uiNode.billingMode = String(node.props.billingMode)
      }
    }

    if (node.props?.retentionDays) {
      uiNode.description += ` (${node.props.retentionDays} days retention)`
    }

    return uiNode
  })

  // Convert edges to connections (safe)
  const connections: ServiceConnection[] = (edges || []).map(edge => {
    const connection: ServiceConnection = {
      from: edge.from,
      to: edge.to,
      type: EDGE_KIND_MAPPING[edge.kind] || "http"
    }

    // Add edge-specific details
    if (edge.kind === "invoke") {
      connection.method = "POST"
      connection.endpoint = `/${edge.to.toLowerCase()}`
    }

    return connection
  })

  // Update dependencies based on connections
  services.forEach(service => {
    service.dependencies = connections
      .filter(conn => conn.from === service.id)
      .map(conn => conn.to)
  })

  return { services, connections }
}

function generateDescription(node: AiGraphNode): string {
  const descriptions: Record<string, string> = {
    "Lambda": "AWS Lambda Function - Serverless compute service",
    "Table": "DynamoDB Table - NoSQL database",
    "Queue": "SQS Queue - Message queue service", 
    "Topic": "SNS Topic - Notification service",
    "ApiGateway": "API Gateway - HTTP API endpoint",
    "StepFn": "Step Functions - Workflow orchestration"
  }

  let desc = descriptions[node.type] || "AWS Service"
  
  // Add optional properties with null checks
  if (node.props?.billingMode) {
    desc += ` (${node.props.billingMode})`
  }
  
  if (node.props?.memorySize) {
    desc += ` (${node.props.memorySize}MB)`
  }
  
  return desc
}

export async function loadGraphFromFile(filePath: string): Promise<AiGraph> {
  console.log(`🔍 Attempting to fetch graph from: ${filePath}`)
  
  try {
    const response = await fetch(filePath)
    console.log(`📡 Response status: ${response.status} ${response.statusText}`)
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`❌ Graph file not found at ${filePath}. Make sure:\n1. The file exists in the public folder\n2. The app is running on the correct port\n3. Try refreshing the page`)
      }
      throw new Error(`❌ Failed to load graph: ${response.status} ${response.statusText}`)
    }
    
    const rawData = await response.json()
    console.log(`📥 Raw data loaded, checking structure...`)
    
    // Handle different graph file structures - combine both approaches
    let graphData: AiGraph
    
    if (rawData.nodes && rawData.edges) {
      // Direct AiGraph format
      graphData = rawData
    } else if (rawData.graph?.nodes && rawData.graph?.edges) {
      // Nested under 'graph' key (like graph_v4_final.json)
      graphData = {
        nodes: rawData.graph.nodes,
        edges: rawData.graph.edges,
        meta: rawData.meta || {}
      }
    } else if (rawData.result?.nodes && rawData.result?.edges) {
      // Nested under 'result' key
      graphData = {
        nodes: rawData.result.nodes,
        edges: rawData.result.edges,
        meta: rawData.meta || {}
      }
    } else if (rawData.causalityGraph?.nodes && rawData.causalityGraph?.edges) {
      // Nested under 'causalityGraph' key
      graphData = {
        nodes: rawData.causalityGraph.nodes,
        edges: rawData.causalityGraph.edges,
        meta: rawData.meta || {}
      }
    } else if (rawData.cdkResult?.graph?.nodes) {
      // CDK result format: { cdkResult: { graph: { nodes, edges } } }
      graphData = rawData.cdkResult.graph
    } else if (rawData.cdkResult?.nodes) {
      // CDK result format: { cdkResult: { nodes, edges } }
      graphData = rawData.cdkResult
    } else {
      throw new Error(`❌ Invalid graph format. Expected nodes and edges arrays but found: ${Object.keys(rawData).join(', ')}`)
    }
    
    console.log(`✅ Graph data loaded successfully! Found ${graphData.nodes?.length || 0} nodes and ${graphData.edges?.length || 0} edges`)
    return graphData
  } catch (error) {
    console.error("❌ Error loading graph:", error)
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('🌐 Network error: Unable to fetch the graph file. Make sure the development server is running on http://localhost:3000')
    }
    
    throw error
  }
}
