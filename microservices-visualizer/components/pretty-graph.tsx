"use client"

import { useEffect, useRef, useState } from "react"
import * as d3 from "d3-force"
import { select, type Selection } from "d3-selection"
import { zoom, zoomIdentity, zoomTransform } from "d3-zoom"
import { drag } from "d3-drag"
import { Button } from "@/components/ui/button"
import type { MicroserviceNode, ServiceConnection } from "@/lib/file-analyzer"
import { 
  Database, 
  Zap, 
  MessageSquare, 
  Globe, 
  Workflow,
  Cloud
} from "lucide-react"
import gsap from "gsap"

interface PrettyGraphProps {
  services: MicroserviceNode[]
  connections: ServiceConnection[]
  onNodeSelect?: (node: MicroserviceNode | null) => void
  runId?: number
}

// Service type colors based on AWS architecture patterns
const SERVICE_COLORS = {
  "api": "#3b82f6",        // Blue - API Gateway, Load Balancers
  "compute": "#10b981",    // Green - Lambda, EC2, ECS
  "database": "#8b5cf6",   // Purple - DynamoDB, RDS, DocumentDB
  "queue": "#f59e0b",      // Orange - SQS, SNS, EventBridge
  "storage": "#ef4444",    // Red - S3, EFS, EBS
  "cache": "#06b6d4",      // Cyan - ElastiCache, MemoryDB
  "message": "#818cf8",    // Indigo - SNS, SES
  "stepfn": "#f472b6",     // Pink - Step Functions
  "monitoring": "#84cc16", // Lime - CloudWatch, X-Ray
  "security": "#f97316",   // Orange - IAM, Secrets Manager, Cognito
  "external": "#64748b"    // Gray - External services
}

interface GraphNode extends MicroserviceNode {
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface GraphLink extends ServiceConnection {
  source: GraphNode
  target: GraphNode
}

// AWS service type mapping for better architectural organization
const AWS_SERVICE_MAPPING = {
  // API & Ingress Layer
  "API Gateway": "api",
  "Application Load Balancer": "api",
  "CloudFront": "api",
  
  // Compute Layer
  "Lambda": "compute",
  "EC2": "compute", 
  "ECS": "compute",
  "EKS": "compute",
  "Fargate": "compute",
  "App Runner": "compute",
  
  // Data Layer
  "DynamoDB": "database",
  "RDS": "database",
  "DocumentDB": "database",
  "Neptune": "database",
  "Timestream": "database",
  "Table": "database",
  
  // Storage Layer
  "S3": "storage",
  "EFS": "storage",
  "FSx": "storage",
  
  // Cache Layer
  "ElastiCache": "cache",
  "MemoryDB": "cache",
  "DAX": "cache",
  
  // Messaging & Event Layer
  "SQS": "queue",
  "SNS": "message", 
  "EventBridge": "queue",
  "Kinesis": "queue",
  "MSK": "queue",
  "Queue": "queue",
  "Topic": "message",
  
  // Orchestration Layer
  "Step Functions": "stepfn",
  "SWF": "stepfn",
  
  // Monitoring & Observability
  "CloudWatch": "monitoring",
  "X-Ray": "monitoring",
  "CloudTrail": "monitoring",
  
  // Security & Identity
  "IAM": "security",
  "Cognito": "security",
  "Secrets Manager": "security",
  "Systems Manager": "security"
}

// Function to determine service type based on AWS service or technology
function getServiceType(node: MicroserviceNode): string {
  // Check if it's an AWS service type from CDK scanning
  if (node.type && (AWS_SERVICE_MAPPING as any)[node.type]) {
    return (AWS_SERVICE_MAPPING as any)[node.type]
  }
  
  // Check technologies array for AWS services
  if (node.technologies) {
    for (const tech of node.technologies) {
      if ((AWS_SERVICE_MAPPING as any)[tech]) {
        return (AWS_SERVICE_MAPPING as any)[tech]
      }
    }
  }
  
  // Fallback to original logic for traditional microservices
  const originalType = node.type
  if (["api", "compute", "database", "queue", "storage", "cache", "message", "stepfn", "monitoring", "security"].includes(originalType)) {
    return originalType
  }
  
  // Default fallback based on name patterns
  if (node.name?.toLowerCase().includes('api') || node.name?.toLowerCase().includes('gateway')) return "api"
  if (node.name?.toLowerCase().includes('lambda') || node.name?.toLowerCase().includes('function')) return "compute"
  if (node.name?.toLowerCase().includes('table') || node.name?.toLowerCase().includes('db')) return "database"
  if (node.name?.toLowerCase().includes('queue') || node.name?.toLowerCase().includes('sqs')) return "queue"
  if (node.name?.toLowerCase().includes('topic') || node.name?.toLowerCase().includes('sns')) return "message"
  if (node.name?.toLowerCase().includes('cache') || node.name?.toLowerCase().includes('redis')) return "cache"
  
  return "compute" // Default to compute layer
}

export function PrettyGraph({ services, connections, onNodeSelect, runId }: PrettyGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null)
  const zoomBehaviorRef = useRef<any>(null)
  const containerRef = useRef<SVGGElement | null>(null)
  const selectedNodeRef = useRef<string | null>(null)
  const nodesRef = useRef<GraphNode[]>([])
  const linksRef = useRef<GraphLink[]>([])
  const linkSelRef = useRef<any>(null)
  const nodeSelRef = useRef<any>(null)
  const isAnimatingRef = useRef<boolean>(false)
  const gsapTweensRef = useRef<any[]>([])

