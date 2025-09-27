"use client"

import type React from "react"

import { useEffect, useRef, useState, useCallback } from "react"
import type { MicroserviceNode, ServiceConnection } from "@/lib/file-analyzer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react"

interface ServiceGraphProps {
  services: MicroserviceNode[]
  connections: ServiceConnection[]
  onNodeSelect?: (node: MicroserviceNode | null) => void
  onConnectionSelect?: (connection: ServiceConnection | null) => void
}

interface GraphNode extends MicroserviceNode {
  x: number
  y: number
  vx: number
  vy: number
  fx?: number
  fy?: number
}

interface GraphConnection extends ServiceConnection {
  source: GraphNode
  target: GraphNode
}

export function ServiceGraph({ services, connections, onNodeSelect, onConnectionSelect }: ServiceGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedNode, setSelectedNode] = useState<MicroserviceNode | null>(null)
  const [selectedConnection, setSelectedConnection] = useState<ServiceConnection | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [links, setLinks] = useState<GraphConnection[]>([])

  // Initialize graph data
  useEffect(() => {
    const graphNodes: GraphNode[] = services.map((service, index) => ({
      ...service,
      x: Math.random() * 800,
      y: Math.random() * 600,
      vx: 0,
      vy: 0,
    }))

    const nodeMap = new Map(graphNodes.map((node) => [node.id, node]))
    const graphLinks: GraphConnection[] = connections
      .map((conn) => ({
        ...conn,
        source: nodeMap.get(conn.from),
        target: nodeMap.get(conn.to),
      }))
      .filter((link) => link.source && link.target) as GraphConnection[]

    setNodes(graphNodes)
    setLinks(graphLinks)
  }, [services, connections])

  // Force simulation
  useEffect(() => {
    if (nodes.length === 0) return

    const simulation = () => {
      // Apply forces
      nodes.forEach((node) => {
        // Center force
        node.vx += (400 - node.x) * 0.001
        node.vy += (300 - node.y) * 0.001

        // Repulsion between nodes
        nodes.forEach((other) => {
          if (node !== other) {
            const dx = node.x - other.x
            const dy = node.y - other.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            if (distance < 150) {
              const force = (150 - distance) * 0.01
              node.vx += (dx / distance) * force
              node.vy += (dy / distance) * force
            }
          }
        })
      })

      // Link forces
      links.forEach((link) => {
        const dx = link.target.x - link.source.x
        const dy = link.target.y - link.source.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        const targetDistance = 120
        const force = (distance - targetDistance) * 0.1

        const fx = (dx / distance) * force * 0.5
        const fy = (dy / distance) * force * 0.5

        link.source.vx += fx
        link.source.vy += fy
        link.target.vx -= fx
        link.target.vy -= fy
      })

      // Apply velocity and damping
      nodes.forEach((node) => {
        if (!node.fx && !node.fy) {
          node.x += node.vx
          node.y += node.vy
          node.vx *= 0.9
          node.vy *= 0.9
        }
      })

      setNodes([...nodes])
    }

    const interval = setInterval(simulation, 16)
    return () => clearInterval(interval)
  }, [nodes, links])

  // Canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      ctx.save()
      ctx.translate(pan.x, pan.y)
      ctx.scale(zoom, zoom)

      // Draw connections
      links.forEach((link) => {
        ctx.beginPath()
        ctx.moveTo(link.source.x, link.source.y)
        ctx.lineTo(link.target.x, link.target.y)

        if (selectedConnection === link) {
          ctx.strokeStyle = "#6366f1"
          ctx.lineWidth = 3
        } else {
          ctx.strokeStyle = "#374151"
          ctx.lineWidth = 2
        }

        ctx.stroke()

        // Draw arrow
        const angle = Math.atan2(link.target.y - link.source.y, link.target.x - link.source.x)
        const arrowLength = 10
        const arrowX = link.target.x - Math.cos(angle) * 30
        const arrowY = link.target.y - Math.sin(angle) * 30

        ctx.beginPath()
        ctx.moveTo(arrowX, arrowY)
        ctx.lineTo(
          arrowX - arrowLength * Math.cos(angle - Math.PI / 6),
          arrowY - arrowLength * Math.sin(angle - Math.PI / 6),
        )
        ctx.moveTo(arrowX, arrowY)
        ctx.lineTo(
          arrowX - arrowLength * Math.cos(angle + Math.PI / 6),
          arrowY - arrowLength * Math.sin(angle + Math.PI / 6),
        )
        ctx.stroke()
      })

      // Draw nodes
      nodes.forEach((node) => {
        const radius = 25

        // Node circle
        ctx.beginPath()
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)

        if (selectedNode === node) {
          ctx.fillStyle = "#6366f1"
          ctx.strokeStyle = "#4f46e5"
          ctx.lineWidth = 3
        } else {
          ctx.fillStyle = getNodeColor(node.type)
          ctx.strokeStyle = "#374151"
          ctx.lineWidth = 2
        }

        ctx.fill()
        ctx.stroke()

        // Node label
        ctx.fillStyle = "#ffffff"
        ctx.font = "12px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(node.name, node.x, node.y + 4)
      })

      ctx.restore()
    }

    draw()
  }, [nodes, links, selectedNode, selectedConnection, zoom, pan])

  const getNodeColor = (type: MicroserviceNode["type"]): string => {
    const colors = {
      api: "#10b981",
      frontend: "#3b82f6",
      database: "#f59e0b",
      queue: "#8b5cf6",
      cache: "#ef4444",
      external: "#6b7280",
    }
    return colors[type] || colors.external
  }

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = (event.clientX - rect.left - pan.x) / zoom
      const y = (event.clientY - rect.top - pan.y) / zoom

      // Check if clicked on a node
      const clickedNode = nodes.find((node) => {
        const dx = x - node.x
        const dy = y - node.y
        return Math.sqrt(dx * dx + dy * dy) < 25
      })

      if (clickedNode) {
        setSelectedNode(clickedNode)
        onNodeSelect?.(clickedNode)
      } else {
        setSelectedNode(null)
        onNodeSelect?.(null)
      }
    },
    [nodes, pan, zoom, onNodeSelect],
  )

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      setIsDragging(true)
      setDragStart({ x: event.clientX - pan.x, y: event.clientY - pan.y })
    },
    [pan],
  )

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (isDragging) {
        setPan({
          x: event.clientX - dragStart.x,
          y: event.clientY - dragStart.y,
        })
      }
    },
    [isDragging, dragStart],
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleZoomIn = () => setZoom((prev) => Math.min(prev * 1.2, 3))
  const handleZoomOut = () => setZoom((prev) => Math.max(prev / 1.2, 0.3))
  const handleReset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setSelectedNode(null)
    setSelectedConnection(null)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Architecture Graph</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={containerRef} className="relative">
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="border border-border rounded-lg cursor-move"
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />

          {/* Legend */}
          <div className="absolute top-4 right-4 bg-card border border-border rounded-lg p-3 space-y-2">
            <h4 className="text-sm font-medium">Service Types</h4>
            <div className="space-y-1">
              {[
                { type: "api", label: "API Service", color: "#10b981" },
                { type: "frontend", label: "Frontend", color: "#3b82f6" },
                { type: "database", label: "Database", color: "#f59e0b" },
                { type: "queue", label: "Message Queue", color: "#8b5cf6" },
                { type: "cache", label: "Cache", color: "#ef4444" },
                { type: "external", label: "External", color: "#6b7280" },
              ].map((item) => (
                <div key={item.type} className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
