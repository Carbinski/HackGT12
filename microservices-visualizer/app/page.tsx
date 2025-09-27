"use client"

import React, { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PrettyGraph } from "@/components/pretty-graph"
import { FolderSelector } from "@/components/folder-selector"
import { ServiceDetails } from "@/components/service-details"
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
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Play
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
  const [runId, setRunId] = useState<number>(0)
  const [runFinished, setRunFinished] = useState<boolean>(false)
  const [reviewCacheKey, setReviewCacheKey] = useState<string | null>(null)
  const [reviewStatus, setReviewStatus] = useState<'idle'|'pending'|'ready'|'not_found'|'error'>("idle")
  const [review, setReview] = useState<any | null>(null)
  const pollTimerRef = useRef<number | null>(null)
  const [severityFilter, setSeverityFilter] = useState<'all'|'critical'|'high'|'medium'|'low'|'info'>("all")
  const [highlightedNodes, setHighlightedNodes] = useState<string[]>([])
  const [consoleWidth, setConsoleWidth] = useState<number>(400)
  const resizeRef = useRef<{ active: boolean; startX: number; startWidth: number }>({
    active: false,
    startX: 0,
    startWidth: 400
  })
  const [rightSidebarOpen, setRightSidebarOpen] = useState<boolean>(false)
  const [rightSidebarContent, setRightSidebarContent] = useState<'service' | 'ai-review'>('service')
  const [graphVersion, setGraphVersion] = useState<number>(0)


  const handleNodeSelect = (node: MicroserviceNode | null) => {
    setSelectedNode(node)
    if (node) {
      setRightSidebarContent('service')
      setRightSidebarOpen(true)
    } else {
      setRightSidebarOpen(false)
    }
  }

  const handleGraphGenerated = (aiGraph: any) => {
    try {
      console.log('CDK Graph generated:', aiGraph)
      const { services: mappedServices, connections: mappedConnections } = mapAiGraphToUiFormat(aiGraph)
      console.log('Mapped CDK services:', mappedServices.length, 'connections:', mappedConnections.length)
      setServices(mappedServices)
      setConnections(mappedConnections)
    } catch (error) {
      console.error('Failed to map CDK graph:', error)
      alert(`❌ Failed to process CDK graph: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Poll for AI review once we have a cache key
  useEffect(() => {
    if (!reviewCacheKey) return
    let attempts = 0
    setReviewStatus('pending')
    setReview(null)

    const poll = async () => {
      attempts++
      try {
        const res = await fetch(`/api/ai-review/${reviewCacheKey}`)
        if (res.ok) {
          const data = await res.json()
          if (data.status === 'ready') {
            setReviewStatus('ready')
            setReview(data.review)
            if (pollTimerRef.current) { window.clearInterval(pollTimerRef.current) }
            pollTimerRef.current = null
            return
          }
          // still pending
          setReviewStatus('pending')
        } else {
          const data = await res.json().catch(() => ({}))
          if (res.status === 404) setReviewStatus('not_found')
          else setReviewStatus('error')
          if (pollTimerRef.current) { window.clearInterval(pollTimerRef.current) }
          pollTimerRef.current = null
          return
        }
      } catch {
        setReviewStatus('error')
        if (pollTimerRef.current) { window.clearInterval(pollTimerRef.current) }
        pollTimerRef.current = null
        return
      }
      if (attempts >= 60) { // ~2 minutes max if 2s interval
        if (pollTimerRef.current) { window.clearInterval(pollTimerRef.current) }
        pollTimerRef.current = null
      }
    }

    pollTimerRef.current = window.setInterval(poll, 2000)
    // Kick immediate first poll
    poll()

    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [reviewCacheKey, runId])

  // Auto-load cache key only (not the full graph) on component mount
  useEffect(() => {
    console.log('🚀 Component mounted, loading cache key only...')
    loadCacheKeyOnly()
  }, [])

  const loadCacheKeyOnly = async () => {
    try {
      console.log('Loading cache key from latest scan...')
      const res = await fetch('/api/cdk-scan-files/latest')
      if (res.ok) {
        const latest = await res.json()
        if (latest?.cacheKey) {
          console.log('🔑 Setting review cache key:', latest.cacheKey)
          setReviewCacheKey(latest.cacheKey)
        }
      }
    } catch (error) {
      console.error('Failed to load cache key:', error)
    }
  }

  const loadAiGraph = async () => {
    try {
      console.log('Loading latest cached graph...')
      const res = await fetch('/api/cdk-scan-files/latest')
      if (res.ok) {
        const latest = await res.json()
        if (latest?.graph) {
          const { services: mappedServices, connections: mappedConnections } = mapAiGraphToUiFormat(latest.graph)
          setServices(mappedServices)
          setConnections(mappedConnections)
          if (latest.cacheKey) {
            console.log('🔑 Setting review cache key:', latest.cacheKey)
            setReviewCacheKey(latest.cacheKey)
          }
          return
        }
      }
      // Fallback to bundled sample if no cache
      console.log('No cached graph found. Falling back to sample file.')
      const aiGraph = await loadGraphFromFile('/graph_v4_final.json')
      const { services: mappedServices, connections: mappedConnections } = mapAiGraphToUiFormat(aiGraph)
      setServices(mappedServices)
      setConnections(mappedConnections)
    } catch (error) {
      console.error('Failed to load AI graph:', error)
      if (error instanceof Error) {
        alert(`❌ Failed to load graph: ${error.message}\n\nMake sure the app is running on the correct port and try refreshing the page.`)
      } else {
        alert('❌ Failed to load graph. Check console for details.')
      }
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

  // Resizer handlers
  const onStartResize = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    resizeRef.current.active = true
    resizeRef.current.startX = e.clientX
    resizeRef.current.startWidth = consoleWidth
  }

  // Global mouse listeners for resize
  // Attach once
  // eslint-disable-next-line react-hooks/rules-of-hooks
  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current.active) return
      const dx = resizeRef.current.startX - e.clientX
      // Limit sliding range tighter per request
      const next = Math.min(700, Math.max(300, resizeRef.current.startWidth + dx))
      setConsoleWidth(next)
    }
    const onUp = () => { resizeRef.current.active = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

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
                Load Graph
              </Button>
          
          {/* CDK Folder Scanner */}
          <div className="pt-2">
            <FolderSelector 
              onGraphGenerated={handleGraphGenerated} 
              onReviewCacheKey={(key) => setReviewCacheKey(key)}
            />
          </div>
          
          <Button onClick={exportGraph} variant="outline" className="w-full">
            Export JSON
          </Button>
          
          <Button onClick={clearGraph} variant="outline" className="w-full">
            <RotateCcw className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </div>


        
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
            <div className="flex items-center gap-2">
              <Button
                onClick={async () => {
                  // Reset states and show AI review sidebar
                  console.log('🚀 Run button clicked - resetting states')
                  setRunFinished(false)
                  setHighlightedNodes([])
                  setRightSidebarContent('ai-review')
                  setRightSidebarOpen(true)
                  let graphReady = services.length > 0
                  if (!graphReady) {
                    console.log('📊 No graph data loaded yet. Loading before animation...')
                    await loadAiGraph()
                    // wait a frame for state updates to render
                    await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
                    graphReady = true
                  } else {
                    console.log('✅ Using in-memory graph for animation (no reload)')
                  }

                  if (graphReady) {
                    requestAnimationFrame(() => {
                      const newRunId = (runId || 0) + 1
                      console.log('🎬 Triggering animation with runId:', newRunId)
                      setGraphVersion((v) => v + 1)
                      setRunId(newRunId)
                    })
                  }
                  
                  // Ensure we have a cacheKey; if not, try latest
                  let key = reviewCacheKey
                  console.log('🔑 Current reviewCacheKey:', key)
                  if (!key) {
                    console.log('⚠️ No cache key found, fetching latest...')
                    try {
                      const r = await fetch('/api/cdk-scan-files/latest')
                      if (r.ok) {
                        const latest = await r.json()
                        if (latest?.cacheKey) {
                          key = latest.cacheKey
                          setReviewCacheKey(key)
                        }
                      }
                    } catch {}
                  }
                  // Check for existing review first, only trigger new review if cache is empty
                  if (key) {
                    console.log(`🔍 Checking for cached AI review with key: ${key}`)
                    try {
                      // First check if review already exists in cache
                      const reviewCheck = await fetch(`/api/ai-review/${key}`)
                      console.log(`📋 Review API response status: ${reviewCheck.status}`)
                      
                      if (reviewCheck.ok) {
                        const reviewData = await reviewCheck.json()
                        console.log(`📋 Review data:`, reviewData)
                        
                        if (reviewData.status === 'ready' && reviewData.review) {
                          // ✅ CACHE HIT: Use cached review immediately - NO OpenAI API call
                          console.log('✅ CACHE HIT! Using cached AI review - NO OpenAI API call needed')
                          console.log('📊 Review summary:', reviewData.review.summary)
                          console.log('🔍 Number of findings:', reviewData.review.findings?.length || 0)
                          setReviewStatus('ready')
                          setReview(reviewData.review)
                          // DON'T set runFinished here - let the animation complete first
                        } else if (reviewData.status === 'pending') {
                          console.log('⏳ Review already in progress, starting polling')
                          setReviewStatus('pending')
                          setRunFinished(false)
                        } else {
                          console.log('❌ No cached review found, triggering new OpenAI review')
                          await fetch(`/api/ai-review/${key}`, { method: 'POST' })
                          setReviewStatus('pending')
                          setRunFinished(false)
                        }
                      } else {
                        console.log('❌ No cached review found (404), triggering new OpenAI review')
                        await fetch(`/api/ai-review/${key}`, { method: 'POST' })
                        setReviewStatus('pending')
                        setRunFinished(false)
                      }
                    } catch (error) {
                      console.error('❌ Error checking/triggering AI review:', error)
                      try { await fetch(`/api/ai-review/${key}`, { method: 'POST' }) } catch {}
                      setReviewStatus('pending')
                      setRunFinished(false)
                    }
                  }
                }}
                variant="default"
              >
                <Play className="h-4 w-4 mr-2" />
                Run
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1">
          {services.length > 0 ? (
            <PrettyGraph 
              key={graphVersion}
              services={services} 
              connections={connections} 
              onNodeSelect={handleNodeSelect}
              focusNodeId={selectedNode?.id || null}
              runId={runId}
              onRunComplete={() => {
                console.log('🎉 Animation completed! Setting runFinished to true')
                setRunFinished(true)
              }}
              highlightedNodeIds={highlightedNodes}
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
      {/* Right Sidebar - Conditional Content */}
      {rightSidebarOpen && (
        <div className="w-96 border-l bg-card p-4 space-y-4">
          {/* Close button */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">
              {rightSidebarContent === 'service' ? 'Service Details' : 'AI Review'}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRightSidebarOpen(false)}
              className="h-8 w-8 p-0"
            >
              ×
            </Button>
          </div>

          {/* Service Details Content */}
          {rightSidebarContent === 'service' && (
            <ServiceDetails selectedNode={selectedNode} connections={connections} />
          )}

          {/* AI Review Content */}
          {rightSidebarContent === 'ai-review' && (
            <div className="space-y-4">
              {reviewCacheKey ? (
                <>
                  {/* Controls */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">Filter:</label>
                      <select 
                        className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
                        value={severityFilter}
                        onChange={(e) => setSeverityFilter(e.target.value as any)}
                      >
                        <option value="all">All</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                        <option value="info">Info</option>
                      </select>
                    </div>
                    {review && (
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setHighlightedNodes([])}
                          className="text-xs"
                        >
                          Clear
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            try {
                              navigator.clipboard.writeText(JSON.stringify(review, null, 2))
                            } catch {}
                          }}
                          className="text-xs"
                        >
                          Copy
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const blob = new Blob([JSON.stringify(review, null, 2)], { type: 'application/json' })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = `ai-review-${reviewCacheKey}.json`
                            document.body.appendChild(a)
                            a.click()
                            document.body.removeChild(a)
                            URL.revokeObjectURL(url)
                          }}
                          className="text-xs"
                        >
                          Export
                        </Button>
                      </div>
                    )}
                  </div>

                  {runFinished ? (
                    reviewStatus === 'ready' && review ? (
                      <div className="space-y-4 max-h-[calc(100vh-12rem)] overflow-auto">
                        {/* Summary Card */}
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">Summary</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground">{review.summary}</p>
                          </CardContent>
                        </Card>

                        {/* Recommendations */}
                        {Array.isArray(review.recommendations) && review.recommendations.length > 0 && (
                          <Card>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base">Recommendations</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <ul className="space-y-2">
                                {review.recommendations.slice(0,5).map((r: string, i: number) => (
                                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                    <span className="text-primary mt-1">•</span>
                                    <span>{r}</span>
                                  </li>
                                ))}
                              </ul>
                            </CardContent>
                          </Card>
                        )}

                        {/* Findings */}
                        {Array.isArray(review.findings) && review.findings.length > 0 && (
                          <Card>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base">
                                Findings ({review.findings.filter((f: any) => severityFilter === 'all' || (f.severity || 'info').toLowerCase() === severityFilter).length})
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-3">
                                {review.findings
                                  .filter((f: any) => severityFilter === 'all' || (f.severity || 'info').toLowerCase() === severityFilter)
                                  .sort((a: any, b: any) => {
                                    const order = { critical: 5, high: 4, medium: 3, low: 2, info: 1 } as any
                                    return (order[(b.severity||'info').toLowerCase()]||0) - (order[(a.severity||'info').toLowerCase()]||0)
                                  })
                                  .slice(0, 15)
                                  .map((f: any) => {
                                    const sev = (f.severity || 'info').toLowerCase()
                                    const sevVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
                                      critical: 'destructive',
                                      high: 'destructive',
                                      medium: 'default',
                                      low: 'secondary',
                                      info: 'outline'
                                    }
                                    return (
                                      <Card
                                        key={f.id}
                                        className="cursor-pointer transition-colors hover:bg-accent/50 border-l-4"
                                        style={{
                                          borderLeftColor: sev === 'critical' ? '#ef4444' : 
                                                         sev === 'high' ? '#f97316' : 
                                                         sev === 'medium' ? '#eab308' : 
                                                         sev === 'low' ? '#3b82f6' : '#64748b'
                                        }}
                                        onClick={() => setHighlightedNodes(Array.isArray(f.nodes) ? f.nodes : [])}
                                      >
                                        <CardContent className="p-4">
                                          <div className="flex items-start justify-between gap-2 mb-2">
                                            <Badge variant={sevVariants[sev]} className="text-xs">
                                              {f.severity || 'info'}
                                            </Badge>
                                            {Array.isArray(f.nodes) && f.nodes.length > 0 && (
                                              <Badge variant="outline" className="text-xs">
                                                {f.nodes.length} node{f.nodes.length !== 1 ? 's' : ''}
                                              </Badge>
                                            )}
                                          </div>
                                          <h4 className="font-medium text-sm mb-1">{f.message}</h4>
                                          {f.details && (
                                            <p className="text-xs text-muted-foreground mb-2">{f.details}</p>
                                          )}
                                          {Array.isArray(f.references) && f.references.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                              {f.references.slice(0,2).map((url: string, i: number) => (
                                                <Button
                                                  key={i}
                                                  variant="link"
                                                  size="sm"
                                                  className="h-auto p-0 text-xs"
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    window.open(url, '_blank')
                                                  }}
                                                >
                                                  Doc {i+1}
                                                </Button>
                                              ))}
                                            </div>
                                          )}
                                        </CardContent>
                                      </Card>
                                    )
                                  })
                                }
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    ) : reviewStatus === 'pending' ? (
                      <Card>
                        <CardContent className="p-6 text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                          <p className="text-sm text-muted-foreground">Analyzing architecture...</p>
                        </CardContent>
                      </Card>
                    ) : reviewStatus === 'error' ? (
                      <Card>
                        <CardContent className="p-6 text-center">
                          <p className="text-sm text-destructive">Failed to load review. Please try again.</p>
                        </CardContent>
                      </Card>
                    ) : null
                  ) : (
                    <Card>
                      <CardContent className="p-6 text-center">
                        <p className="text-sm text-muted-foreground">Click Run to analyze your architecture</p>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <Card>
                  <CardContent className="p-6 text-center">
                    <p className="text-sm text-muted-foreground">Load a graph or scan to enable AI review</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
