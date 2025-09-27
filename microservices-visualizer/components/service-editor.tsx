"use client"

import { useState } from "react"
import type { MicroserviceNode } from "@/lib/file-analyzer"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Edit3, Save, X, Server } from "lucide-react"

interface ServiceEditorProps {
  services: MicroserviceNode[]
  onServicesChange: (services: MicroserviceNode[]) => void
  selectedService?: MicroserviceNode | null
}

export function ServiceEditor({ services, onServicesChange, selectedService }: ServiceEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editingService, setEditingService] = useState<MicroserviceNode | null>(null)
  const [newService, setNewService] = useState<Partial<MicroserviceNode>>({
    id: "",
    name: "",
    type: "api",
    path: "",
    dependencies: [],
    endpoints: [],
    technologies: [],
    description: "",
    port: undefined,
  })

  const handleAddService = () => {
    if (newService.id && newService.name && newService.type && newService.path) {
      const service: MicroserviceNode = {
        id: newService.id,
        name: newService.name,
        type: newService.type as MicroserviceNode["type"],
        path: newService.path,
        dependencies: newService.dependencies || [],
        endpoints: newService.endpoints || [],
        technologies: newService.technologies || [],
        description: newService.description,
        port: newService.port,
      }

      onServicesChange([...services, service])
      setNewService({
        id: "",
        name: "",
        type: "api",
        path: "",
        dependencies: [],
        endpoints: [],
        technologies: [],
        description: "",
        port: undefined,
      })
    }
  }

  const handleEditService = (service: MicroserviceNode) => {
    setEditingService(service)
    setNewService({ ...service })
    setIsEditing(true)
  }

  const handleSaveEdit = () => {
    if (editingService && newService.id && newService.name && newService.type && newService.path) {
      const updatedServices = services.map((service) =>
        service === editingService
          ? {
              id: newService.id!,
              name: newService.name!,
              type: newService.type as MicroserviceNode["type"],
              path: newService.path!,
              dependencies: newService.dependencies || [],
              endpoints: newService.endpoints || [],
              technologies: newService.technologies || [],
              description: newService.description,
              port: newService.port,
            }
          : service,
      )

      onServicesChange(updatedServices)
      setIsEditing(false)
      setEditingService(null)
      setNewService({
        id: "",
        name: "",
        type: "api",
        path: "",
        dependencies: [],
        endpoints: [],
        technologies: [],
        description: "",
        port: undefined,
      })
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditingService(null)
    setNewService({
      id: "",
      name: "",
      type: "api",
      path: "",
      dependencies: [],
      endpoints: [],
      technologies: [],
      description: "",
      port: undefined,
    })
  }

  const handleDeleteService = (service: MicroserviceNode) => {
    const updatedServices = services.filter((s) => s !== service)
    onServicesChange(updatedServices)
  }

  const addTechnology = (tech: string) => {
    if (tech && !newService.technologies?.includes(tech)) {
      setNewService((prev) => ({
        ...prev,
        technologies: [...(prev.technologies || []), tech],
      }))
    }
  }

  const removeTechnology = (tech: string) => {
    setNewService((prev) => ({
      ...prev,
      technologies: prev.technologies?.filter((t) => t !== tech) || [],
    }))
  }

  const addEndpoint = (endpoint: string) => {
    if (endpoint && !newService.endpoints?.includes(endpoint)) {
      setNewService((prev) => ({
        ...prev,
        endpoints: [...(prev.endpoints || []), endpoint],
      }))
    }
  }

  const removeEndpoint = (endpoint: string) => {
    setNewService((prev) => ({
      ...prev,
      endpoints: prev.endpoints?.filter((e) => e !== endpoint) || [],
    }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Service Editor
        </CardTitle>
        <CardDescription>Add, edit, or remove microservices in your architecture</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add/Edit Service Form */}
        <div className="space-y-4 p-4 border border-border rounded-lg">
          <h4 className="text-sm font-medium">{isEditing ? "Edit Service" : "Add New Service"}</h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="service-id">Service ID</Label>
              <Input
                id="service-id"
                placeholder="user-service"
                value={newService.id || ""}
                onChange={(e) => setNewService((prev) => ({ ...prev, id: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="service-name">Service Name</Label>
              <Input
                id="service-name"
                placeholder="User Service"
                value={newService.name || ""}
                onChange={(e) => setNewService((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="service-type">Service Type</Label>
              <Select
                value={newService.type}
                onValueChange={(value) =>
                  setNewService((prev) => ({ ...prev, type: value as MicroserviceNode["type"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="api">API Service</SelectItem>
                  <SelectItem value="frontend">Frontend</SelectItem>
                  <SelectItem value="database">Database</SelectItem>
                  <SelectItem value="queue">Message Queue</SelectItem>
                  <SelectItem value="cache">Cache</SelectItem>
                  <SelectItem value="external">External Service</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="service-path">Path</Label>
              <Input
                id="service-path"
                placeholder="/services/user-service"
                value={newService.path || ""}
                onChange={(e) => setNewService((prev) => ({ ...prev, path: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="service-port">Port (optional)</Label>
              <Input
                id="service-port"
                type="number"
                placeholder="3000"
                value={newService.port || ""}
                onChange={(e) =>
                  setNewService((prev) => ({
                    ...prev,
                    port: e.target.value ? Number.parseInt(e.target.value) : undefined,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="service-description">Description</Label>
            <Textarea
              id="service-description"
              placeholder="Handles user authentication and profile management"
              value={newService.description || ""}
              onChange={(e) => setNewService((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>

          {/* Technologies */}
          <div className="space-y-2">
            <Label>Technologies</Label>
            <div className="flex flex-wrap gap-1 mb-2">
              {newService.technologies?.map((tech) => (
                <Badge key={tech} variant="secondary" className="text-xs">
                  {tech}
                  <button onClick={() => removeTechnology(tech)} className="ml-1 text-xs hover:text-destructive">
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add technology (e.g., Node.js, React)"
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    addTechnology(e.currentTarget.value)
                    e.currentTarget.value = ""
                  }
                }}
              />
            </div>
          </div>

          {/* Endpoints */}
          {newService.type === "api" && (
            <div className="space-y-2">
              <Label>API Endpoints</Label>
              <div className="flex flex-wrap gap-1 mb-2">
                {newService.endpoints?.map((endpoint) => (
                  <Badge key={endpoint} variant="outline" className="text-xs font-mono">
                    {endpoint}
                    <button onClick={() => removeEndpoint(endpoint)} className="ml-1 text-xs hover:text-destructive">
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add endpoint (e.g., GET /api/users)"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      addEndpoint(e.currentTarget.value)
                      e.currentTarget.value = ""
                    }
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button onClick={handleSaveEdit} size="sm">
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
                <Button onClick={handleCancelEdit} variant="outline" size="sm">
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </>
            ) : (
              <Button onClick={handleAddService} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Service
              </Button>
            )}
          </div>
        </div>

        {/* Existing Services List */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Existing Services ({services.length})</h4>

          {services.length === 0 ? (
            <p className="text-sm text-muted-foreground">No services found</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {services.map((service, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-3 border rounded-lg ${
                    selectedService === service ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-xs">
                      {service.type}
                    </Badge>
                    <div className="text-sm">
                      <span className="font-medium">{service.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs font-mono">{service.path}</span>
                    </div>
                    {service.port && (
                      <Badge variant="outline" className="text-xs">
                        :{service.port}
                      </Badge>
                    )}
                  </div>

                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEditService(service)}>
                      <Edit3 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteService(service)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
