"use client"

import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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


  const handleNodeSelect = (node: MicroserviceNode | null) => {
    setSelectedNode(node)
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
          if (latest.cacheKey) setReviewCacheKey(latest.cacheKey)
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
    resizeRef.active = true
    resizeRef.startX = e.clientX
    resizeRef.startWidth = consoleWidth
  }

  // Global mouse listeners for resize
  // Attach once
  // eslint-disable-next-line react-hooks/rules-of-hooks
  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.active) return
      const dx = resizeRef.startX - e.clientX
      // Limit sliding range tighter per request
      const next = Math.min(700, Math.max(300, resizeRef.startWidth + dx))
      setConsoleWidth(next)
    }
    const onUp = () => { resizeRef.active = false }
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
            <div className="flex items-center gap-2">
              <Button
                onClick={async () => {
                  setRunFinished(false)
                  setHighlightedNodes([])
                  // Ensure we have a cacheKey; if not, try latest
                  let key = reviewCacheKey
                  if (!key) {
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
                  // Trigger reviewer if we have a key
                  if (key) {
                    try { await fetch(`/api/ai-review/${key}`, { method: 'POST' }) } catch {}
                    // start poll now (use effect will handle once key is set)
                  }
                  setRunId((r) => r + 1)
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
              services={services} 
              connections={connections} 
              onNodeSelect={handleNodeSelect}
              focusNodeId={selectedNode?.id || null}
              runId={runId}
              onRunComplete={() => setRunFinished(true)}
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
      {/* Right Sidebar - AI Review */}
      <div className="w-96 border-l bg-card p-4 space-y-4">
        {reviewCacheKey ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">AI Review</div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Severity</label>
              <select 
                className="text-xs border rounded px-2 py-1 bg-background"
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
              <button 
                className="text-xs underline text-muted-foreground"
                onClick={() => setHighlightedNodes([])}
              >Clear highlight</button>
              {review && (
                <div className="ml-auto flex gap-2">
                  <button 
                    className="text-xs underline text-muted-foreground" 
                    onClick={() => {
                      try {
                        navigator.clipboard.writeText(JSON.stringify(review, null, 2))
                      } catch {}
                    }}
                  >Copy JSON</button>
                  <button 
                    className="text-xs underline text-muted-foreground" 
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
                  >Export</button>
                </div>
              )}
            </div>
            {runFinished ? (
              reviewStatus === 'ready' && review ? (
                <div className="p-3 bg-muted rounded-lg space-y-2 max-h-[75vh] overflow-auto">
                  <div className="text-sm font-medium">Summary</div>
                  <div className="text-sm text-muted-foreground">{review.summary}</div>
                  {Array.isArray(review.recommendations) && review.recommendations.length > 0 && (
                    <div className="text-sm">
                      <div className="font-medium mt-2">Recommendations</div>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        {review.recommendations.slice(0,5).map((r: string, i: number) => (
                          <li key={i} className="text-muted-foreground">{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(review.findings) && review.findings.length > 0 && (
                    <div className="text-sm">
                      <div className="font-medium mt-2">Findings ({review.findings.length})</div>
                      <div className="mt-1 space-y-2">
                        {review.findings
                          .filter((f: any) => severityFilter === 'all' || (f.severity || 'info').toLowerCase() === severityFilter)
                          .sort((a: any, b: any) => {
                            const order = { critical: 5, high: 4, medium: 3, low: 2, info: 1 } as any
                            return (order[(b.severity||'info').toLowerCase()]||0) - (order[(a.severity||'info').toLowerCase()]||0)
                          })
                          .slice(0, 15)
                          .map((f: any) => {
                            const sev = (f.severity || 'info').toLowerCase()
                            const sevStyles: Record<string, string> = {
                              critical: 'bg-red-100 text-red-800 border-red-200',
                              high: 'bg-orange-100 text-orange-800 border-orange-200',
                              medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
                              low: 'bg-blue-100 text-blue-800 border-blue-200',
                              info: 'bg-slate-100 text-slate-800 border-slate-200'
                            }
                            return (
                              <button
                                key={f.id}
                                className={`w-full text-left p-2 rounded border bg-background hover:bg-accent/50`}
                                onClick={() => setHighlightedNodes(Array.isArray(f.nodes) ? f.nodes : [])}
                              >
                                <div className="flex items-center justify-between">
                                  <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${sevStyles[sev] || sevStyles.info}`}>
                                    {f.severity || 'info'}
                                  </span>
                                  {Array.isArray(f.nodes) && f.nodes.length > 0 && (
                                    <span className="text-[10px] text-muted-foreground">{f.nodes.length} node(s)</span>
                                  )}
                                </div>
                                <div className="text-sm font-medium mt-1">{f.message}</div>
                                {f.details && (
                                  <div className="text-xs text-muted-foreground mt-1">{f.details}</div>
                                )}
                                {Array.isArray(f.references) && f.references.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    {f.references.slice(0,2).map((url: string, i: number) => (
                                      <a key={i} href={url} target="_blank" rel="noreferrer" className="text-xs underline text-blue-600">
                                        Doc {i+1}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </button>
                            )
                          })
                        }
                      </div>
                    </div>
                  )}
                </div>
              ) : reviewStatus === 'pending' ? (
                <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">Review in progress…</div>
              ) : reviewStatus === 'error' ? (
                <div className="p-3 bg-muted rounded-lg text-sm text-destructive">Failed to load review.</div>
              ) : null
            ) : (
              <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">Run simulation to view results</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Load a graph or scan to enable AI review.</div>

        )}
      </div>
    </div>
  )
}
