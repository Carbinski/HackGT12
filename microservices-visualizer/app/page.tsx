"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PrettyGraph } from "@/components/pretty-graph"
import { loadGraphFromFile, mapAiGraphToUiFormat } from "@/lib/graph-mapper"
import type { MicroserviceNode, ServiceConnection } from "@/lib/file-analyzer"
import { 
  Database, 
  Zap, 
  Cloud, 
  MessageSquare, 
  Globe, 
  Workflow,
  Download,
  RotateCcw
} from "lucide-react"

// Available AWS service types for quick add
const AWS_SERVICES = [
  { type: "Lambda", icon: Zap, color: "bg-orange-500", label: "Lambda Function" },
  { type: "Table", icon: Database, color: "bg-blue-500", label: "DynamoDB Table" },
  { type: "Queue", icon: MessageSquare, color: "bg-purple-500", label: "SQS Queue" },
  { type: "Topic", icon: MessageSquare, color: "bg-pink-500", label: "SNS Topic" },
  { type: "ApiGateway", icon: Globe, color: "bg-green-500", label: "API Gateway" },
  { type: "StepFn", icon: Workflow, color: "bg-indigo-500", label: "Step Functions" },
]

export default function HomePage() {
  const [services, setServices] = useState<MicroserviceNode[]>([])
  const [connections, setConnections] = useState<ServiceConnection[]>([])
  const [selectedNode, setSelectedNode] = useState<MicroserviceNode | null>(null)

  const handleNodeSelect = (node: MicroserviceNode | null) => {
    setSelectedNode(node)
  }

  const loadAiGraph = async () => {
    try {
      const aiGraph = await loadGraphFromFile('/graph_v4_final.json')
      const { services: mappedServices, connections: mappedConnections } = mapAiGraphToUiFormat(aiGraph)
      setServices(mappedServices)
      setConnections(mappedConnections)
    } catch (error) {
      console.error('Failed to load AI graph:', error)
    }
  }

  const addService = (serviceType: string) => {
    const newService: MicroserviceNode = {
      id: `${serviceType}-${Date.now()}`,
      name: `New ${serviceType}`,
      type: serviceType === "Lambda" ? "api" : 
            serviceType === "Table" ? "database" : 
            serviceType === "Queue" || serviceType === "Topic" ? "queue" : 
            serviceType === "ApiGateway" ? "api" : "external",
      path: `/services/${serviceType.toLowerCase()}`,
      dependencies: [],
      technologies: [serviceType],
      description: `AWS ${serviceType} service`
    }
    setServices(prev => [...prev, newService])
  }

  const exportGraph = () => {
    const data = { services, connections, timestamp: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "architecture-graph.json"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const clearGraph = () => {
    setServices([])
    setConnections([])
    setSelectedNode(null)
  }

  return (
    <div className="h-screen bg-background flex">
      {/* Left Sidebar - Palette */}
      <div className="w-80 border-r bg-card p-4 space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-4">AWS Services</h2>
          <div className="space-y-2">
            {AWS_SERVICES.map((service) => (
              <Button
                key={service.type}
                variant="outline"
                className="w-full justify-start"
                onClick={() => addService(service.type)}
              >
                <service.icon className={`h-4 w-4 mr-2 text-white rounded p-0.5 ${service.color}`} />
                {service.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-4 border-t">
          <Button onClick={loadAiGraph} className="w-full" variant="default">
            <Zap className="h-4 w-4 mr-2" />
            Load Sample Graph
          </Button>
          
          <Button onClick={exportGraph} variant="outline" className="w-full">
            Export JSON
          </Button>
          
          <Button onClick={clearGraph} variant="outline" className="w-full">
            <RotateCcw className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </div>

        {/* Selected Node Info */}
        {selectedNode && (
          <div className="text-sm text-muted-foreground">
            <div className="font-medium text-foreground">Selected</div>
            <div className="mt-1">Name: {selectedNode.name}</div>
            <div>Type: {selectedNode.technologies?.[0] || selectedNode.type}</div>
          </div>
        )}
      </div>

      {/* Main Graph Area */}
      <div className="flex-1 flex flex-col">
        <div className="border-b bg-card px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Architecture Graph</h1>
              <p className="text-sm text-muted-foreground">
                {services.length} services, {connections.length} connections
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1">
          {services.length > 0 ? (
            <PrettyGraph 
              services={services} 
              connections={connections} 
              onNodeSelect={handleNodeSelect}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-center">
              <div className="space-y-4">
                <Cloud className="h-16 w-16 mx-auto text-muted-foreground" />
                <div>
                  <h3 className="text-lg font-medium">Start Building Your Architecture</h3>
                  <p className="text-muted-foreground">
                    Add AWS services from the sidebar or load the sample graph
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}