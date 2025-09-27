"use client"

import type { MicroserviceNode, ServiceConnection } from "@/lib/file-analyzer"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Zap, Plus, GitBranch, Code2, FileText, Download, Upload } from "lucide-react"

interface QuickActionsProps {
  services: MicroserviceNode[]
  connections: ServiceConnection[]
  onAddService: () => void
  onAddConnection: () => void
  onGenerateCode: () => void
  onExportConfig: () => void
  onImportConfig: () => void
  onViewDocs: () => void
}

export function QuickActions({
  services,
  connections,
  onAddService,
  onAddConnection,
  onGenerateCode,
  onExportConfig,
  onImportConfig,
  onViewDocs,
}: QuickActionsProps) {
  const recentChanges = [
    { type: "service", action: "added", name: "user-service", time: "2 min ago" },
    { type: "connection", action: "modified", name: "api-gateway → user-service", time: "5 min ago" },
    { type: "service", action: "updated", name: "payment-service", time: "10 min ago" },
  ]

  const suggestions = [
    {
      title: "Add API Gateway",
      description: "Consider adding an API gateway to manage external requests",
      action: "Add Service",
      priority: "high",
    },
    {
      title: "Database Connection",
      description: "user-service might need a database connection",
      action: "Add Connection",
      priority: "medium",
    },
    {
      title: "Load Balancer",
      description: "Multiple API services could benefit from load balancing",
      action: "Add Service",
      priority: "low",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Quick Actions
          </CardTitle>
          <CardDescription>Common tasks and operations for your architecture</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={onAddService} variant="outline" className="justify-start bg-transparent">
              <Plus className="h-4 w-4 mr-2" />
              Add Service
            </Button>

            <Button onClick={onAddConnection} variant="outline" className="justify-start bg-transparent">
              <GitBranch className="h-4 w-4 mr-2" />
              Add Connection
            </Button>

            <Button onClick={onGenerateCode} variant="outline" className="justify-start bg-transparent">
              <Code2 className="h-4 w-4 mr-2" />
              Generate Code
            </Button>

            <Button onClick={onViewDocs} variant="outline" className="justify-start bg-transparent">
              <FileText className="h-4 w-4 mr-2" />
              View Docs
            </Button>

            <Button onClick={onExportConfig} variant="outline" className="justify-start bg-transparent">
              <Download className="h-4 w-4 mr-2" />
              Export Config
            </Button>

            <Button onClick={onImportConfig} variant="outline" className="justify-start bg-transparent">
              <Upload className="h-4 w-4 mr-2" />
              Import Config
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Changes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Changes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentChanges.map((change, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      change.action === "added"
                        ? "bg-green-500"
                        : change.action === "modified"
                          ? "bg-blue-500"
                          : "bg-yellow-500"
                    }`}
                  />
                  <span className="font-medium">{change.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {change.action}
                  </Badge>
                </div>
                <span className="text-muted-foreground text-xs">{change.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Architecture Suggestions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Suggestions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="p-3 border border-border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{suggestion.title}</h4>
                  <Badge
                    variant={
                      suggestion.priority === "high"
                        ? "destructive"
                        : suggestion.priority === "medium"
                          ? "default"
                          : "secondary"
                    }
                    className="text-xs"
                  >
                    {suggestion.priority}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{suggestion.description}</p>
                <Button size="sm" variant="outline" className="text-xs bg-transparent">
                  {suggestion.action}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
