"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, FolderOpen, FileText, Loader2 } from "lucide-react"
import { FileAnalyzer, type MicroserviceNode, type ServiceConnection } from "@/lib/file-analyzer"

interface FileUploadProps {
  onAnalysisComplete: (services: MicroserviceNode[], connections: ServiceConnection[]) => void
}

export function FileUpload({ onAnalysisComplete }: FileUploadProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    setUploadedFiles(files)
  }, [])

  const handleDirectoryUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    setUploadedFiles(files)
  }, [])

  const analyzeFiles = useCallback(async () => {
    if (uploadedFiles.length === 0) return

    setIsAnalyzing(true)

    try {
      const analyzer = new FileAnalyzer()
      const fileContents = await Promise.all(
        uploadedFiles.map(async (file) => ({
          path: file.webkitRelativePath || file.name,
          content: await file.text(),
        })),
      )

      const { services, connections } = await analyzer.analyzeRepository(fileContents)
      onAnalysisComplete(services, connections)
    } catch (error) {
      console.error("Analysis failed:", error)
    } finally {
      setIsAnalyzing(false)
    }
  }, [uploadedFiles, onAnalysisComplete])

  return (
    <div className="grid gap-6">
      <Card className="glow-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Repository
          </CardTitle>
          <CardDescription>
            Upload your microservices repository to analyze the architecture and generate a visual graph
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Upload Directory</label>
              <div className="relative">
                <input
                  type="file"
                  webkitdirectory=""
                  multiple
                  onChange={handleDirectoryUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button variant="outline" className="w-full justify-start bg-transparent">
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Select Repository Folder
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Upload Files</label>
              <div className="relative">
                <input
                  type="file"
                  multiple
                  accept=".json,.js,.ts,.py,.go,.java,.cs,.yaml,.yml,.toml,.env,Dockerfile"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button variant="outline" className="w-full justify-start bg-transparent">
                  <FileText className="h-4 w-4 mr-2" />
                  Select Individual Files
                </Button>
              </div>
            </div>
          </div>

          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{uploadedFiles.length} files selected</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {uploadedFiles.slice(0, 10).map((file, index) => (
                  <div key={index} className="text-xs text-muted-foreground font-mono">
                    {file.webkitRelativePath || file.name}
                  </div>
                ))}
                {uploadedFiles.length > 10 && (
                  <div className="text-xs text-muted-foreground">... and {uploadedFiles.length - 10} more files</div>
                )}
              </div>
            </div>
          )}

          <Button onClick={analyzeFiles} disabled={uploadedFiles.length === 0 || isAnalyzing} className="w-full">
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing Architecture...
              </>
            ) : (
              "Analyze Repository"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
