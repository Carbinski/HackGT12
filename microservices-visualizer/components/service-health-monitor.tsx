"use client"

import { useState, useEffect } from "react"
import type { MicroserviceNode } from "@/lib/file-analyzer"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Activity, CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react"

interface ServiceHealthMonitorProps {
  services: MicroserviceNode[]
}

interface ServiceHealth {
  id: string
  status: "healthy" | "unhealthy" | "warning" | "unknown"
  responseTime: number
  lastChecked: Date
  uptime: number
}

export function ServiceHealthMonitor({ services }: ServiceHealthMonitorProps) {
  const [healthData, setHealthData] = useState<ServiceHealth[]>([])
  const [isChecking, setIsChecking] = useState(false)

  // Simulate health check data
  const generateMockHealthData = (): ServiceHealth[] => {
    return services.map((service) => ({
      id: service.id,
      status: Math.random() > 0.8 ? "unhealthy" : Math.random() > 0.9 ? "warning" : "healthy",
      responseTime: Math.floor(Math.random() * 200) + 50,
      lastChecked: new Date(),
      uptime: Math.random() * 100,
    }))
  }

  const checkServiceHealth = async () => {
    setIsChecking(true)

    // Simulate API calls to health endpoints
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const newHealthData = generateMockHealthData()
    setHealthData(newHealthData)
    setIsChecking(false)
  }

  useEffect(() => {
    if (services.length > 0) {
      checkServiceHealth()
    }
  }, [services])

  const getStatusIcon = (status: ServiceHealth["status"]) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "unhealthy":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "warning":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusColor = (status: ServiceHealth["status"]) => {
    switch (status) {
      case "healthy":
        return "bg-green-500"
      case "unhealthy":
        return "bg-red-500"
      case "warning":
        return "bg-yellow-500"
      default:
        return "bg-gray-500"
    }
  }

  const healthyCount = healthData.filter((h) => h.status === "healthy").length
  const unhealthyCount = healthData.filter((h) => h.status === "unhealthy").length
  const warningCount = healthData.filter((h) => h.status === "warning").length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Service Health Monitor
            </CardTitle>
            <CardDescription>Real-time health status of your microservices</CardDescription>
          </div>

          <Button onClick={checkServiceHealth} disabled={isChecking} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${isChecking ? "animate-spin" : ""}`} />
            {isChecking ? "Checking..." : "Refresh"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Health Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">{healthyCount}</div>
            <div className="text-xs text-muted-foreground">Healthy</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-500">{warningCount}</div>
            <div className="text-xs text-muted-foreground">Warning</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500">{unhealthyCount}</div>
            <div className="text-xs text-muted-foreground">Unhealthy</div>
          </div>
        </div>

        {/* Service List */}
        <ScrollArea className="h-64">
          <div className="space-y-2">
            {healthData.map((health) => {
              const service = services.find((s) => s.id === health.id)
              return (
                <div key={health.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(health.status)}
                    <div>
                      <div className="font-medium text-sm">{service?.name || health.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {service?.type} • Port {service?.port || "N/A"}
                      </div>
                    </div>
                  </div>

                  <div className="text-right space-y-1">
                    <Badge variant={health.status === "healthy" ? "default" : "destructive"} className="text-xs">
                      {health.status}
                    </Badge>
                    <div className="text-xs text-muted-foreground">
                      {health.responseTime}ms • {health.uptime.toFixed(1)}% uptime
                    </div>
                    <div className="text-xs text-muted-foreground">{health.lastChecked.toLocaleTimeString()}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>

        {healthData.length === 0 && (
          <div className="text-center py-8">
            <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No health data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
