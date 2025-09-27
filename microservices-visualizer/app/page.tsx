"use client"

import type React from "react"

import { useState } from "react"
import { FileUpload } from "@/components/file-upload"
import { ServiceGraph } from "@/components/service-graph"
import { ServiceDetails } from "@/components/service-details"
import { ConnectionEditor } from "@/components/connection-editor"
import { ServiceEditor } from "@/components/service-editor"
import { CodeGeneratorPanel } from "@/components/code-generator-panel"
import { ArchitectureStats } from "@/components/architecture-stats"
import { ServiceHealthMonitor } from "@/components/service-health-monitor"
import { QuickActions } from "@/components/quick-actions"
import type { MicroserviceNode, ServiceConnection } from "@/lib/file-analyzer"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Download, Upload, RotateCcw } from "lucide-react"

export default function HomePage() {
  const [services, setServices] = useState<MicroserviceNode[]>([])
  const [connections, setConnections] = useState<ServiceConnection[]>([])
  const [analysisComplete, setAnalysisComplete] = useState(false)
  const [selectedNode, setSelectedNode] = useState<MicroserviceNode | null>(null)
  const [activeTab, setActiveTab] = useState("connections")

  const handleAnalysisComplete = (newServices: MicroserviceNode[], newConnections: ServiceConnection[]) => {
    setServices(newServices)
    setConnections(newConnections)
    setAnalysisComplete(true)
  }

  const handleNodeSelect = (node: MicroserviceNode | null) => {
    setSelectedNode(node)
  }

  const handleServicesChange = (newServices: MicroserviceNode[]) => {
    setServices(newServices)
  }

  const handleConnectionsChange = (newConnections: ServiceConnection[]) => {
    setConnections(newConnections)
  }

  const exportConfiguration = () => {
    const config = {
      services,
      connections,
      timestamp: new Date().toISOString(),
    }

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "microservices-architecture.json"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const importConfiguration = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const config = JSON.parse(e.target?.result as string)
          if (config.services && config.connections) {
            setServices(config.services)
            setConnections(config.connections)
            setAnalysisComplete(true)
          }
        } catch (error) {
          console.error("Failed to import configuration:", error)
        }
      }
      reader.readAsText(file)
    }
  }

  const resetArchitecture = () => {
    setServices([])
    setConnections([])
    setAnalysisComplete(false)
    setSelectedNode(null)
  }

  return (
    <div className="min-h-screen bg-background grid-bg">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold text-balance">Microservices Architecture Visualizer</h1>
            <p className="text-xl text-muted-foreground text-pretty">
              Analyze, visualize, and manage your microservices architecture with interactive tools
            </p>
          </div>

          {!analysisComplete ? (
            <FileUpload onAnalysisComplete={handleAnalysisComplete} />
          ) : (
            <div className="space-y-6">
              {/* Header with Actions */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold mb-2">Architecture Dashboard</h2>
                  <p className="text-muted-foreground">Manage and monitor your microservices ecosystem</p>
                </div>

                <div className="flex gap-2">
                  <div className="relative">
                    <input
                      type="file"
                      accept=".json"
                      onChange={importConfiguration}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Button variant="outline" size="sm">
                      <Upload className="h-4 w-4 mr-2" />
                      Import
                    </Button>
                  </div>
                  <Button onClick={exportConfiguration} variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                  <Button onClick={resetArchitecture} variant="outline" size="sm">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                </div>
              </div>

              {/* Architecture Stats */}
              <ArchitectureStats services={services} connections={connections} />

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Graph Visualization */}
                <div className="lg:col-span-3 space-y-6">
                  <ServiceGraph services={services} connections={connections} onNodeSelect={handleNodeSelect} />

                  {/* Health Monitor */}
                  <ServiceHealthMonitor services={services} />
                </div>

                {/* Sidebar */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Service Details */}
                  <ServiceDetails selectedNode={selectedNode} connections={connections} />

                  {/* Quick Actions */}
                  <QuickActions
                    services={services}
                    connections={connections}
                    onAddService={() => setActiveTab("services")}
                    onAddConnection={() => setActiveTab("connections")}
                    onGenerateCode={() => setActiveTab("generate")}
                    onExportConfig={exportConfiguration}
                    onImportConfig={() => document.querySelector('input[type="file"]')?.click()}
                    onViewDocs={() => setActiveTab("generate")}
                  />

                  {/* Editor Tabs */}
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="connections">Connections</TabsTrigger>
                      <TabsTrigger value="services">Services</TabsTrigger>
                      <TabsTrigger value="generate">Generate</TabsTrigger>
                    </TabsList>

                    <TabsContent value="connections" className="mt-4">
                      <ConnectionEditor
                        services={services}
                        connections={connections}
                        onConnectionsChange={handleConnectionsChange}
                      />
                    </TabsContent>

                    <TabsContent value="services" className="mt-4">
                      <ServiceEditor
                        services={services}
                        onServicesChange={handleServicesChange}
                        selectedService={selectedNode}
                      />
                    </TabsContent>

                    <TabsContent value="generate" className="mt-4">
                      <CodeGeneratorPanel services={services} connections={connections} />
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
