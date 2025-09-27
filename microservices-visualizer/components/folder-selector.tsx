"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, FolderOpen, X, Scan, Upload } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface FolderSelectorProps {
  onGraphGenerated: (graph: any) => void
  onReviewCacheKey?: (key: string) => void
}

interface SelectedFolder {
  name: string
  path: string
  handle: FileSystemDirectoryHandle
}

export function FolderSelector({ onGraphGenerated }: FolderSelectorProps) {
  const [folders, setFolders] = useState<SelectedFolder[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)

  const selectFolder = async () => {
    try {
      // Check if the browser supports the File System Access API
      if (!('showDirectoryPicker' in window)) {
        toast({
          title: "Browser Not Supported",
          description: "Your browser doesn't support folder selection. Please use Chrome, Edge, or another Chromium-based browser.",
          variant: "destructive"
        })
        return
      }

      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'read'
      })

      const folderPath = dirHandle.name
      const newFolder: SelectedFolder = {
        name: dirHandle.name,
        path: folderPath,
        handle: dirHandle
      }

      // Check if folder is already selected
      if (folders.some(f => f.name === newFolder.name)) {
        toast({
          title: "Folder Already Selected",
          description: `The folder "${newFolder.name}" is already in your selection.`,
          variant: "destructive"
        })
        return
      }

      setFolders(prev => [...prev, newFolder])
      
      toast({
        title: "Folder Added",
        description: `Added "${newFolder.name}" to scan list.`
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled the picker
        return
      }
      console.error('Error selecting folder:', error)
      toast({
        title: "Selection Failed",
        description: "Failed to select folder. Please try again.",
        variant: "destructive"
      })
    }
  }

  const removeFolder = (folderToRemove: SelectedFolder) => {
    setFolders(prev => prev.filter(f => f.name !== folderToRemove.name))
  }

  // Get all file paths from selected folders
  const getAllFilePaths = async (): Promise<string[]> => {
    const allPaths: string[] = []
    
    for (const folder of folders) {
      try {
        const paths = await getFolderPaths(folder.handle, folder.name)
        allPaths.push(...paths)
      } catch (error) {
        console.error(`Error reading folder ${folder.name}:`, error)
      }
    }
    
    return allPaths
  }

  // Recursively get all file paths from a directory handle
  const getFolderPaths = async (dirHandle: FileSystemDirectoryHandle, basePath: string): Promise<string[]> => {
    const paths: string[] = []
    
    try {
      for await (const [name, handle] of dirHandle.entries()) {
        const fullPath = `${basePath}/${name}`
        
        if (handle.kind === 'directory') {
          // Skip common ignore directories
          if (['node_modules', '.git', 'dist', 'build', '.next'].includes(name)) {
            continue
          }
          const subPaths = await getFolderPaths(handle, fullPath)
          paths.push(...subPaths)
        } else if (handle.kind === 'file') {
          // Only include relevant files
          if (name.match(/\.(ts|js|json|py|java|go|yaml|yml)$/) || 
              ['cdk.json', 'package.json', 'requirements.txt', 'pyproject.toml', 'go.mod'].includes(name)) {
            paths.push(fullPath)
          }
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${basePath}:`, error)
    }
    
    return paths
  }

  const scanFolders = async () => {
    if (folders.length === 0) {
      toast({
        title: "No folders selected",
        description: "Please select at least one folder to scan.",
        variant: "destructive"
      })
      return
    }

    setIsScanning(true)
    setScanResult(null)

    try {
      // Read files from selected folders using File System Access API
      const fileContents: { [path: string]: string } = {}
      
      for (const folder of folders) {
        await readFolderContents(folder.handle, folder.name, fileContents)
      }

      // Send file contents to the API for analysis
      const response = await fetch('/api/cdk-scan-files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: fileContents }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.details || error.error || 'Failed to scan folders')
      }

      const result = await response.json()
      setScanResult(result)
      if (result?.cacheKey && onReviewCacheKey) {
        try { onReviewCacheKey(result.cacheKey) } catch {}
      }

      if (result.graph) {
        onGraphGenerated(result.graph)
        toast({
          title: "CDK Scan Complete",
          description: `Found ${result.cdkResult.summary.total_projects} CDK projects with ${result.graph.nodes?.length || 0} resources.${result.cached ? ' (Cached result)' : ''}`,
        })
      } else {
        toast({
          title: "No CDK Projects Found",
          description: "No CDK projects were detected in the selected folders.",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('CDK scan failed:', error)
      toast({
        title: "Scan Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      })
    } finally {
      setIsScanning(false)
    }
  }

  // Read file contents from a directory handle
  const readFolderContents = async (
    dirHandle: FileSystemDirectoryHandle, 
    basePath: string, 
    fileContents: { [path: string]: string }
  ) => {
    try {
      for await (const [name, handle] of dirHandle.entries()) {
        const fullPath = `${basePath}/${name}`
        
        if (handle.kind === 'directory') {
          // Skip common ignore directories
          if (['node_modules', '.git', 'dist', 'build', '.next', 'cdk.out'].includes(name)) {
            continue
          }
          await readFolderContents(handle, fullPath, fileContents)
        } else if (handle.kind === 'file') {
          // Only read relevant files
          if (name.match(/\.(ts|js|json|py|java|go|yaml|yml)$/) || 
              ['cdk.json', 'package.json', 'requirements.txt', 'pyproject.toml', 'go.mod'].includes(name)) {
            try {
              const file = await handle.getFile()
              const content = await file.text()
              fileContents[fullPath] = content
            } catch (error) {
              console.warn(`Failed to read file ${fullPath}:`, error)
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${basePath}:`, error)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          CDK Repository Scanner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Folder Picker */}
        <div className="space-y-2">
          <Button 
            onClick={selectFolder} 
            variant="outline" 
            className="w-full"
            disabled={isScanning}
          >
            <Upload className="h-4 w-4 mr-2" />
            Select Repository Folder
          </Button>
          <p className="text-xs text-muted-foreground">
            Click to browse and select folders containing your CDK repositories
          </p>
        </div>

        {/* Selected Folders */}
        {folders.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Selected Folders ({folders.length})</div>
            <div className="space-y-1">
              {folders.map((folder, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted rounded-md">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{folder.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => removeFolder(folder)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scan Button */}
        <Button 
          onClick={scanFolders} 
          disabled={isScanning || folders.length === 0}
          className="w-full"
        >
          {isScanning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Scanning CDK Projects...
            </>
          ) : (
            <>
              <Scan className="h-4 w-4 mr-2" />
              Scan & Generate Graph
            </>
          )}
        </Button>

        {/* Scan Results Summary */}
        {scanResult && (
          <div className="space-y-2 p-3 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-medium">Scan Results</span>
              {scanResult.cached && (
                <Badge variant="outline">Cached</Badge>
              )}
            </div>
            <div className="text-sm space-y-1">
              <div>Projects: {scanResult.cdkResult.summary.total_projects}</div>
              <div>CDK Files: {scanResult.cdkResult.summary.total_files}</div>
              <div>Languages: {scanResult.cdkResult.summary.languages.join(', ')}</div>
              <div>AWS Services: {scanResult.cdkResult.summary.aws_services.join(', ')}</div>
              {scanResult.graph && (
                <div>Graph: {scanResult.graph.nodes?.length || 0} nodes, {scanResult.graph.edges?.length || 0} edges</div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
