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

    // Setup zoom with throttling for better performance
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 2])  // Reduced range for stability
      .filter((event) => {
        // Prevent zoom on drag operations
        return !event.ctrlKey && !event.button
      })
      .on("zoom", (event) => {
        // Throttle zoom updates for better performance
        requestAnimationFrame(() => {
          container.attr("transform", event.transform)
        })
      })

    svg.call(zoomBehavior)

    const container = svg.append("g")

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

    // Hierarchical positioning - logical flow from top to bottom
    const initializePositions = (nodes: GraphNode[]) => {
      // Define clear layers for logical flow
      const layers: Record<string, number> = {
        api: 0.15,     // API Gateway at very top
        external: 0.35, // Lambda functions in upper middle  
        queue: 0.55,   // Queues/messaging in middle
        message: 0.55, // SNS Topics with queues
        cache: 0.75,   // Cache in lower middle
        database: 0.85 // Databases at bottom
      }
      
      // Group nodes by type for organized layout
      const servicesByType: Record<string, GraphNode[]> = {}
      nodes.forEach(node => {
        // Map Lambda technology to external type for better grouping
        const nodeType = (node.technologies?.includes('Lambda')) ? 'external' : node.type
        if (!servicesByType[nodeType]) servicesByType[nodeType] = []
        servicesByType[nodeType].push(node)
      })
      
      // Position each type in its layer with generous spacing
      Object.entries(servicesByType).forEach(([type, typeNodes]) => {
        const y = (layers[type] || 0.5) * height
        const minSpacing = 180  // Increased minimum spacing
        const spacing = Math.max(minSpacing, (width * 0.8) / Math.max(1, typeNodes.length - 1))
        const totalWidth = typeNodes.length > 1 ? spacing * (typeNodes.length - 1) : 0
        const startX = (width - totalWidth) / 2
        
        typeNodes.forEach((node, i) => {
          node.x = typeNodes.length === 1 ? width / 2 : startX + spacing * i
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

    // Create gentle simulation that maintains hierarchical layout
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150).strength(0.3))  // Gentler links
      .force("charge", d3.forceManyBody().strength(-100))  // Reduced repulsion for stability
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.1))  // Weak centering
      .force("collision", d3.forceCollide().radius(90))  // Prevent overlap
      .force("y", d3.forceY().y(d => {  // Keep nodes in their layers
        const nodeType = (d.technologies?.includes('Lambda')) ? 'external' : d.type
        const layers: Record<string, number> = {
          api: 0.15, external: 0.35, queue: 0.55, message: 0.55, cache: 0.75, database: 0.85
        }
        return (layers[nodeType] || 0.5) * height
      }).strength(0.8))
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

    // Simplified auto-fit with reduced complexity
    let autoFitApplied = false
    simulation.on("tick", () => {
      // Update positions
      link
        .attr("x1", d => d.source.x!)
        .attr("y1", d => d.source.y!)
        .attr("x2", d => d.target.x!)
        .attr("y2", d => d.target.y!)

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