"use client"

import { useEffect, useRef, useState } from "react"
import * as d3 from "d3-force"
import { select } from "d3-selection"
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

interface PrettyGraphProps {
  services: MicroserviceNode[]
  connections: ServiceConnection[]
  onNodeSelect?: (node: MicroserviceNode | null) => void
  focusNodeId?: string | null
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

export function PrettyGraph({ services, connections, onNodeSelect, focusNodeId }: PrettyGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(true)
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null)
  const zoomBehaviorRef = useRef<any>(null)
  const containerRef = useRef<SVGGElement | null>(null)
  const userZoomedRef = useRef<boolean>(false)
  const selectedNodeRef = useRef<string | null>(null)

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
        // Mark that the user has interacted (ignore programmatic transforms)
        if ((event as any)?.sourceEvent?.isTrusted) {
          userZoomedRef.current = true
        }
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

    // Calculate node connectivity for intelligent spacing
    const nodeConnectivity = new Map<string, number>()
    nodes.forEach(node => {
      const connectionCount = links.filter(link => 
        link.source.id === node.id || link.target.id === node.id
      ).length
      nodeConnectivity.set(node.id, connectionCount)
    })

    // Grid positioning for readability: align to a neat grid, by type rows
    const initializePositions = (nodes: GraphNode[]) => {
      const gridCellW = 220
      const gridCellH = 140
      const marginX = 80
      const marginY = 80

      // Order of rows (top to bottom)
      const rowOrder = [
        "api","security","compute","stepfn","queue","message","cache","storage","database","monitoring","external"
      ]

      // Group by type
      const byType: Record<string, GraphNode[]> = {}
      nodes.forEach(n => {
        const t = getServiceType(n)
        if (!byType[t]) byType[t] = []
        byType[t].push(n)
      })

      // Assign positions in grid per row
      rowOrder.forEach((type, rowIdx) => {
        const arr = byType[type] || []
        arr.forEach((n, i) => {
          const x = marginX + i * gridCellW
          const y = marginY + rowIdx * gridCellH
          n.x = x
          n.y = y
          n.fx = x
          n.fy = y
        })
      })

      // Keep nodes locked; simulation forces will be gentle so layout stays grid-like
    }
    
    initializePositions(nodes)

    // Create gentle simulation that maintains hierarchical layout with intelligent spacing
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(160).strength(0.2))
      .force("charge", d3.forceManyBody().strength(-30))
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force("collision", d3.forceCollide().radius(70))
      // Light gravity toward grid rows to keep right angles readable
      .force("y", d3.forceY().y((d: any) => (d.fy ?? d.y ?? 0)).strength(0.3))
      .force("x", d3.forceX().x((d: any) => (d.fx ?? d.x ?? 0)).strength(0.3))
      .alpha(0.15)
      .alphaDecay(0.03)

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
      if (!autoFitApplied && !userZoomedRef.current && simulation.alpha() < 0.1) {
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

  // Focus/zoom to a specific node when requested
  useEffect(() => {
    if (!focusNodeId || !svgRef.current || !containerRef.current || !zoomBehaviorRef.current) return
    try {
      const nodeSel = select(containerRef.current)
        .selectAll<SVGGElement, GraphNode>(".node")
        .filter((d: any) => d.id === focusNodeId)
      const d = nodeSel.datum() as any
      if (!d || d.x == null || d.y == null) return
      const svg = select(svgRef.current)
      const width = 800
      const height = 600
      const scale = 1.2
      const translateX = width / 2 - d.x * scale
      const translateY = height / 2 - d.y * scale
      // Mark as user intent to prevent later auto-fit
      userZoomedRef.current = true
      svg.transition().duration(350).call(zoomBehaviorRef.current.transform, zoomIdentity.translate(translateX, translateY).scale(scale))
    } catch {}
  }, [focusNodeId])

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
      
      {/* Instructions (collapsible) */}
      <div className="absolute top-4 left-4">
        <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border text-xs text-slate-600 max-w-sm overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="font-medium">AWS Architecture Visualization</div>
            <button
              className="text-slate-500 hover:text-slate-700 text-[11px]"
              onClick={() => setHelpOpen((v) => !v)}
            >
              {helpOpen ? 'Hide' : 'Show'}
            </button>
          </div>
          {helpOpen && (
            <div className="p-3">
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
          )}
        </div>
      </div>
    </div>
  )
}