  // Keep ref in sync without reinitializing the graph
  useEffect(() => {
    selectedNodeRef.current = selectedNode
  }, [selectedNode])

  useEffect(() => {
    if (!svgRef.current || services.length === 0) return

    const svg = select(svgRef.current)
    svg.selectAll("*").remove()

    const width = 800
    const height = 600

    // Setup zoom with throttling for better performance
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 2])  // Reduced range for stability
      .filter((event) => {
        // Prevent zoom on drag operations
        // Disable double-click zoom and ctrlKey interactions
        return event.type !== "dblclick" && !event.ctrlKey && !event.button
      })
      .on("zoom", (event) => {
        // Throttle zoom updates for better performance
        requestAnimationFrame(() => {
          container.attr("transform", event.transform)
        })
      })

    svg.call(zoomBehavior)
    // Disable default double-click to zoom to prevent accidental jumps
    svg.on("dblclick.zoom", null)
    zoomBehaviorRef.current = zoomBehavior

    const container = svg.append("g")
    containerRef.current = container.node() as SVGGElement

    // Create graph data
    const nodes: GraphNode[] = services.map(s => ({ ...s }))
    
    console.log('🔗 UI Graph Data Debug:')
    console.log('   Available nodes:', nodes.map(n => ({ id: n.id, name: n.name })))
    console.log('   Connection requests:', connections.map(c => ({ from: c.from, to: c.to, type: c.type })))
    
    const links: GraphLink[] = connections.map(c => {
      const source = nodes.find(n => n.id === c.from)
      const target = nodes.find(n => n.id === c.to)
      
      if (!source) {
        console.warn(`❌ UI: Could not find source node for edge: ${c.from} → ${c.to}`)
        console.warn(`   Available node IDs:`, nodes.map(n => n.id))
      }
      if (!target) {
        console.warn(`❌ UI: Could not find target node for edge: ${c.from} → ${c.to}`)
        console.warn(`   Available node IDs:`, nodes.map(n => n.id))
      }
      
      return {
        ...c,
        source: source!,
        target: target!
      }
    }).filter(l => {
      const isValid = l.source && l.target
      if (!isValid) {
        console.warn(`🚫 UI: Dropping broken link: ${l.from} → ${l.to} (missing endpoints)`)
      } else {
        console.log(`✅ UI: Valid link: ${l.source.name} → ${l.target.name} (${l.type})`)
      }
      return isValid
    })
    
    console.log(`📊 UI Graph Summary: ${nodes.length} nodes, ${links.length}/${connections.length} valid links`)

    nodesRef.current = nodes
    linksRef.current = links

    // Calculate node connectivity for intelligent spacing
    const nodeConnectivity = new Map<string, number>()
    nodes.forEach(node => {
      const connectionCount = links.filter(link => 
        link.source.id === node.id || link.target.id === node.id
      ).length
      nodeConnectivity.set(node.id, connectionCount)
    })

