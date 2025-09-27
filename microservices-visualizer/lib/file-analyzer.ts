export interface MicroserviceNode {
  id: string
  name: string
  type: "api" | "frontend" | "database" | "queue" | "cache" | "external" | "compute" | "storage" | "message" | "stepfn" | "monitoring" | "security"
  path: string
  dependencies: string[]
  endpoints?: string[]
  port?: number
  description?: string
  technologies: string[]
}

export interface ServiceConnection {
  from: string
  to: string
  type: "http" | "grpc" | "message" | "database" | "cache" | "event" | "invoke" | "stream" | "sync" | "async"
  method?: string
  endpoint?: string
}

export class FileAnalyzer {
  private services: Map<string, MicroserviceNode> = new Map()
  private connections: ServiceConnection[] = []

  async analyzeRepository(files: { path: string; content: string }[]): Promise<{
    services: MicroserviceNode[]
    connections: ServiceConnection[]
  }> {
    // Reset state
    this.services.clear()
    this.connections = []

    // Analyze each file
    for (const file of files) {
      await this.analyzeFile(file)
    }

    return {
      services: Array.from(this.services.values()),
      connections: this.connections,
    }
  }

  private async analyzeFile(file: { path: string; content: string }) {
    const { path, content } = file

    // Detect service type based on file patterns
    if (this.isPackageJson(path)) {
      await this.analyzePackageJson(path, content)
    } else if (this.isDockerfile(path)) {
      await this.analyzeDockerfile(path, content)
    } else if (this.isApiFile(path)) {
      await this.analyzeApiFile(path, content)
    } else if (this.isConfigFile(path)) {
      await this.analyzeConfigFile(path, content)
    }
  }

  private isPackageJson(path: string): boolean {
    return path.endsWith("package.json")
  }

  private isDockerfile(path: string): boolean {
    return path.includes("Dockerfile") || path.includes("docker-compose")
  }

  private isApiFile(path: string): boolean {
    return (
      /\.(ts|js|py|go|java|cs)$/.test(path) &&
      (path.includes("api") || path.includes("server") || path.includes("service"))
    )
  }

  private isConfigFile(path: string): boolean {
    return /\.(yaml|yml|json|toml|env)$/.test(path) && (path.includes("config") || path.includes(".env"))
  }

  private async analyzePackageJson(path: string, content: string) {
    try {
      const pkg = JSON.parse(content)
      const serviceName = pkg.name || this.extractServiceName(path)

      const service: MicroserviceNode = {
        id: serviceName,
        name: serviceName,
        type: this.detectServiceType(pkg),
        path: path.replace("/package.json", ""),
        dependencies: Object.keys(pkg.dependencies || {}),
        technologies: this.extractTechnologies(pkg),
        description: pkg.description,
      }

      // Extract port from scripts
      const port = this.extractPort(pkg.scripts)
      if (port) service.port = port

      this.services.set(serviceName, service)
    } catch (error) {
      console.error("Error parsing package.json:", error)
    }
  }

  private async analyzeDockerfile(path: string, content: string) {
    const serviceName = this.extractServiceName(path)
    const port = this.extractPortFromDockerfile(content)

    if (this.services.has(serviceName)) {
      const service = this.services.get(serviceName)!
      if (port) service.port = port
    }
  }

  private async analyzeApiFile(path: string, content: string) {
    const serviceName = this.extractServiceName(path)
    const endpoints = this.extractEndpoints(content)
    const dependencies = this.extractServiceDependencies(content)

    if (this.services.has(serviceName)) {
      const service = this.services.get(serviceName)!
      service.endpoints = [...(service.endpoints || []), ...endpoints]
    }

    // Create connections based on service calls
    dependencies.forEach((dep) => {
      this.connections.push({
        from: serviceName,
        to: dep,
        type: "http",
      })
    })
  }

