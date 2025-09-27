import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'

interface CDKProject {
  repo_path: string
  repo_name: string
  has_cdk_json: boolean
  has_package_json: boolean
  cdk_files: Array<{
    file_path: string
    file_type: string
    relative_path: string
    size: number
    language: string
  }>
  stacks: string[]
  constructs: string[]
  aws_services: string[]
  languages: string[]
  cdk_version?: string
  app_command?: string
}

interface CDKScanResult {
  summary: {
    total_projects: number
    total_files: number
    languages: string[]
    aws_services: string[]
  }
  projects: CDKProject[]
}

// Cache directory for CDK scan results
const CACHE_DIR = path.join(process.cwd(), '.cache', 'cdk-scans')

// Generate cache key from file contents
function getCacheKey(files: { [path: string]: string }): string {
  const fileHashes = Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => `${path}:${crypto.createHash('md5').update(content).digest('hex')}`)
    .join('|')
  return crypto.createHash('md5').update(fileHashes).digest('hex')
}

// Get cache file path
function getCacheFilePath(cacheKey: string): string {
  return path.join(CACHE_DIR, `${cacheKey}.json`)
}

// Check if cache is valid (less than 1 hour old)
async function isCacheValid(cacheFilePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(cacheFilePath)
    const ageMs = Date.now() - stats.mtime.getTime()
    return ageMs < 60 * 60 * 1000 // 1 hour
  } catch {
    return false
  }
}

// Analyze files for CDK patterns
function analyzeCDKFiles(files: { [path: string]: string }): CDKScanResult {
  const projects: { [repoName: string]: CDKProject } = {}
  
  // Group files by repository (top-level folder)
  for (const [filePath, content] of Object.entries(files)) {
    const pathParts = filePath.split('/')
    if (pathParts.length < 2) continue
    
    const repoName = pathParts[0]
    const relativePath = pathParts.slice(1).join('/')
    const fileName = pathParts[pathParts.length - 1]
    const fileExt = path.extname(fileName).toLowerCase()
    
    // Initialize project if not exists
    if (!projects[repoName]) {
      projects[repoName] = {
        repo_path: repoName,
        repo_name: repoName,
        has_cdk_json: false,
        has_package_json: false,
        cdk_files: [],
        stacks: [],
        constructs: [],
        aws_services: [],
        languages: []
      }
    }
    
    const project = projects[repoName]
    
    // Check for CDK-specific files
    if (fileName === 'cdk.json') {
      project.has_cdk_json = true
      try {
        const cdkConfig = JSON.parse(content)
        project.app_command = cdkConfig.app
      } catch (error) {
        console.warn(`Failed to parse cdk.json in ${filePath}:`, error)
      }
      
      project.cdk_files.push({
        file_path: filePath,
        file_type: 'config',
        relative_path: relativePath,
        size: content.length,
        language: 'json'
      })
    } else if (fileName === 'package.json') {
      project.has_package_json = true
      try {
        const packageConfig = JSON.parse(content)
        const deps = { ...packageConfig.dependencies, ...packageConfig.devDependencies }
        
        // Check for CDK dependencies
        const hasCDK = Object.keys(deps).some(dep => 
          dep.startsWith('@aws-cdk/') || dep.startsWith('aws-cdk') || dep === 'aws-cdk-lib'
        )
        
        if (hasCDK) {
          project.cdk_version = deps['aws-cdk-lib'] || deps['@aws-cdk/core'] || 'unknown'
          project.cdk_files.push({
            file_path: filePath,
            file_type: 'package',
            relative_path: relativePath,
            size: content.length,
            language: 'json'
          })
        }
      } catch (error) {
        console.warn(`Failed to parse package.json in ${filePath}:`, error)
      }
    } else if (fileExt === '.ts' && containsCDKCode(content)) {
      // Analyze TypeScript CDK files
      project.languages.push('typescript')
      
      const { stacks, constructs, services } = analyzeCDKTypeScript(content)
      project.stacks.push(...stacks)
      project.constructs.push(...constructs)
      project.aws_services.push(...services)
      
      project.cdk_files.push({
        file_path: filePath,
        file_type: 'code',
        relative_path: relativePath,
        size: content.length,
        language: 'typescript'
      })
    }
  }
  
  // Filter out projects without CDK evidence and deduplicate arrays
  const validProjects = Object.values(projects).filter(project => 
    project.has_cdk_json || project.cdk_files.length > 0
  ).map(project => ({
    ...project,
    stacks: [...new Set(project.stacks)],
    constructs: [...new Set(project.constructs)],
    aws_services: [...new Set(project.aws_services)],
    languages: [...new Set(project.languages)]
  }))
  
  // Generate summary
  const allLanguages = new Set<string>()
  const allServices = new Set<string>()
  let totalFiles = 0
  
  validProjects.forEach(project => {
    project.languages.forEach(lang => allLanguages.add(lang))
    project.aws_services.forEach(service => allServices.add(service))
    totalFiles += project.cdk_files.length
  })
  
  return {
    summary: {
      total_projects: validProjects.length,
      total_files: totalFiles,
      languages: Array.from(allLanguages),
      aws_services: Array.from(allServices)
    },
    projects: validProjects
  }
}

