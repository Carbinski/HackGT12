"use client"

import { useEffect, useRef, useState } from "react"
import * as d3 from "d3-force"
import { select } from "d3-selection"
import { zoom, zoomIdentity } from "d3-zoom"
import { drag } from "d3-drag"
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
}

// Service type colors
const SERVICE_COLORS = {
  "api": "#3b82f6",
  "database": "#8b5cf6", 
  "queue": "#f59e0b",
  "external": "#10b981",
  "cache": "#ef4444",
  "message": "#818cf8",
  "stepfn": "#f472b6"
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

export function PrettyGraph({ services, connections, onNodeSelect }: PrettyGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null)

  useEffect(() => {
    if (!svgRef.current || services.length === 0) return

    const svg = select(svgRef.current)
    svg.selectAll("*").remove()

    const width = 800
    const height = 600

    // Setup zoom
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on("zoom", (event) => {
        container.attr("transform", event.transform)
      })

    svg.call(zoomBehavior)

    const container = svg.append("g")

    // Create graph data
    const nodes: GraphNode[] = services.map(s => ({ ...s }))
    const links: GraphLink[] = connections.map(c => ({
      ...c,
      source: nodes.find(n => n.id === c.from)!,
      target: nodes.find(n => n.id === c.to)!
    })).filter(l => l.source && l.target)

    // Initial positioning - simple layered approach
    const initializePositions = (nodes: GraphNode[]) => {
      const layers: Record<string, number> = {
        api: 0.2,      // API Gateway at top
        frontend: 0.3, // Frontend services
        external: 0.4, // External/Step functions
        stepfn: 0.4,   
        queue: 0.6,    // Queues in middle-bottom
        message: 0.6,  // SNS Topics
        cache: 0.6,    
        database: 0.8  // Databases at bottom
      }
      
      const servicesByType: Record<string, GraphNode[]> = {}
      nodes.forEach(node => {
        if (!servicesByType[node.type]) servicesByType[node.type] = []
        servicesByType[node.type].push(node)
      })
      
      Object.entries(servicesByType).forEach(([type, typeNodes]) => {
        const y = (layers[type] || 0.5) * height
        const spacing = width / (typeNodes.length + 1)
        
        typeNodes.forEach((node, i) => {
          node.x = spacing * (i + 1)
          node.y = y
        })
      })
    }
    
    initializePositions(nodes)

    // Create simulation
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(55))

    simulationRef.current = simulation

    // Arrow markers
    const defs = container.append("defs")
    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 30)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#64748b")

    // Create links
    const link = container.append("g")
      .selectAll("line")
      .data(links)
      .enter().append("line")
      .attr("stroke", "#64748b")
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.6)
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
      .attr("stroke", d => SERVICE_COLORS[d.type as keyof typeof SERVICE_COLORS] || "#6b7280")
      .attr("stroke-width", 3)
      .style("filter", "drop-shadow(0 4px 8px rgba(0,0,0,0.1))")

    // AWS service icons
    node.append("image")
      .attr("x", -20)
      .attr("y", -20)
      .attr("width", 40)
      .attr("height", 40)
      .attr("href", d => {
        // Map service types to AWS icons
        const iconMap: Record<string, string> = {
          "api": "/aws-icons/Arch_Amazon-API-Gateway_64.svg",
          "database": "/aws-icons/Arch_Amazon-DynamoDB_64.svg",
          "queue": "/aws-icons/Arch_Amazon-EventBridge_64.svg", // Using EventBridge for SQS
          "message": "/aws-icons/Arch_Amazon-EventBridge_64.svg",
          "stepfn": "/aws-icons/Arch_AWS-Step-Functions_64.svg",
          "external": "/aws-icons/Arch_AWS-Lambda_64.svg", // Default to Lambda for unknown
        }
        
        // Check if it's a Lambda function based on technologies
        if (d.technologies && d.technologies.includes("Lambda")) {
          return "/aws-icons/Arch_AWS-Lambda_64.svg"
        }
        
        return iconMap[d.type] || "/aws-icons/Arch_AWS-Lambda_64.svg"
      })

    // Node labels
    node.append("text")
      .attr("dy", 50)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .attr("fill", "#1e293b")
      .text(d => d.name || d.id)

    // Technology labels
    node.append("text")
      .attr("dy", 65)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("fill", "#64748b")
      .text(d => d.technologies?.[0] || d.type)

    // Click handler for nodes
    node.on("click", (event, d) => {
      event.stopPropagation()
      setSelectedNode(selectedNode === d.id ? null : d.id)
      onNodeSelect?.(selectedNode === d.id ? null : d)
      
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
        .attr("stroke-width", n => connectedNodes.has(n.id) ? 5 : 3)
        .attr("stroke", n => connectedNodes.has(n.id) ? "#14b8a6" : "#ffffff")

      // Update link styling
      link.attr("stroke", l => 
        l.source.id === d.id || l.target.id === d.id ? "#14b8a6" : "#64748b"
      ).attr("stroke-width", l =>
        l.source.id === d.id || l.target.id === d.id ? 3 : 2
      )
    })

    // Background click to clear selection
    svg.on("click", () => {
      setSelectedNode(null)
      onNodeSelect?.(null)
      node.selectAll("rect")
        .attr("stroke-width", 3)
        .attr("stroke", "#ffffff")
      link.attr("stroke", "#64748b").attr("stroke-width", 2)
    })

    // Update positions on tick
    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x!)
        .attr("y1", d => d.source.y!)
        .attr("x2", d => d.target.x!)
        .attr("y2", d => d.target.y!)

      node.attr("transform", d => `translate(${d.x},${d.y})`)
    })

    // Auto-fit after simulation ends
    simulation.on("end", () => {
      setTimeout(() => {
        const bounds = container.node()?.getBBox()
        if (bounds) {
          const fullWidth = bounds.width
          const fullHeight = bounds.height
          const scale = Math.min(width / fullWidth, height / fullHeight) * 0.8
          const translateX = (width - fullWidth * scale) / 2 - bounds.x * scale
          const translateY = (height - fullHeight * scale) / 2 - bounds.y * scale
          
          svg.transition()
            .duration(750)
            .call(zoomBehavior.transform, zoomIdentity.translate(translateX, translateY).scale(scale))
        }
      }, 100)
    })

    return () => {
      simulation.stop()
    }
  }, [services, connections, onNodeSelect, selectedNode])

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
      
      {/* Instructions */}
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 text-xs text-slate-600 max-w-xs">
        <div className="font-medium mb-1">Controls</div>
        <div>• Click nodes to highlight connections</div>
        <div>• Drag nodes to reposition</div>
        <div>• Scroll to zoom, drag background to pan</div>
      </div>
    </div>
  )
}