    // Hierarchical positioning - logical architectural layers from top to bottom
    const initializePositions = (nodes: GraphNode[]) => {
      // Define architectural layers following data flow patterns
      const layers: Record<string, number> = {
        api: 0.08,        // API Layer - Entry points (API Gateway, ALB)
        security: 0.15,   // Security Layer - Auth, IAM (close to API)
        compute: 0.25,    // Compute Layer - Business logic (Lambda, EC2)
        stepfn: 0.35,     // Orchestration Layer - Workflow management
        queue: 0.50,      // Event/Message Layer - Async communication
        message: 0.50,    // Message Layer - Same level as queues
        cache: 0.65,      // Cache Layer - Performance optimization
        storage: 0.75,    // Storage Layer - File storage
        database: 0.85,   // Data Layer - Persistent data
        monitoring: 0.95, // Observability Layer - Monitoring at bottom
        external: 0.40    // External services - Mid-level integration
      }
      
      // Group nodes by their determined architectural type
      const servicesByType: Record<string, GraphNode[]> = {}
      nodes.forEach(node => {
        const nodeType = getServiceType(node)
        if (!servicesByType[nodeType]) servicesByType[nodeType] = []
        servicesByType[nodeType].push(node)
      })
      
      // Position each type in its layer with intelligent spacing based on connectivity
      Object.entries(servicesByType).forEach(([type, typeNodes]) => {
        const y = (layers[type] || 0.5) * height
        
        // Sort nodes by connectivity (most connected in center for better line distribution)
        const sortedNodes = typeNodes.sort((a, b) => {
          const aConnections = nodeConnectivity.get(a.id) || 0
          const bConnections = nodeConnectivity.get(b.id) || 0
          return bConnections - aConnections // Descending order
        })
        
        // Calculate dynamic spacing based on connectivity
        const baseSpacing = 180
        const maxConnections = Math.max(...Array.from(nodeConnectivity.values()))
        
        let totalWidth = 0
        const nodePositions: number[] = []
        
        sortedNodes.forEach((node, i) => {
          const connections = nodeConnectivity.get(node.id) || 0
          // Highly connected nodes get more space around them
          const connectionMultiplier = 1 + (connections / maxConnections) * 0.8
          const nodeSpacing = baseSpacing * connectionMultiplier
          
          if (i === 0) {
            nodePositions.push(0)
          } else {
            nodePositions.push(nodePositions[i - 1] + nodeSpacing)
            totalWidth = nodePositions[i]
          }
        })
        
        // Center the entire group
        const startX = (width - totalWidth) / 2
        
        sortedNodes.forEach((node, i) => {
          node.x = sortedNodes.length === 1 ? width / 2 : startX + nodePositions[i]
          node.y = y
          // Lock initial positions to prevent chaos
          node.fx = node.x
          node.fy = node.y
        })
      })
      
      // Release fixed positions after a short delay to allow gentle settling
      setTimeout(() => {
        nodes.forEach(node => {
          node.fx = null
          node.fy = null
        })
      }, 1000)
    }
    
    initializePositions(nodes)