// Check if content contains CDK code
function containsCDKCode(content: string): boolean {
  const cdkPatterns = [
    /import.*aws-cdk-lib/i,
    /import.*@aws-cdk\//i,
    /from.*aws-cdk-lib/i,
    /cdk\.Stack/i,
    /constructs\.Construct/i,
    /extends.*Stack/i,
    /new.*Stack/i
  ]
  
  return cdkPatterns.some(pattern => pattern.test(content))
}

// Analyze TypeScript CDK content
function analyzeCDKTypeScript(content: string): { stacks: string[], constructs: string[], services: string[] } {
  const stacks: string[] = []
  const constructs: string[] = []
  const services: string[] = []
  
  // Extract stack names
  const stackPatterns = [
    /class\s+(\w*Stack)\s*extends/gi,
    /new\s+(\w*Stack)\s*\(/gi,
    /(\w+Stack)\s*=.*Stack/gi
  ]
  
  stackPatterns.forEach(pattern => {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      if (match[1]) stacks.push(match[1])
    }
  })
  
  // Extract construct names
  const constructPatterns = [
    /class\s+(\w+)\s*extends.*Construct/gi,
    /new\s+(\w+)\s*\(.*Construct/gi
  ]
  
  constructPatterns.forEach(pattern => {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      if (match[1]) constructs.push(match[1])
    }
  })
  
  // Detect AWS services
  const servicePatterns = {
    lambda: /aws-lambda|aws_lambda|Lambda/i,
    s3: /aws-s3|aws_s3|Bucket/i,
    dynamodb: /aws-dynamodb|aws_dynamodb|Table/i,
    sqs: /aws-sqs|aws_sqs|Queue/i,
    sns: /aws-sns|aws_sns|Topic/i,
    apigateway: /aws-apigateway|aws_apigateway|RestApi|HttpApi/i,
    ecs: /aws-ecs|aws_ecs|Cluster|Service/i,
    ec2: /aws-ec2|aws_ec2|Instance|Vpc/i,
    rds: /aws-rds|aws_rds|Database/i,
    iam: /aws-iam|aws_iam|Role|Policy/i,
    stepfunctions: /aws-stepfunctions|aws_stepfunctions|StateMachine/i,
    eventbridge: /aws-events|aws_events|Rule/i,
    kinesis: /aws-kinesis|aws_kinesis|Stream/i,
    cognito: /aws-cognito|aws_cognito|UserPool/i,
    cloudfront: /aws-cloudfront|aws_cloudfront|Distribution/i
  }
  
  Object.entries(servicePatterns).forEach(([service, pattern]) => {
    if (pattern.test(content)) {
      services.push(service)
    }
  })
  
  return { stacks, constructs, services }
}

