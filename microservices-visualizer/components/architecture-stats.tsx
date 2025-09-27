"use client"

import type { MicroserviceNode, ServiceConnection } from "@/lib/file-analyzer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Server, Globe, Database, MessageSquare, Zap, ExternalLink, GitBranch, Activity } from "lucide-react"

interface ArchitectureStatsProps {
  services: MicroserviceNode[]
  connections: ServiceConnection[]
}

export function ArchitectureStats({ services, connections }: ArchitectureStatsProps) {
  const servicesByType = services.reduce(
    (acc, service) => {
      acc[service.type] = (acc[service.type] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  const connectionsByType = connections.reduce(
    (acc, connection) => {
      acc[connection.type] = (acc[connection.type] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  const totalEndpoints = services.reduce((acc, service) => {
    return acc + (service.endpoints?.length || 0)
  }, 0)

  const technologies = Array.from(new Set(services.flatMap((service) => service.technologies)))

  const getServiceIcon = (type: string) => {
    const icons = {
      api: Server,
      frontend: Globe,
      database: Database,
      queue: MessageSquare,
      cache: Zap,
      external: ExternalLink,
    }
    const Icon = icons[type as keyof typeof icons] || Server
    return <Icon className="h-4 w-4" />
  }

  const getServiceTypeColor = (type: string) => {
    const colors = {
      api: "bg-green-500",
      frontend: "bg-blue-500",
      database: "bg-yellow-500",
      queue: "bg-purple-500",
      cache: "bg-red-500",
      external: "bg-gray-500",
    }
    return colors[type as keyof typeof colors] || "bg-gray-500"
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Services */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Services</CardTitle>
          <Server className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{services.length}</div>
          <div className="flex flex-wrap gap-1 mt-2">
            {Object.entries(servicesByType).map(([type, count]) => (
              <div key={type} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${getServiceTypeColor(type)}`} />
                <span className="text-xs text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Total Connections */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Connections</CardTitle>
          <GitBranch className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{connections.length}</div>
          <div className="flex flex-wrap gap-1 mt-2">
            {Object.entries(connectionsByType).map(([type, count]) => (
              <Badge key={type} variant="outline" className="text-xs">
                {type}: {count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* API Endpoints */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">API Endpoints</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalEndpoints}</div>
          <p className="text-xs text-muted-foreground mt-2">Across {servicesByType.api || 0} API services</p>
        </CardContent>
      </Card>

      {/* Technologies */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Technologies</CardTitle>
          <Database className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{technologies.length}</div>
          <div className="flex flex-wrap gap-1 mt-2">
            {technologies.slice(0, 3).map((tech) => (
              <Badge key={tech} variant="secondary" className="text-xs">
                {tech}
              </Badge>
            ))}
            {technologies.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{technologies.length - 3}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