    // Create gentle simulation that maintains hierarchical layout with intelligent spacing
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150).strength(0.3))  // Gentler links
      .force("charge", d3.forceManyBody().strength(-100))  // Reduced repulsion for stability
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.1))  // Weak centering
      .force("collision", d3.forceCollide().radius((d: any) => {
        // Dynamic collision radius based on connectivity
        const connections = nodeConnectivity.get(d.id) || 0
        const maxConnections = Math.max(...Array.from(nodeConnectivity.values()))
        const baseRadius = 90
        const connectivityMultiplier = 1 + (connections / maxConnections) * 0.5
        return baseRadius * connectivityMultiplier
      }))  // Variable collision based on connectivity
      .force("y", d3.forceY().y(d => {  // Keep nodes in their architectural layers
        const nodeType = getServiceType(d as GraphNode)
        const layers: Record<string, number> = {
          api: 0.08, security: 0.15, compute: 0.25, stepfn: 0.35, queue: 0.50, 
          message: 0.50, cache: 0.65, storage: 0.75, database: 0.85, 
          monitoring: 0.95, external: 0.40
        }
        return (layers[nodeType] || 0.5) * height
      }).strength(1.2))
      .alpha(0.2)  // Lower starting energy
      .alphaDecay(0.02)  // Slower decay for gentle settling

    simulationRef.current = simulation

    // Improved arrow markers for better visibility
    const defs = container.append("defs")
    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 35)  // Position arrow at edge of node
      .attr("refY", 0)
      .attr("markerWidth", 8)  // Slightly larger
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4L2,0Z")  // Better arrow shape
      .attr("fill", "#475569")
      .attr("stroke", "#475569")
      .attr("stroke-width", 1)

    // Edge glow filter for run animation
    const glow = defs.append("filter")
      .attr("id", "edgeGlow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%")
    glow.append("feGaussianBlur")
      .attr("stdDeviation", 4)
      .attr("result", "coloredBlur")
    const feMerge = glow.append("feMerge")
    feMerge.append("feMergeNode").attr("in", "coloredBlur")
    feMerge.append("feMergeNode").attr("in", "SourceGraphic")

    // Create enhanced links with different styles for different connection types
    const link = container.append("g")
      .selectAll("line")
      .data(links)
      .enter().append("line")
      .attr("stroke", d => {
        // Different colors for different connection types
        const connectionColors: Record<string, string> = {
          "http": "#3b82f6",     // Blue for HTTP calls
          "grpc": "#8b5cf6",     // Purple for gRPC
          "message": "#f59e0b",  // Orange for messaging
          "event": "#10b981",    // Green for events
          "database": "#ef4444", // Red for database
          "cache": "#06b6d4",    // Cyan for cache
          "invoke": "#84cc16",   // Lime for direct invocation
          "stream": "#f472b6",   // Pink for streaming
          "sync": "#64748b",     // Gray for sync
          "async": "#f59e0b"     // Orange for async
        }
        return connectionColors[d.type] || "#64748b"
      })
      .attr("stroke-width", d => {
        // Different widths for different connection types
        const asyncConnections = ["message", "event", "async", "stream"]
        return asyncConnections.includes(d.type) ? 3 : 2
      })
      .attr("stroke-opacity", 0.7)
      .attr("stroke-dasharray", d => {
        // Dashed lines for async connections
        const asyncConnections = ["message", "event", "async", "stream"]
        return asyncConnections.includes(d.type) ? "5,5" : null
      })
      .attr("marker-end", "url(#arrowhead)")

    linkSelRef.current = link

    // Create nodes
    const node = container.append("g")
      .selectAll("g")
      .data(nodes)
      .enter().append("g")
      .attr("class", "node")
      .style("cursor", "pointer")
      .call(drag<SVGGElement, GraphNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on("drag", (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
      )

    nodeSelRef.current = node

    // Node squares with AWS service icons
    node.append("rect")
      .attr("width", 60)
      .attr("height", 60)
      .attr("x", -30)
      .attr("y", -30)
      .attr("rx", 8)
      .attr("fill", "#ffffff")
      .attr("stroke", d => {
        const serviceType = getServiceType(d)
        return SERVICE_COLORS[serviceType as keyof typeof SERVICE_COLORS] || "#6b7280"
      })
      .attr("stroke-width", 3)
      .style("filter", "drop-shadow(0 4px 8px rgba(0,0,0,0.1))")

    // AWS service icons
    node.append("image")
      .attr("x", -20)
      .attr("y", -20)
      .attr("width", 40)
      .attr("height", 40)
      .attr("href", d => {
        // Map service types to AWS icons based on architectural layers
        const iconMap: Record<string, string> = {
          "api": "/aws-icons/Arch_Amazon-API-Gateway_64.svg",
          "compute": "/aws-icons/Arch_AWS-Lambda_64.svg",
          "database": "/aws-icons/Arch_Amazon-DynamoDB_64.svg",
          "queue": "/aws-icons/Arch_Amazon-EventBridge_64.svg",
          "message": "/aws-icons/Arch_Amazon-EventBridge_64.svg",
          "stepfn": "/aws-icons/Arch_AWS-Step-Functions_64.svg",
          "cache": "/aws-icons/Arch_Amazon-DynamoDB_64.svg", // Use DynamoDB icon for cache
          "storage": "/aws-icons/Arch_Amazon-DynamoDB_64.svg", // Use DynamoDB icon for storage
          "monitoring": "/aws-icons/Arch_Amazon-DynamoDB_64.svg", // Use DynamoDB icon for monitoring
          "security": "/aws-icons/Arch_Amazon-DynamoDB_64.svg", // Use DynamoDB icon for security
          "external": "/aws-icons/Arch_AWS-Lambda_64.svg"
        }
        
        const serviceType = getServiceType(d)
        return iconMap[serviceType] || "/aws-icons/Arch_AWS-Lambda_64.svg"
      })

    // Node labels
    node.append("text")
      .attr("dy", 50)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .attr("fill", "#1e293b")
      .text(d => d.name || d.id)

    // Technology labels showing architectural layer
    node.append("text")
      .attr("dy", 65)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("fill", "#64748b")
      .text(d => {
        const serviceType = getServiceType(d)
        const layerNames: Record<string, string> = {
          api: "API Layer",
          security: "Security",
          compute: "Compute",
          stepfn: "Orchestration",
          queue: "Events",
          message: "Messaging",
          cache: "Cache",
          storage: "Storage",
          database: "Data",
          monitoring: "Monitoring",
          external: "External"
        }
        return layerNames[serviceType] || serviceType
      })

    // Click handler for nodes
    node.on("click", (event, d) => {
      event.stopPropagation()
      const nextSelected = selectedNodeRef.current === d.id ? null : d.id
      selectedNodeRef.current = nextSelected
      setSelectedNode(nextSelected)
      onNodeSelect?.(nextSelected ? d : null)
      
      // Highlight connected nodes
      const connectedNodes = new Set([d.id])
      links.forEach(l => {
        if (l.source.id === d.id || l.target.id === d.id) {
          connectedNodes.add(l.source.id)
          connectedNodes.add(l.target.id)
        }
      })

      // Update node styling
      node.selectAll("rect")
        .attr("stroke-width", (n: any) => connectedNodes.has(n.id) ? 5 : 3)
        .attr("stroke", (n: any) => connectedNodes.has(n.id) ? "#14b8a6" : "#ffffff")

      // Update link styling with preserved connection colors
      link.attr("stroke", l => {
        if (l.source.id === d.id || l.target.id === d.id) {
          return "#14b8a6" // Highlight color
        }
        // Return original connection color
        const connectionColors: Record<string, string> = {
          "http": "#3b82f6", "grpc": "#8b5cf6", "message": "#f59e0b", "event": "#10b981",
          "database": "#ef4444", "cache": "#06b6d4", "invoke": "#84cc16", "stream": "#f472b6",
          "sync": "#64748b", "async": "#f59e0b"
        }
        return connectionColors[l.type] || "#64748b"
      }).attr("stroke-width", l => {
        const isHighlighted = l.source.id === d.id || l.target.id === d.id
        const asyncConnections = ["message", "event", "async", "stream"]
        const baseWidth = asyncConnections.includes(l.type) ? 3 : 2
        return isHighlighted ? baseWidth + 1 : baseWidth
      })

      // Smoothly center the view on the clicked node at a comfortable scale
      try {
        const zb = zoomBehaviorRef.current
        if (zb && svgRef.current) {
          const svgSel = select(svgRef.current)
          const current = zoomTransform(svgRef.current as any)
          const desiredScale = Math.max(0.9, Math.min(1.5, current.k))
          svgSel
            .transition()
            .duration(350)
            .call(zb.scaleTo, desiredScale)
            .transition()
            .duration(350)
            .call(zb.translateTo, d.x!, d.y!)
        }
      } catch {}
    })

    // Background click to clear selection
    svg.on("click", () => {
      setSelectedNode(null)
      onNodeSelect?.(null)
      selectedNodeRef.current = null
      node.selectAll("rect")
        .attr("stroke-width", 3)
        .attr("stroke", (d: any) => {
          const serviceType = getServiceType(d as MicroserviceNode)
          return SERVICE_COLORS[serviceType as keyof typeof SERVICE_COLORS] || "#6b7280"
        })
      
      // Reset links to their original colors and widths
      link.attr("stroke", l => {
        const connectionColors: Record<string, string> = {
          "http": "#3b82f6", "grpc": "#8b5cf6", "message": "#f59e0b", "event": "#10b981",
          "database": "#ef4444", "cache": "#06b6d4", "invoke": "#84cc16", "stream": "#f472b6",
          "sync": "#64748b", "async": "#f59e0b"
        }
        return connectionColors[l.type] || "#64748b"
      }).attr("stroke-width", l => {
        const asyncConnections = ["message", "event", "async", "stream"]
        return asyncConnections.includes(l.type) ? 3 : 2
      })
    })

    // Simplified auto-fit with reduced complexity + parallel-line de-overlap
    let autoFitApplied = false
    simulation.on("tick", () => {
      // Group near-parallel lines in the same corridor and offset them perpendicularly
      const angleBucketSizeDeg = 12 // angle grouping for corridor bundling
      const regionBucketSizePx = 90 // spatial bucket to detect shared corridors
      const spacingPx = 10 // spacing between parallel lines in corridor
      const endpointSpacingPx = 8 // spacing applied near node endpoints

      // Build grouping map: angle bucket + midpoint bucket -> links[]
      const groups = new Map<string, GraphLink[]>()
      for (const l of links) {
        const sx = l.source.x!; const sy = l.source.y!
        const tx = l.target.x!; const ty = l.target.y!
        const dx = tx - sx; const dy = ty - sy
        const angleRad = Math.atan2(dy, dx)
        // Use 0..180 to group opposite directions together (straight lines regardless of arrow)
        let angleDeg = (angleRad * 180) / Math.PI
        if (angleDeg < 0) angleDeg += 360
        angleDeg = angleDeg % 180
        const angleBucket = Math.round(angleDeg / angleBucketSizeDeg) * angleBucketSizeDeg

        const midX = (sx + tx) / 2; const midY = (sy + ty) / 2
        const mx = Math.floor(midX / regionBucketSizePx)
        const my = Math.floor(midY / regionBucketSizePx)
        const key = `${angleBucket}_${mx}_${my}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(l)
      }

      // Precompute offsets per link (corridor-wide)
      const offsets = new Map<GraphLink, { ox: number; oy: number }>()
      groups.forEach((group) => {
        if (group.length <= 1) return
        // Sort by source id for stable ordering
        group.sort((a, b) => (a.source.id < b.source.id ? -1 : a.source.id > b.source.id ? 1 : 0))
        const n = group.length
        for (let i = 0; i < n; i++) {
          const l = group[i]
          const sx = l.source.x!; const sy = l.source.y!
          const tx = l.target.x!; const ty = l.target.y!
          const dx = tx - sx; const dy = ty - sy
          const len = Math.hypot(dx, dy) || 1
          const perpX = -dy / len
          const perpY = dx / len
          const offsetFromCenter = (i - (n - 1) / 2) * spacingPx
          offsets.set(l, { ox: perpX * offsetFromCenter, oy: perpY * offsetFromCenter })
        }
      })

      // Endpoint-specific fan-out: spread links at each node to avoid stacking
      const startOffsets = new Map<GraphLink, { ox: number; oy: number }>()
      const endOffsets = new Map<GraphLink, { ox: number; oy: number }>()

      for (const node of nodes) {
        // Links where this node is the source
        const outLinks = links.filter(l => l.source.id === node.id)
        // Links where this node is the target
        const inLinks = links.filter(l => l.target.id === node.id)

        const assignEndpointOffsets = (ls: GraphLink[], isSource: boolean) => {
          if (ls.length <= 1) return
          // Group by angle buckets so only near-parallel edges are separated together
          const buckets = new Map<number, GraphLink[]>()
          for (const l of ls) {
            const other = isSource ? l.target : l.source
            const dx = other.x! - node.x!
            const dy = other.y! - node.y!
            let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
            if (angleDeg < 0) angleDeg += 360
            angleDeg = angleDeg % 180
            const bucket = Math.round(angleDeg / angleBucketSizeDeg) * angleBucketSizeDeg
            if (!buckets.has(bucket)) buckets.set(bucket, [])
            buckets.get(bucket)!.push(l)
          }
          buckets.forEach((arr) => {
            if (arr.length <= 1) return
            arr.sort((a, b) => {
              const oa = isSource ? a.target.id : a.source.id
              const ob = isSource ? b.target.id : b.source.id
              return oa < ob ? -1 : oa > ob ? 1 : 0
            })
            const n = arr.length
            for (let i = 0; i < n; i++) {
              const l = arr[i]
              const other = isSource ? l.target : l.source
              const dx = other.x! - node.x!
              const dy = other.y! - node.y!
              const len = Math.hypot(dx, dy) || 1
              const perpX = -dy / len
              const perpY = dx / len
              const offsetFromCenter = (i - (n - 1) / 2) * endpointSpacingPx
              const entry = { ox: perpX * offsetFromCenter, oy: perpY * offsetFromCenter }
              if (isSource) {
                startOffsets.set(l, entry)
              } else {
                endOffsets.set(l, entry)
              }
            }
          })
        }

        assignEndpointOffsets(outLinks, true)
        assignEndpointOffsets(inLinks, false)
      }

      // Update positions with both corridor and endpoint offsets applied
      link
        .attr("x1", (d: any) => {
          const o = offsets.get(d as GraphLink)
          const s = startOffsets.get(d as GraphLink)
          return d.source.x! + (o?.ox || 0) + (s?.ox || 0)
        })
        .attr("y1", (d: any) => {
          const o = offsets.get(d as GraphLink)
          const s = startOffsets.get(d as GraphLink)
          return d.source.y! + (o?.oy || 0) + (s?.oy || 0)
        })
        .attr("x2", (d: any) => {
          const o = offsets.get(d as GraphLink)
          const e = endOffsets.get(d as GraphLink)
          return d.target.x! + (o?.ox || 0) + (e?.ox || 0)
        })
        .attr("y2", (d: any) => {
          const o = offsets.get(d as GraphLink)
          const e = endOffsets.get(d as GraphLink)
          return d.target.y! + (o?.oy || 0) + (e?.oy || 0)
        })

      node.attr("transform", d => `translate(${d.x},${d.y})`)
      
      // Apply auto-fit once when simulation has mostly settled
      if (!autoFitApplied && simulation.alpha() < 0.1) {
        autoFitApplied = true
        setTimeout(() => {
          try {
            const bounds = container.node()?.getBBox()
            if (bounds && bounds.width > 0 && bounds.height > 0) {
              const scale = Math.min(width / bounds.width, height / bounds.height) * 0.7
              const clampedScale = Math.max(0.3, Math.min(1.5, scale))  // Clamp scale
              const translateX = (width - bounds.width * clampedScale) / 2 - bounds.x * clampedScale
              const translateY = (height - bounds.height * clampedScale) / 2 - bounds.y * clampedScale
              
              svg.transition()
                .duration(500)  // Shorter transition
                .call(zoomBehavior.transform, zoomIdentity.translate(translateX, translateY).scale(clampedScale))
            }
          } catch (e) {
            console.warn('Auto-fit failed:', e)
          }
        }, 50)
      }
    })

    return () => {
      simulation.stop()
    }
  }, [services, connections, onNodeSelect])

  // Run animation effect (GSAP sequential timeline)
  useEffect(() => {
    if (!svgRef.current) return
    if (!runId) return
    if (!linksRef.current.length) return
    if (isAnimatingRef.current) return

    isAnimatingRef.current = true

    const container = select(containerRef.current)
    const linkSel = linkSelRef.current as Selection<SVGLineElement, GraphLink, any, any>
    const nodeSel = nodeSelRef.current as Selection<SVGGElement, GraphNode, any, any>
    if (!linkSel || !container || !nodeSel) {
      isAnimatingRef.current = false
      return
    }

    // Kill any previous tweens
    gsapTweensRef.current.forEach(t => { try { t.kill() } catch {} })
    gsapTweensRef.current = []

    console.log("🎬 Starting run animation - resetting graph...")

    // Reset visibility
    linkSel
      .attr("filter", null)
      .attr("stroke-opacity", 0)
      .attr("marker-end", null)
    nodeSel.style("opacity", 0)

    // Build adjacency
    const links = linksRef.current
    const nodes = nodesRef.current

    const adjacency = new Map<string, GraphLink[]>()
    for (const l of links) {
      if (!adjacency.has(l.source.id)) adjacency.set(l.source.id, [])
      adjacency.get(l.source.id)!.push(l)
    }

    const indegrees = new Map(nodes.map(n => [n.id, 0]))
    links.forEach(l => {
      indegrees.set(l.target.id, (indegrees.get(l.target.id) || 0) + 1)
    })

    let roots = nodes.filter(n => (indegrees.get(n.id) || 0) === 0).map(n => n.id)

    roots = roots.sort((a, b) => {
      const aNode = nodes.find(n => n.id === a)!
      const bNode = nodes.find(n => n.id === b)!
      const aScore = (getServiceType(aNode) === 'api' ? 1 : 0) + (a.toLowerCase().includes('api') ? 1 : 0)
      const bScore = (getServiceType(bNode) === 'api' ? 1 : 0) + (b.toLowerCase().includes('api') ? 1 : 0)
      return bScore - aScore
    })

    const allBfsEdges: GraphLink[] = []
    const globalVisited = new Set<string>()
    for (const root of roots) {
      if (globalVisited.has(root)) continue
      const q: string[] = [root]
      const localVisited = new Set<string>([root])
      globalVisited.add(root)
      const componentEdges: GraphLink[] = []
      while (q.length) {
        const current = q.shift()!
        const outgoing = (adjacency.get(current) || []).filter((e: GraphLink) => !componentEdges.includes(e))
        for (const e of outgoing) {
          componentEdges.push(e)
          if (!localVisited.has(e.target.id)) {
            localVisited.add(e.target.id)
            globalVisited.add(e.target.id)
            q.push(e.target.id)
          }
        }
      }
    allBfsEdges.push(...componentEdges)
  }

  const revealed = new Set<string>()

  const waitForLayoutStability = async () => {
      const sim = simulationRef.current
      if (!sim) return
      const start = Date.now()
      while (sim.alpha() > 0.06 && Date.now() - start < 2000) {
        await new Promise(r => setTimeout(r, 50))
      }
    }

    const fadeInNode = async (nodeId: string) => {
      if (revealed.has(nodeId)) return
      revealed.add(nodeId)
      const els = nodeSel.filter((d: any) => d.id === nodeId).nodes()
      if (els.length === 0) return
      await new Promise<void>((resolve) => {
        const tween = gsap.to(els, { duration: 0.4, opacity: 1, ease: "power2.out", onComplete: () => resolve() })
        gsapTweensRef.current.push(tween)
      })
    }

  const animateEdge = async (edge: GraphLink) => {
    const lineEl = linkSel.filter((d: any) => d === edge).nodes()[0] as SVGLineElement
    if (!lineEl) return

    const read = (attr: string) => parseFloat(lineEl.getAttribute(attr) || '0')
    const sx = read('x1')
    const sy = read('y1')
    const tx = read('x2')
    const ty = read('y2')

    // Start with line invisible
    select(lineEl)
      .attr("stroke-opacity", 0)
      .attr("marker-end", null)

    // Create a mask for line drawing effect
    const lineLength = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2)
    const lineDef = container.select("defs")
    if (lineDef.empty()) {
      container.append("defs")
    }
    
    const maskId = `lineMask_${Math.random().toString(36).substr(2, 9)}`
    const mask = container.select("defs").append("mask").attr("id", maskId)
    
    const maskRect = mask.append("rect")
      .attr("x", sx)
      .attr("y", sy - 10)
      .attr("width", 0)
      .attr("height", 20)
      .attr("fill", "white")
      .attr("transform", `rotate(${Math.atan2(ty - sy, tx - sx) * 180 / Math.PI} ${sx} ${sy})`)

    select(lineEl).attr("mask", `url(#${maskId})`)

    // Create traveling dot
    const dot = (container.append("circle") as any)
      .attr("class", "__runDot")
      .attr("r", 6)
      .attr("fill", "#22d3ee")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2)
      .attr("cx", sx)
      .attr("cy", sy)
      .style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.3))")
      .node() as SVGCircleElement

    await new Promise<void>((resolve) => {
      // Create timeline for smooth coordinated animation
      const tl = gsap.timeline({
        onComplete: () => {
          // Clean up
          try { 
            select(dot).remove()
            mask.remove()
          } catch {}
          // Show final line state
          select(lineEl)
            .attr("mask", null)
            .attr("stroke-opacity", 0.7)
            .attr("marker-end", "url(#arrowhead)")
            .attr("filter", null)
          resolve()
        }
      })

      // Step 1: Draw the line progressively while dot travels
      tl.to(lineEl, { 
        duration: 0.6, 
        attr: { "stroke-opacity": 1 }, 
        ease: "power2.out" 
      }, 0)
      
      tl.to(maskRect.node(), { 
        duration: 0.6, 
        attr: { width: lineLength }, 
        ease: "power2.out" 
      }, 0)

      // Step 2: Dot travels along the drawn line (slightly delayed)
      tl.to(dot, {
        duration: 0.7,
        attr: { cx: tx, cy: ty },
        ease: "power1.inOut"
      }, 0.1)

      // Step 3: Arrival pulse and glow
      tl.to(lineEl, {
        duration: 0.3,
        attr: { filter: "url(#edgeGlow)" },
        ease: "power2.out"
      }, 0.6)

      tl.to(dot, {
        duration: 0.15,
        attr: { r: 10 },
        opacity: 0.7,
        ease: "back.out(2)"
      }, 0.8)

      tl.to(dot, {
        duration: 0.15,
        attr: { r: 6 },
        opacity: 1,
        ease: "power2.out"
      }, 0.95)

      // Step 4: Show arrow marker
      tl.to(lineEl, {
        duration: 0.1,
        attr: { "marker-end": "url(#arrowhead)" },
        ease: "none"
      }, 0.7)

      gsapTweensRef.current.push(tl)
    })
  }

    // Now animate allBfsEdges sequentially
    ;(async () => {
      // Ensure nodes/links are settled so coordinates line up with rendered lines
      await waitForLayoutStability()
      // Reveal all roots first
      for (const root of roots) {
        await fadeInNode(root)
      }
    for (const e of allBfsEdges) {
      await fadeInNode(e.source.id)
      // Start edge animation and target reveal simultaneously when dot arrives
      const edgePromise = animateEdge(e)
      // Wait a bit for the dot to travel, then reveal target
      setTimeout(() => fadeInNode(e.target.id), 500)
      await edgePromise
    }
      // Restore default visuals
      linkSel
        .attr("filter", null)
        .attr("stroke-opacity", 0.7)
        .attr("marker-end", "url(#arrowhead)")
      nodeSel.style("opacity", 1)
      isAnimatingRef.current = false
    })()

    return () => {
      gsapTweensRef.current.forEach(t => { try { t.kill() } catch {} })
      gsapTweensRef.current = []
      try { container.selectAll("circle.__runDot").remove() } catch {}
      isAnimatingRef.current = false
    }
  }, [runId])

  if (services.length === 0) {
    return (
      <div className="w-full h-full bg-slate-50 flex items-center justify-center">
        <div className="text-center text-slate-500">
          <Cloud className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No services to display</p>
          <p className="text-sm">Load a graph to start visualizing</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-slate-50 relative">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox="0 0 800 600"
        className="border-0"
      />
      {/* Zoom Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <Button
          size="icon"
          variant="secondary"
          onClick={() => {
            const svg = select(svgRef.current!)
            const zb = zoomBehaviorRef.current
            if (!zb) return
            const t = (select(svgRef.current!) as any).property("__zoom") || zoomIdentity
            const next = t.scale(1.2)
            svg.transition().duration(250).call(zb.transform, next)
          }}
          aria-label="Zoom in"
        >
          +
        </Button>
        <Button
          size="icon"
          variant="secondary"
          onClick={() => {
            const svg = select(svgRef.current!)
            const zb = zoomBehaviorRef.current
            if (!zb) return
            const t = (select(svgRef.current!) as any).property("__zoom") || zoomIdentity
            const next = t.scale(1/1.2)
            svg.transition().duration(250).call(zb.transform, next)
          }}
          aria-label="Zoom out"
        >
          −
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            // Fit to bounds
            const svg = select(svgRef.current!)
            const container = select(containerRef.current)
            const zb = zoomBehaviorRef.current
            if (!zb || !containerRef.current) return
            try {
              const bounds = (containerRef.current as any).getBBox()
              const width = 800
              const height = 600
              if (bounds && bounds.width > 0 && bounds.height > 0) {
                const scale = Math.min(width / bounds.width, height / bounds.height) * 0.8
                const clampedScale = Math.max(0.3, Math.min(2, scale))
                const translateX = (width - bounds.width * clampedScale) / 2 - bounds.x * clampedScale
                const translateY = (height - bounds.height * clampedScale) / 2 - bounds.y * clampedScale
                svg.transition().duration(350).call(zb.transform, zoomIdentity.translate(translateX, translateY).scale(clampedScale))
              }
            } catch {}
          }}
        >
          Fit
        </Button>
      </div>
      
      {/* Instructions */}
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 text-xs text-slate-600 max-w-sm">
        <div className="font-medium mb-2">AWS Architecture Visualization</div>
        <div className="mb-2">
          <div className="font-medium text-[10px] mb-1">Controls:</div>
          <div>• Click nodes to highlight connections</div>
          <div>• Drag nodes to reposition</div>
          <div>• Scroll to zoom, drag background to pan</div>
        </div>
        <div>
          <div className="font-medium text-[10px] mb-1">Smart Layout:</div>
          <div>• Services organized by architectural layers</div>
          <div>• Highly connected nodes get more space</div>
          <div>• Most connected nodes positioned centrally</div>
        </div>
        <div className="mt-2">
          <div className="font-medium text-[10px] mb-1">Connections:</div>
          <div>• Solid lines: Synchronous calls</div>
          <div>• Dashed lines: Asynchronous events</div>
          <div>• Colors indicate connection type</div>
        </div>
      </div>
    </div>
  )
}