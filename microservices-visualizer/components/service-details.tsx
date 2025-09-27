"use client"

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
    const icons = {
      api: Server,
      frontend: Globe,
      database: Database,
      queue: MessageSquare,
      cache: Zap,
      external: ExternalLink,
    }
    const Icon = icons[type] || Server
    return <Icon className="h-5 w-5" />
  }

  const incomingConnections = connections.filter((conn) => conn.to === selectedNode.id)
  const outgoingConnections = connections.filter((conn) => conn.from === selectedNode.id)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getServiceIcon(selectedNode.type)}
          {selectedNode.name}
        </CardTitle>
        <CardDescription>{selectedNode.description || "No description available"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
              <span className="ml-2 font-mono text-xs">{selectedNode.path}</span>
            </div>
            {selectedNode.port && (
              <div>
                <span className="text-muted-foreground">Port:</span>
                <span className="ml-2">{selectedNode.port}</span>
              </div>
            )}
          </div>
        </div>

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
