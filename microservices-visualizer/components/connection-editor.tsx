"use client"

import { useState } from "react"
import type { MicroserviceNode, ServiceConnection } from "@/lib/file-analyzer"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Edit3, Save, X } from "lucide-react"

interface ConnectionEditorProps {
  services: MicroserviceNode[]
  connections: ServiceConnection[]
  onConnectionsChange: (connections: ServiceConnection[]) => void
}

export function ConnectionEditor({ services, connections, onConnectionsChange }: ConnectionEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editingConnection, setEditingConnection] = useState<ServiceConnection | null>(null)
  const [newConnection, setNewConnection] = useState<Partial<ServiceConnection>>({
    from: "",
    to: "",
    type: "http",
    method: "GET",
    endpoint: "",
  })

  const handleAddConnection = () => {
    if (newConnection.from && newConnection.to && newConnection.type) {
      const connection: ServiceConnection = {
        from: newConnection.from,
        to: newConnection.to,
        type: newConnection.type as ServiceConnection["type"],
        method: newConnection.method,
        endpoint: newConnection.endpoint,
      }

      onConnectionsChange([...connections, connection])
      setNewConnection({ from: "", to: "", type: "http", method: "GET", endpoint: "" })
    }
  }

  const handleEditConnection = (connection: ServiceConnection) => {
    setEditingConnection(connection)
    setNewConnection({ ...connection })
    setIsEditing(true)
  }

  const handleSaveEdit = () => {
    if (editingConnection && newConnection.from && newConnection.to && newConnection.type) {
      const updatedConnections = connections.map((conn) =>
        conn === editingConnection
          ? {
              from: newConnection.from!,
              to: newConnection.to!,
              type: newConnection.type as ServiceConnection["type"],
              method: newConnection.method,
              endpoint: newConnection.endpoint,
            }
          : conn,
      )

      onConnectionsChange(updatedConnections)
      setIsEditing(false)
      setEditingConnection(null)
      setNewConnection({ from: "", to: "", type: "http", method: "GET", endpoint: "" })
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditingConnection(null)
    setNewConnection({ from: "", to: "", type: "http", method: "GET", endpoint: "" })
  }

  const handleDeleteConnection = (connection: ServiceConnection) => {
    const updatedConnections = connections.filter((conn) => conn !== connection)
    onConnectionsChange(updatedConnections)
  }

  const getConnectionTypeColor = (type: ServiceConnection["type"]) => {
    const colors = {
      http: "bg-blue-500",
      grpc: "bg-green-500",
      message: "bg-purple-500",
      database: "bg-yellow-500",
      cache: "bg-red-500",
    }
    return colors[type] || "bg-gray-500"
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Edit3 className="h-5 w-5" />
          Connection Editor
        </CardTitle>
        <CardDescription>Add, edit, or remove connections between services to modify the data flow</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add/Edit Connection Form */}
        <div className="space-y-4 p-4 border border-border rounded-lg">
          <h4 className="text-sm font-medium">{isEditing ? "Edit Connection" : "Add New Connection"}</h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from-service">From Service</Label>
              <Select
                value={newConnection.from}
                onValueChange={(value) => setNewConnection((prev) => ({ ...prev, from: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="to-service">To Service</Label>
              <Select
                value={newConnection.to}
                onValueChange={(value) => setNewConnection((prev) => ({ ...prev, to: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="connection-type">Connection Type</Label>
              <Select
                value={newConnection.type}
                onValueChange={(value) =>
                  setNewConnection((prev) => ({ ...prev, type: value as ServiceConnection["type"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="grpc">gRPC</SelectItem>
                  <SelectItem value="message">Message Queue</SelectItem>
                  <SelectItem value="database">Database</SelectItem>
                  <SelectItem value="cache">Cache</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newConnection.type === "http" && (
              <div className="space-y-2">
                <Label htmlFor="method">HTTP Method</Label>
                <Select
                  value={newConnection.method}
                  onValueChange={(value) => setNewConnection((prev) => ({ ...prev, method: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="endpoint">Endpoint/Path</Label>
              <Input
                id="endpoint"
                placeholder="/api/users"
                value={newConnection.endpoint || ""}
                onChange={(e) => setNewConnection((prev) => ({ ...prev, endpoint: e.target.value }))}
              />
            </div>
          </div>

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
              <Button onClick={handleAddConnection} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Connection
              </Button>
            )}
          </div>
        </div>

        {/* Existing Connections List */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Existing Connections ({connections.length})</h4>

          {connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No connections found</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {connections.map((connection, index) => (
                <div key={index} className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${getConnectionTypeColor(connection.type)}`} />
                    <div className="text-sm">
                      <span className="font-medium">{connection.from}</span>
                      <span className="text-muted-foreground mx-2">→</span>
                      <span className="font-medium">{connection.to}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {connection.type}
                    </Badge>
                    {connection.method && (
                      <Badge variant="secondary" className="text-xs">
                        {connection.method}
                      </Badge>
                    )}
                    {connection.endpoint && (
                      <span className="text-xs text-muted-foreground font-mono">{connection.endpoint}</span>
                    )}
                  </div>

                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEditConnection(connection)}>
                      <Edit3 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteConnection(connection)}>
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
