"use client"

import { useState } from "react"
import type { MicroserviceNode, ServiceConnection } from "@/lib/file-analyzer"
import { CodeGenerator, type GeneratedFile } from "@/lib/code-generator"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Code2, Download, FileText, Settings, Database, Globe, BookOpen } from "lucide-react"

interface CodeGeneratorPanelProps {
  services: MicroserviceNode[]
  connections: ServiceConnection[]
}

export function CodeGeneratorPanel({ services, connections }: CodeGeneratorPanelProps) {
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([])
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerateCode = async () => {
    setIsGenerating(true)

    try {
      const generator = new CodeGenerator(services, connections)
      const files = generator.generateAll()
      setGeneratedFiles(files)
      setSelectedFile(files[0] || null)
    } catch (error) {
      console.error("Code generation failed:", error)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownloadAll = () => {
    if (generatedFiles.length === 0) return

    // Create a zip-like structure by downloading individual files
    generatedFiles.forEach((file) => {
      const blob = new Blob([file.content], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = file.path.replace("/", "_")
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
  }

  const handleDownloadFile = (file: GeneratedFile) => {
    const blob = new Blob([file.content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = file.path.replace("/", "_")
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getFileIcon = (type: GeneratedFile["type"]) => {
    const icons = {
      config: Settings,
      api: Code2,
      client: Globe,
      docker: Database,
      docs: BookOpen,
    }
    const Icon = icons[type] || FileText
    return <Icon className="h-4 w-4" />
  }

  const getFileTypeColor = (type: GeneratedFile["type"]) => {
    const colors = {
      config: "bg-blue-500",
      api: "bg-green-500",
      client: "bg-purple-500",
      docker: "bg-orange-500",
      docs: "bg-gray-500",
    }
    return colors[type] || "bg-gray-500"
  }

  const filesByType = generatedFiles.reduce(
    (acc, file) => {
      if (!acc[file.type]) acc[file.type] = []
      acc[file.type].push(file)
      return acc
    },
    {} as Record<string, GeneratedFile[]>,
  )

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="h-5 w-5" />
              Code Generator
            </CardTitle>
            <CardDescription>
              Generate deployment configurations and service clients from your architecture
            </CardDescription>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleGenerateCode} disabled={services.length === 0 || isGenerating} size="sm">
              {isGenerating ? "Generating..." : "Generate Code"}
            </Button>

            {generatedFiles.length > 0 && (
              <Button onClick={handleDownloadAll} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download All
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {generatedFiles.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-center">
            <div className="space-y-2">
              <Code2 className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">
                {services.length === 0
                  ? "Upload a repository to generate code"
                  : 'Click "Generate Code" to create deployment configurations'}
              </p>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="files" className="h-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="files">Generated Files</TabsTrigger>
              <TabsTrigger value="preview">File Preview</TabsTrigger>
            </TabsList>

            <TabsContent value="files" className="mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{generatedFiles.length} files generated</p>
                </div>

                <ScrollArea className="h-96">
                  <div className="space-y-3">
                    {Object.entries(filesByType).map(([type, files]) => (
                      <div key={type} className="space-y-2">
                        <h4 className="text-sm font-medium capitalize flex items-center gap-2">
                          {getFileIcon(type as GeneratedFile["type"])}
                          {type} Files ({files.length})
                        </h4>

                        <div className="space-y-1 ml-6">
                          {files.map((file, index) => (
                            <div
                              key={index}
                              className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer hover:bg-accent ${
                                selectedFile === file ? "bg-accent" : ""
                              }`}
                              onClick={() => setSelectedFile(file)}
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${getFileTypeColor(file.type)}`} />
                                <span className="text-sm font-mono">{file.path}</span>
                              </div>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDownloadFile(file)
                                }}
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-4">
              {selectedFile ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getFileIcon(selectedFile.type)}
                      <span className="font-mono text-sm">{selectedFile.path}</span>
                      <Badge variant="secondary" className="text-xs">
                        {selectedFile.type}
                      </Badge>
                    </div>

                    <Button variant="outline" size="sm" onClick={() => handleDownloadFile(selectedFile)}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>

                  <ScrollArea className="h-96">
                    <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto">
                      <code>{selectedFile.content}</code>
                    </pre>
                  </ScrollArea>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <p className="text-muted-foreground">Select a file to preview</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}