  private async analyzeConfigFile(path: string, content: string) {
    // Extract database connections, message queues, etc.
    const serviceName = this.extractServiceName(path)
    const externalServices = this.extractExternalServices(content)

    externalServices.forEach((external) => {
      this.connections.push({
        from: serviceName,
        to: external.name,
        type: external.type as any,
      })
    })
  }

  private detectServiceType(pkg: any): MicroserviceNode["type"] {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }

    if (deps.express || deps.fastify || deps.koa || deps["@nestjs/core"]) return "api"
    if (deps.react || deps.vue || deps.angular || deps.next) return "frontend"
    if (deps.mongoose || deps.prisma || deps.sequelize) return "database"
    if (deps.redis || deps.memcached) return "cache"
    if (deps.bull || deps.agenda || deps.amqplib) return "queue"

    return "api" // default
  }

  private extractTechnologies(pkg: any): string[] {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    const technologies: string[] = []

    if (deps.typescript) technologies.push("TypeScript")
    if (deps.react) technologies.push("React")
    if (deps.express) technologies.push("Express")
    if (deps.next) technologies.push("Next.js")
    if (deps.prisma) technologies.push("Prisma")
    if (deps.redis) technologies.push("Redis")
    if (deps.postgresql || deps.pg) technologies.push("PostgreSQL")
    if (deps.mongodb || deps.mongoose) technologies.push("MongoDB")

    return technologies
  }

  private extractServiceName(path: string): string {
    const parts = path.split("/")
    return (
      parts.find((part) => part !== "src" && part !== "lib" && part !== "api" && part !== "" && !part.includes(".")) ||
      "unknown-service"
    )
  }

  private extractPort(scripts: any): number | undefined {
    if (!scripts) return undefined

    const startScript = scripts.start || scripts.dev || ""
    const portMatch = startScript.match(/(?:--port|PORT=|:)(\d+)/)
    return portMatch ? Number.parseInt(portMatch[1]) : undefined
  }

  private extractPortFromDockerfile(content: string): number | undefined {
    const exposeMatch = content.match(/EXPOSE\s+(\d+)/)
    return exposeMatch ? Number.parseInt(exposeMatch[1]) : undefined
  }

  private extractEndpoints(content: string): string[] {
    const endpoints: string[] = []

    // Express/Fastify patterns
    const routePatterns = [
      /app\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/g,
      /router\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/g,
      /@(Get|Post|Put|Delete|Patch)\(['"`]([^'"`]+)['"`]/g, // NestJS
    ]

    routePatterns.forEach((pattern) => {
      let match
      while ((match = pattern.exec(content)) !== null) {
        endpoints.push(`${match[1].toUpperCase()} ${match[2]}`)
      }
    })

    return endpoints
  }

  private extractServiceDependencies(content: string): string[] {
    const dependencies: string[] = []

    // HTTP client patterns
    const httpPatterns = [
      /fetch\(['"`]https?:\/\/([^/]+)/g,
      /axios\.(get|post|put|delete)\(['"`]https?:\/\/([^/]+)/g,
      /http\.(get|post|put|delete)\(['"`]https?:\/\/([^/]+)/g,
    ]

    httpPatterns.forEach((pattern) => {
      let match
      while ((match = pattern.exec(content)) !== null) {
        const host = match[1] || match[2]
        if (host && !host.includes("localhost")) {
          dependencies.push(host)
        }
      }
    })

    return dependencies
  }

  private extractExternalServices(content: string): Array<{ name: string; type: string }> {
    const services: Array<{ name: string; type: string }> = []

    // Database connection strings
    if (content.includes("postgresql://") || content.includes("postgres://")) {
      services.push({ name: "PostgreSQL", type: "database" })
    }
    if (content.includes("mongodb://") || content.includes("mongo://")) {
      services.push({ name: "MongoDB", type: "database" })
    }
    if (content.includes("redis://")) {
      services.push({ name: "Redis", type: "cache" })
    }

    return services
  }
}
