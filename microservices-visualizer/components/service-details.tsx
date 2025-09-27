"use client"

import * as React from "react"
import type { MicroserviceNode, ServiceConnection } from "@/lib/file-analyzer"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Server, Database, Globe, MessageSquare, Zap, ExternalLink } from "lucide-react"

interface ServiceDetailsProps {
  selectedNode: MicroserviceNode | null
  connections: ServiceConnection[]
}

export function ServiceDetails({ selectedNode, connections }: ServiceDetailsProps) {
  if (!selectedNode) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Select a service to view details</p>
        </CardContent>
      </Card>
    )
  }

  const getServiceIcon = (type: MicroserviceNode["type"]) => {
    const icons: Partial<Record<MicroserviceNode["type"], any>> = {
      api: Server,
      frontend: Globe,
      database: Database,
      queue: MessageSquare,
      cache: Zap,
      external: ExternalLink,
      compute: Server,
      storage: Database,
      message: MessageSquare,
      stepfn: Zap,
      monitoring: Globe,
      security: ExternalLink,
    }
    const Icon = icons[type] ?? Server
    return <Icon className="h-5 w-5" />
  }

  const incomingConnections = connections.filter((conn) => conn.to === selectedNode.id)
  const outgoingConnections = connections.filter((conn) => conn.from === selectedNode.id)

  // Local editable config state (not yet persisted)
  const [runtime, setRuntime] = React.useState<string>(selectedNode.runtime || "nodejs")
  const [memoryMb, setMemoryMb] = React.useState<number>(selectedNode.memoryMb ?? 512)
  const [timeoutSec, setTimeoutSec] = React.useState<number>(selectedNode.timeoutSec ?? 30)
  // HTTP route config (for API nodes)
  const defaultRoute = (selectedNode.endpoints && selectedNode.endpoints[0]) || "/"
  const defaultMethod = (incomingConnections.concat(outgoingConnections).find(c => !!c.method)?.method || "GET").toUpperCase()
  const [routePath, setRoutePath] = React.useState<string>(defaultRoute)
  const [routeMethod, setRouteMethod] = React.useState<string>(defaultMethod)

  // Reset when selection changes
  React.useEffect(() => {
    // Derive light defaults from technologies/description if present
    const techs = selectedNode.technologies?.map(t => t.toLowerCase()) || []
    if (selectedNode.runtime) setRuntime(selectedNode.runtime)
    else if (techs.includes("python")) setRuntime("python")
    else if (techs.includes("go")) setRuntime("go")
    else if (techs.includes("java")) setRuntime("java")
    else if (techs.includes(".net") || techs.includes("dotnet")) setRuntime("dotnet")
    else setRuntime("nodejs")

    setMemoryMb(selectedNode.memoryMb ?? 512)
    setTimeoutSec(selectedNode.timeoutSec ?? 30)
    setRoutePath((selectedNode.endpoints && selectedNode.endpoints[0]) || "/")
    const connWithMethod = outgoingConnections.find(c => !!c.method) || incomingConnections.find(c => !!c.method)
    setRouteMethod((connWithMethod?.method || "GET").toUpperCase())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode.id])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getServiceIcon(selectedNode.type)}
          {selectedNode.name}
        </CardTitle>
        <CardDescription>{selectedNode.description || "No description available"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 max-w-full">
        <div>
          <h4 className="text-sm font-medium mb-2">Service Information</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Type:</span>
              <Badge variant="secondary" className="ml-2">
                {selectedNode.type}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Path:</span>
              <span className="ml-2 font-mono text-xs block max-w-full truncate" title={selectedNode.path}>
                {selectedNode.path}
              </span>
            </div>
            {selectedNode.port && (
              <div>
                <span className="text-muted-foreground">Port:</span>
                <span className="ml-2">{selectedNode.port}</span>
              </div>
            )}
          </div>
        </div>

        {/* Configuration: Lambda/Compute */}
        {(selectedNode.technologies.includes("Lambda") || selectedNode.type === 'compute') && (
        <div>
          <h4 className="text-sm font-medium mb-2">Configuration</h4>
          <div className="grid grid-cols-2 gap-4 text-sm items-center">
            <label className="text-muted-foreground">Language</label>
            <select
              value={runtime}
              onChange={(e) => setRuntime(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm"
            >
              <option value="nodejs">Node.js</option>
              <option value="python">Python</option>
              <option value="go">Go</option>
              <option value="java">Java</option>
              <option value="dotnet">.NET</option>
            </select>

            <label className="text-muted-foreground">Memory (MB)</label>
            <input
              type="number"
              min={128}
              max={10240}
              step={64}
              value={memoryMb}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isNaN(v)) return
                setMemoryMb(Math.min(10240, Math.max(128, v)))
              }}
              className="w-28 border rounded-md px-2 py-1 text-sm"
            />

            <label className="text-muted-foreground">Timeout (sec)</label>
            <input
              type="number"
              min={1}
              max={900}
              step={1}
              value={timeoutSec}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isNaN(v)) return
                setTimeoutSec(Math.min(900, Math.max(1, v)))
              }}
              className="w-28 border rounded-md px-2 py-1 text-sm"
            />
          </div>
        </div>
        )}

        {/* Configuration: HTTP API (route) */}
        {selectedNode.type === 'api' && (
        <div>
          <h4 className="text-sm font-medium mb-2">Route Configuration</h4>
          <div className="grid grid-cols-2 gap-4 text-sm items-center">
            <label className="text-muted-foreground">Method</label>
            <select
              value={routeMethod}
              onChange={(e) => setRouteMethod(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm"
            >
              {['GET','POST','PUT','DELETE','PATCH','OPTIONS','HEAD'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <label className="text-muted-foreground">Path</label>
            <input
              type="text"
              value={routePath}
              onChange={(e) => setRoutePath(e.target.value)}
              placeholder="/resource"
              className="border rounded-md px-2 py-1 text-sm"
            />
          </div>
        </div>
        )}

        {/* Configuration: Table (DynamoDB) */}
        {selectedNode.type === 'database' && (
        <div>
          <h4 className="text-sm font-medium mb-2">Table Configuration</h4>
          <div className="grid grid-cols-2 gap-4 text-sm items-center">
            <label className="text-muted-foreground">Table Name</label>
            <input
              type="text"
              defaultValue={selectedNode.tableName || ''}
              placeholder="Products"
              className="border rounded-md px-2 py-1 text-sm"
            />

            <label className="text-muted-foreground">Billing Mode</label>
            <select
              defaultValue={selectedNode.billingMode || 'PAY_PER_REQUEST'}
              className="border rounded-md px-2 py-1 text-sm"
            >
              <option value="PAY_PER_REQUEST">PAY_PER_REQUEST</option>
              <option value="PROVISIONED">PROVISIONED</option>
            </select>
          </div>
        </div>
        )}

        {/* Configuration: Queue (SQS) */}
        {selectedNode.type === 'queue' && (
        <div>
          <h4 className="text-sm font-medium mb-2">Queue Configuration</h4>
          <div className="grid grid-cols-2 gap-4 text-sm items-center">
            <label className="text-muted-foreground">Visibility Timeout (sec)</label>
            <input
              type="number"
              min={0}
              max={43200}
              step={1}
              defaultValue={selectedNode.visibilityTimeoutSec ?? 30}
              className="w-28 border rounded-md px-2 py-1 text-sm"
            />

            <label className="text-muted-foreground">Message Retention (sec)</label>
            <input
              type="number"
              min={60}
              max={1209600}
              step={60}
              defaultValue={selectedNode.messageRetentionSec ?? 345600}
              className="w-28 border rounded-md px-2 py-1 text-sm"
            />

            <label className="text-muted-foreground">FIFO Queue</label>
            <input
              type="checkbox"
              defaultChecked={selectedNode.fifoQueue ?? false}
              className="h-4 w-4"
            />

            <label className="text-muted-foreground">Content-based Deduplication</label>
            <input
              type="checkbox"
              defaultChecked={selectedNode.contentBasedDeduplication ?? false}
              className="h-4 w-4"
            />
          </div>
        </div>
        )}

        {selectedNode.technologies.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Technologies</h4>
            <div className="flex flex-wrap gap-1">
              {selectedNode.technologies.map((tech) => (
                <Badge key={tech} variant="outline" className="text-xs">
                  {tech}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {selectedNode.endpoints && selectedNode.endpoints.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">API Endpoints</h4>
            <div className="space-y-1">
              {selectedNode.endpoints.map((endpoint, index) => (
                <div key={index} className="text-xs font-mono bg-muted p-2 rounded">
                  {endpoint}
                </div>
              ))}
            </div>
          </div>
        )}

        {incomingConnections.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Incoming Connections</h4>
            <div className="space-y-1">
              {incomingConnections.map((conn, index) => (
                <div key={index} className="text-xs flex items-center justify-between bg-muted p-2 rounded">
                  <span>{conn.from}</span>
                  <Badge variant="outline" className="text-xs">
                    {conn.type}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {outgoingConnections.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Outgoing Connections</h4>
            <div className="space-y-1">
              {outgoingConnections.map((conn, index) => (
                <div key={index} className="text-xs flex items-center justify-between bg-muted p-2 rounded">
                  <span>{conn.to}</span>
                  <Badge variant="outline" className="text-xs">
                    {conn.type}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