// Run causality.py on CDK TypeScript files
async function runCausalityAnalysis(cdkResult: CDKScanResult, files: { [path: string]: string }): Promise<any> {
  console.log('🚀 Starting causality analysis...')
  const tempDir = path.join(process.cwd(), '.cache', 'temp')
  console.log('📂 Temp directory:', tempDir)
  
  // Ensure temp directory exists
  await fs.mkdir(tempDir, { recursive: true })
  console.log('✅ Temp directory created/verified')
  
  // Process each CDK TypeScript file
  const allGraphs: any[] = []
  let tsFileCount = 0
  
  for (const project of cdkResult.projects) {
    console.log(`🏗️ Processing project: ${project.repo_name}`)
    console.log(`📋 Project has ${project.cdk_files.length} CDK files`)
    
    for (const file of project.cdk_files) {
      console.log(`📄 Checking file: ${file.file_path} (${file.language}, ${file.file_type})`)
      
      if (file.language === 'typescript' && file.file_type === 'code') {
        tsFileCount++
        console.log(`✅ Found TypeScript CDK file #${tsFileCount}: ${file.file_path}`)
        // Write the file content to a temporary file
        const tempFilePath = path.join(tempDir, `${path.basename(file.file_path, '.ts')}_${Date.now()}.ts`)
        const fileContent = files[file.file_path]
        
        if (!fileContent) {
          console.warn(`❌ No content found for ${file.file_path}`)
          continue
        }
        
        console.log(`📝 File content length: ${fileContent.length} characters`)
        console.log(`📝 File content preview: ${fileContent.substring(0, 200)}...`)
        
        // Log complete file content that will be sent to AI
        console.log(`🤖 AI INPUT - COMPLETE FILE CONTENT FOR ${file.file_path}:`)
        console.log('=' * 80)
        console.log(fileContent)
        console.log('=' * 80)
        
        try {
          await fs.writeFile(tempFilePath, fileContent)
          console.log(`💾 Wrote temp file: ${tempFilePath}`)
          
          const outputPath = path.join(tempDir, `${path.basename(file.file_path, '.ts')}_graph_${Date.now()}.json`)
          console.log(`📊 Output path: ${outputPath}`)
          
          // Run causality.py
          const { spawn } = await import('child_process')
          const causalityPath = path.join(process.cwd(), 'backend', 'causality.py')
          console.log(`🐍 Causality script path: ${causalityPath}`)
          
          const openaiKey = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY || ''
          console.log(`🔑 Using OpenAI key: ${openaiKey ? `${openaiKey.substring(0, 10)}...` : 'NONE'}`)
          
          console.log(`🚀 Spawning Python process for ${file.file_path}...`)
          console.log(`🚀 Command: python3 ${causalityPath} --in ${tempFilePath} --out ${outputPath} --openai-key [REDACTED]`)
          
          await new Promise<void>((resolve, reject) => {
            const pythonProcess = spawn('python3', [
              causalityPath,
              '--in', tempFilePath,
              '--out', outputPath,
              '--openai-key', openaiKey
            ], {
              stdio: ['pipe', 'pipe', 'pipe'],
              env: {
                ...process.env,
                OPENAI_KEY: openaiKey
              }
            })

            let stdout = ''
            let stderr = ''
            
            pythonProcess.stdout.on('data', (data) => {
              const output = data.toString()
              stdout += output
              console.log(`🐍 Python stdout: ${output.trim()}`)
            })

            pythonProcess.stderr.on('data', (data) => {
              const error = data.toString()
              stderr += error
              console.log(`🐍 Python stderr: ${error.trim()}`)
            })

            pythonProcess.on('close', (code) => {
              console.log(`🐍 Python process exited with code: ${code}`)
              if (code !== 0) {
                console.warn(`❌ Causality analysis failed for ${file.file_path}:`, stderr)
                resolve() // Continue with other files
                return
              }
              console.log(`✅ Causality analysis completed for ${file.file_path}`)
              resolve()
            })

            pythonProcess.on('error', (error) => {
              console.error(`❌ Failed to start Python process for ${file.file_path}:`, error.message)
              resolve() // Continue with other files
            })

          })

          // Read the generated graph
          console.log(`📖 Reading generated graph from: ${outputPath}`)
          try {
            const graphContent = await fs.readFile(outputPath, 'utf-8')
            console.log(`📄 Graph content length: ${graphContent.length} characters`)
            
            // Log complete AI output
            console.log(`🤖 AI OUTPUT - COMPLETE GRAPH JSON FOR ${file.file_path}:`)
            console.log('=' * 80)
            console.log(graphContent)
            console.log('=' * 80)
            
            const graph = JSON.parse(graphContent)
            console.log(`📊 Parsed AI graph structure:`, {
              nodes: graph.nodes?.length || 0,
              edges: graph.edges?.length || 0,
              meta: graph.meta,
              nodeDetails: graph.nodes?.map(n => ({ id: n.id, type: n.type, label: n.label })) || [],
              edgeDetails: graph.edges?.map(e => ({ from: e.from, to: e.to, kind: e.kind })) || []
            })
            
            // Add metadata about the source
            graph.meta = {
              ...graph.meta,
              source_project: project.repo_name,
              source_file: file.relative_path
            }
            
            allGraphs.push(graph)
            console.log(`✅ Added graph to collection. Total graphs: ${allGraphs.length}`)
            
            // Clean up temp files
            await fs.unlink(tempFilePath).catch(() => {})
            await fs.unlink(outputPath).catch(() => {})
            console.log(`🧹 Cleaned up temp files`)
          } catch (error) {
            console.error(`❌ Failed to read graph for ${file.file_path}:`, error)
          }
        } catch (error) {
          console.warn(`Error processing ${file.file_path}:`, error)
        }
      }
    }
  }

  console.log(`📈 Causality analysis summary:`)
  console.log(`   - Total TypeScript files processed: ${tsFileCount}`)
  console.log(`   - Successful AI analyses: ${allGraphs.length}`)
  console.log(`   - Failed analyses: ${tsFileCount - allGraphs.length}`)

  // If no AI analysis was successful, create a simple graph
  if (allGraphs.length === 0) {
    console.log(`⚠️ No AI analysis succeeded, falling back to simple graph generation`)
    return generateSimpleGraph(cdkResult)
  }

  console.log(`🔗 Merging ${allGraphs.length} graphs...`)
  
  // Log individual graph details before merging
  allGraphs.forEach((graph, index) => {
    console.log(`📊 Graph ${index + 1} (${graph.meta?.source_file || 'unknown'}):`)
    console.log(`   - Nodes: ${graph.nodes?.length || 0}`)
    console.log(`   - Edges: ${graph.edges?.length || 0}`)
    console.log(`   - Edge details:`, graph.edges?.map(e => `${e.from}->${e.to}(${e.kind})`) || [])
  })

  // Merge all graphs into one
  const mergedGraph = {
    nodes: [],
    edges: [],
    meta: {
      source: 'cdk_causality_analysis',
      projects: cdkResult.projects.map(p => p.repo_name),
      total_projects: cdkResult.summary.total_projects,
      generated_at: new Date().toISOString(),
      ai_analyzed_files: allGraphs.length
    }
  }

  // Combine all nodes and edges
  const nodeIds = new Set()
  const edgeIds = new Set()

  for (const graph of allGraphs) {
    const sourceProject = graph.meta?.source_project || 'unknown'
    const sourceFile = graph.meta?.source_file || 'unknown'
    console.log(`🔄 Processing graph from ${sourceFile} (project: ${sourceProject})...`)
    
    // Add nodes with project-scoped IDs to prevent cross-repo collisions
    for (const node of graph.nodes || []) {
      // Create unique node ID by prefixing with project name
      const originalId = node.id
      const uniqueNodeId = `${sourceProject}__${originalId}`
      
      if (!nodeIds.has(uniqueNodeId)) {
        nodeIds.add(uniqueNodeId)
        // Update node with unique ID but preserve original for labeling
        const uniqueNode = {
          ...node,
          id: uniqueNodeId,
          originalId: originalId,
          project: sourceProject,
          // Update label to show project context if not already included
          label: node.label?.includes(sourceProject) ? node.label : `${node.label || originalId} (${sourceProject})`
        }
        mergedGraph.nodes.push(uniqueNode)
        console.log(`✅ Added node: ${uniqueNodeId} (original: ${originalId})`)
      } else {
        console.log(`⚠️  Skipped duplicate node: ${uniqueNodeId}`)
      }
    }

    // Add edges with project-scoped node references
    for (const edge of graph.edges || []) {
      // Update edge to use project-scoped node IDs
      const fromNodeId = `${sourceProject}__${edge.from}`
      const toNodeId = `${sourceProject}__${edge.to}`
      
      // Generate semantic edge ID with project-scoped nodes
      const semanticEdgeId = `${fromNodeId}-${toNodeId}-${edge.kind}`
      
      if (!edgeIds.has(semanticEdgeId)) {
        edgeIds.add(semanticEdgeId)
        // Use project-scoped node IDs and semantic edge ID
        const uniqueEdge = { 
          ...edge, 
          id: semanticEdgeId,
          from: fromNodeId,
          to: toNodeId,
          originalFrom: edge.from,
          originalTo: edge.to,
          project: sourceProject
        }
        mergedGraph.edges.push(uniqueEdge)
        console.log(`✅ Added edge: ${fromNodeId} → ${toNodeId} (${edge.kind})`)
      } else {
        console.log(`⚠️  Skipped duplicate edge: ${semanticEdgeId} (from ${sourceFile})`)
      }
    }
  }

  console.log(`🎯 MERGE COMPLETE:`)
  console.log(`   - Total nodes in merged graph: ${mergedGraph.nodes.length}`)
  console.log(`   - Total edges in merged graph: ${mergedGraph.edges.length}`)
  console.log(`   - Node IDs:`, mergedGraph.nodes.map(n => n.id))
  console.log(`   - Edge connections:`, mergedGraph.edges.map(e => `${e.from}→${e.to}(${e.kind})`))

  return mergedGraph
}

// Generate simple graph from CDK analysis (fallback when AI analysis fails)
function generateSimpleGraph(cdkResult: CDKScanResult): any {
  const nodes: any[] = []
  const edges: any[] = []
  
  // Create simple nodes for each detected service
  cdkResult.projects.forEach(project => {
    project.aws_services.forEach(service => {
      const nodeId = `${project.repo_name}-${service}`
      nodes.push({
        id: nodeId,
        type: service === 'lambda' ? 'Lambda' : 
              service === 'dynamodb' ? 'Table' :
              service === 'sqs' ? 'Queue' :
              service === 'sns' ? 'Topic' :
              service === 'apigateway' ? 'ApiGateway' :
              'Service',
        label: `${project.repo_name} ${service}`,
        props: {}
      })
    })
  })
  
  return {
    nodes,
    edges,
    meta: {
      source: 'cdk_simple_analysis',
      projects: cdkResult.projects.map(p => p.repo_name),
      total_projects: cdkResult.summary.total_projects,
      generated_at: new Date().toISOString()
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { files } = body

    if (!files || typeof files !== 'object' || Object.keys(files).length === 0) {
      return NextResponse.json(
        { error: 'Files object is required' },
        { status: 400 }
      )
    }

    // Check cache first
    const cacheKey = getCacheKey(files)
    const cacheFilePath = getCacheFilePath(cacheKey)
    
    // Ensure cache directory exists
    await fs.mkdir(CACHE_DIR, { recursive: true })

    // Try to use cached result
    if (await isCacheValid(cacheFilePath)) {
      try {
        const cachedContent = await fs.readFile(cacheFilePath, 'utf-8')
        const cachedResult = JSON.parse(cachedContent)
        console.log('Using cached CDK scan result')
        return NextResponse.json({
          ...cachedResult,
          cached: true,
          cacheKey
        })
      } catch (error) {
        console.warn('Failed to read cache:', error)
      }
    }

    // Analyze files for CDK patterns
    console.log('🔍 Analyzing CDK files from browser...')
    console.log('📁 Total files received:', Object.keys(files).length)
    console.log('📄 File paths:', Object.keys(files))
    
    // Log detailed file contents for debugging
    console.log('📋 DETAILED FILE ANALYSIS:')
    Object.entries(files).forEach(([path, content]) => {
      console.log(`   📄 ${path}:`)
      console.log(`      - Size: ${content.length} characters`)
      console.log(`      - Preview: ${content.substring(0, 150)}...`)
      console.log(`      - Contains CDK patterns: ${containsCDKCode(content)}`)
    })
    
    const cdkResult = analyzeCDKFiles(files)
    console.log('📊 CDK SCAN RESULT (COMPLETE):')
    console.log(JSON.stringify(cdkResult, null, 2))
    
    console.log('📊 CDK Analysis Summary:', {
      totalProjects: cdkResult.summary.total_projects,
      totalFiles: cdkResult.summary.total_files,
      languages: cdkResult.summary.languages,
      awsServices: cdkResult.summary.aws_services
    })

    // Run causality analysis on TypeScript files
    let graph = null
    if (cdkResult.projects.length > 0) {
      console.log('🤖 Running causality analysis on CDK TypeScript files...')
      console.log('🔑 OpenAI Key available:', !!process.env.OPENAI_KEY)
      console.log('🔑 OpenAI Key length:', process.env.OPENAI_KEY?.length || 0)
      
      graph = await runCausalityAnalysis(cdkResult, files)
      console.log('📈 Graph generation result:', {
        hasGraph: !!graph,
        nodeCount: graph?.nodes?.length || 0,
        edgeCount: graph?.edges?.length || 0,
        source: graph?.meta?.source
      })
    } else {
      console.log('❌ No CDK projects found, skipping causality analysis')
    }

    const result = {
      cdkResult,
      graph,
      cached: false,
      timestamp: new Date().toISOString()
    }

    // Cache the result
    try {
      await fs.writeFile(cacheFilePath, JSON.stringify(result, null, 2))
      console.log('Cached CDK scan result')
    } catch (error) {
      console.warn('Failed to cache result:', error)
    }

    // Fire-and-forget: spawn architecture reviewer in parallel, reading from cache and writing to its own cache
    try {
      const reviewOutDir = path.join(process.cwd(), '.cache', 'ai-reviews')
      await fs.mkdir(reviewOutDir, { recursive: true })
      const reviewOutPath = path.join(reviewOutDir, `${cacheKey}.json`)

      // If a review already exists for this cache key, reuse it instead of re-running AI
      try {
        await fs.access(reviewOutPath)
        console.log('🧠 Using cached AI review:', reviewOutPath)
      } catch {
        const reviewerPath = path.join(process.cwd(), 'backend', 'architecture_reviewer.py')
        const openaiKey = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY || ''

        console.log('🤖 Spawning architecture reviewer (background) ...')
        console.log('   • Reviewer script:', reviewerPath)
        console.log('   • Input cache:', cacheFilePath)
        console.log('   • Output path:', reviewOutPath)
        console.log('   • OpenAI key present:', !!openaiKey)

        const { spawn } = await import('child_process')
        const args = ['--in', cacheFilePath, '--out', reviewOutPath]
        if (openaiKey) args.push('--openai-key', openaiKey)

        const child = spawn('python3', [reviewerPath, ...args], {
          stdio: 'ignore',
          env: { ...process.env, OPENAI_KEY: openaiKey },
          detached: true,
        })
        // Let it continue after request returns
        child.unref()
        console.log('✅ Architecture reviewer started in background')
      }
    } catch (err) {
      console.warn('⚠️ Failed to start architecture reviewer in background:', err)
    }

    return NextResponse.json({ ...result, cacheKey })

  } catch (error) {
    console.error('CDK file scan error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to scan CDK files',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
