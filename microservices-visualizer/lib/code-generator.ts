import type { MicroserviceNode, ServiceConnection } from "./file-analyzer"

export interface GeneratedFile {
  path: string
  content: string
  type: "config" | "api" | "client" | "docker" | "docs"
}

export class CodeGenerator {
  private services: MicroserviceNode[]
  private connections: ServiceConnection[]

  constructor(services: MicroserviceNode[], connections: ServiceConnection[]) {
    this.services = services
    this.connections = connections
  }

  generateAll(): GeneratedFile[] {
    const files: GeneratedFile[] = []

    // Generate docker-compose.yml
    files.push(this.generateDockerCompose())

    // Generate API gateway configuration
    files.push(this.generateApiGatewayConfig())

    // Generate service discovery configuration
    files.push(this.generateServiceDiscoveryConfig())

    // Generate individual service configurations
    this.services.forEach((service) => {
      if (service.type === "api") {
        files.push(this.generateServiceConfig(service))
        files.push(this.generateServiceClient(service))
      }
    })

    // Generate documentation
    files.push(this.generateArchitectureDoc())

    return files
  }

  private generateDockerCompose(): GeneratedFile {
    const services = this.services.filter((s) => s.type !== "external")

    const dockerServices = services
      .map((service) => {
        const serviceConfig = {
          build: `./${service.path}`,
          ports: service.port ? [`"${service.port}:${service.port}"`] : undefined,
          environment: this.generateEnvironmentVars(service),
          depends_on: this.getServiceDependencies(service).filter((dep) => services.some((s) => s.id === dep)),
        }

        return `  ${service.id}:
    build: ${serviceConfig.build}${
      serviceConfig.ports
        ? `
    ports:
      - ${serviceConfig.ports[0]}`
        : ""
    }${
      serviceConfig.environment.length > 0
        ? `
    environment:
${serviceConfig.environment.map((env) => `      - ${env}`).join("\n")}`
        : ""
    }${
      serviceConfig.depends_on.length > 0
        ? `
    depends_on:
${serviceConfig.depends_on.map((dep) => `      - ${dep}`).join("\n")}`
        : ""
    }`
      })
      .join("\n\n")

    const content = `version: '3.8'

services:
${dockerServices}

networks:
  microservices:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
`

    return {
      path: "docker-compose.yml",
      content,
      type: "config",
    }
  }

  private generateApiGatewayConfig(): GeneratedFile {
    const apiServices = this.services.filter((s) => s.type === "api")

    const routes = apiServices.flatMap((service) => {
      const endpoints = service.endpoints || []
      return endpoints.map((endpoint) => {
        const [method, path] = endpoint.split(" ")
        return {
          match: { path: path, method: method.toLowerCase() },
          route: { cluster: service.id },
        }
      })
    })

    const clusters = apiServices.map((service) => ({
      name: service.id,
      connect_timeout: "0.25s",
      type: "LOGICAL_DNS",
      lb_policy: "ROUND_ROBIN",
      load_assignment: {
        cluster_name: service.id,
        endpoints: [
          {
            lb_endpoints: [
              {
                endpoint: {
                  address: {
                    socket_address: {
                      address: service.id,
                      port_value: service.port || 3000,
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    }))

    const config = {
      static_resources: {
        listeners: [
          {
            name: "listener_0",
            address: {
              socket_address: {
                address: "0.0.0.0",
                port_value: 8080,
              },
            },
            filter_chains: [
              {
                filters: [
                  {
                    name: "envoy.filters.network.http_connection_manager",
                    typed_config: {
                      "@type":
                        "type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager",
                      stat_prefix: "ingress_http",
                      route_config: {
                        name: "local_route",
                        virtual_hosts: [
                          {
                            name: "local_service",
                            domains: ["*"],
                            routes: routes.map((route) => ({
                              match: route.match,
                              route: route.route,
                            })),
                          },
                        ],
                      },
                      http_filters: [
                        {
                          name: "envoy.filters.http.router",
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
        clusters,
      },
    }

    return {
      path: "api-gateway/envoy.yaml",
      content: JSON.stringify(config, null, 2),
      type: "config",
    }
  }

  private generateServiceDiscoveryConfig(): GeneratedFile {
    const services = this.services.filter((s) => s.type !== "external")

    const consulConfig = {
      datacenter: "dc1",
      data_dir: "/opt/consul/data",
      log_level: "INFO",
      server: true,
      bootstrap_expect: 1,
      bind_addr: "0.0.0.0",
      client_addr: "0.0.0.0",
      retry_join: ["consul-server"],
      ui_config: {
        enabled: true,
      },
      connect: {
        enabled: true,
      },
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        port: service.port || 3000,
        check: {
          http: `http://${service.id}:${service.port || 3000}/health`,
          interval: "10s",
        },
      })),
    }

    return {
      path: "service-discovery/consul.json",
      content: JSON.stringify(consulConfig, null, 2),
      type: "config",
    }
  }

  private generateServiceConfig(service: MicroserviceNode): GeneratedFile {
    const dependencies = this.getServiceDependencies(service)
    const incomingConnections = this.connections.filter((conn) => conn.to === service.id)

    const config = {
      service: {
        name: service.name,
        port: service.port || 3000,
        version: "1.0.0",
      },
      dependencies: dependencies.map((dep) => {
        const depService = this.services.find((s) => s.id === dep)
        return {
          name: dep,
          url: `http://${dep}:${depService?.port || 3000}`,
          timeout: 5000,
          retries: 3,
        }
      }),
      database: this.getDatabaseConfig(service),
      cache: this.getCacheConfig(service),
      monitoring: {
        metrics: {
          enabled: true,
          port: 9090,
        },
        tracing: {
          enabled: true,
          jaeger_endpoint: "http://jaeger:14268/api/traces",
        },
      },
    }

    return {
      path: `${service.path}/config/service.json`,
      content: JSON.stringify(config, null, 2),
      type: "config",
    }
  }

  private generateServiceClient(service: MicroserviceNode): GeneratedFile {
    const endpoints = service.endpoints || []

    const clientClass = `
import axios, { AxiosInstance } from 'axios';

export interface ${this.toPascalCase(service.id)}ClientConfig {
  baseURL: string;
  timeout?: number;
  retries?: number;
}

export class ${this.toPascalCase(service.id)}Client {
  private client: AxiosInstance;
  private retries: number;

  constructor(config: ${this.toPascalCase(service.id)}ClientConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    this.retries = config.retries || 3;
    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;
        
        if (!config || !config.retry) {
          config.retry = 0;
        }
        
        if (config.retry < this.retries) {
          config.retry += 1;
          return this.client(config);
        }
        
        return Promise.reject(error);
      }
    );
  }

${endpoints
  .map((endpoint) => {
    const [method, path] = endpoint.split(" ")
    const methodName = this.generateMethodName(method, path)
    const params = this.extractPathParams(path)

    return `  async ${methodName}(${params.length > 0 ? params.join(", ") + ", " : ""}data?: any) {
    const response = await this.client.${method.toLowerCase()}('${path}', data);
    return response.data;
  }`
  })
  .join("\n\n")}

  async healthCheck() {
    const response = await this.client.get('/health');
    return response.data;
  }
}
`

    return {
      path: `clients/${service.id}-client.ts`,
      content: clientClass,
      type: "client",
    }
  }

  private generateArchitectureDoc(): GeneratedFile {
    const content = `# Microservices Architecture Documentation

## Overview
This document describes the microservices architecture for the system, including service definitions, connections, and deployment configuration.

## Services

${this.services
  .map(
    (service) => `
### ${service.name}
- **Type**: ${service.type}
- **Path**: ${service.path}
- **Port**: ${service.port || "Not specified"}
- **Technologies**: ${service.technologies.join(", ") || "None specified"}
- **Description**: ${service.description || "No description available"}

${
  service.endpoints && service.endpoints.length > 0
    ? `
**API Endpoints**:
${service.endpoints.map((endpoint) => `- ${endpoint}`).join("\n")}
`
    : ""
}
`,
  )
  .join("\n")}

## Service Connections

${this.connections
  .map(
    (conn) => `
- **${conn.from}** → **${conn.to}** (${conn.type}${conn.method ? ` - ${conn.method}` : ""}${conn.endpoint ? ` ${conn.endpoint}` : ""})
`,
  )
  .join("")}

## Deployment

### Docker Compose
The system can be deployed using Docker Compose. See \`docker-compose.yml\` for the complete configuration.

### Service Discovery
Services are registered with Consul for service discovery. See \`service-discovery/consul.json\` for configuration.

### API Gateway
Envoy is used as an API gateway to route requests to appropriate services. See \`api-gateway/envoy.yaml\` for routing configuration.

## Monitoring

Each service includes:
- Health check endpoints
- Metrics collection (Prometheus)
- Distributed tracing (Jaeger)

## Development

### Running Locally
\`\`\`bash
docker-compose up -d
\`\`\`

### Service Clients
Generated TypeScript clients are available in the \`clients/\` directory for easy service-to-service communication.

---
*Generated on ${new Date().toISOString()}*
`

    return {
      path: "docs/architecture.md",
      content,
      type: "docs",
    }
  }

  private generateEnvironmentVars(service: MicroserviceNode): string[] {
    const vars: string[] = []

    // Database connections
    const dbConnections = this.connections.filter((conn) => conn.from === service.id && conn.type === "database")

    if (dbConnections.length > 0) {
      vars.push("DATABASE_URL=postgresql://user:password@postgres:5432/database")
    }

    // Cache connections
    const cacheConnections = this.connections.filter((conn) => conn.from === service.id && conn.type === "cache")

    if (cacheConnections.length > 0) {
      vars.push("REDIS_URL=redis://redis:6379")
    }

    // Service URLs
    const serviceDeps = this.getServiceDependencies(service)
    serviceDeps.forEach((dep) => {
      const depService = this.services.find((s) => s.id === dep)
      if (depService) {
        vars.push(`${dep.toUpperCase().replace("-", "_")}_URL=http://${dep}:${depService.port || 3000}`)
      }
    })

    return vars
  }

  private getServiceDependencies(service: MicroserviceNode): string[] {
    return this.connections.filter((conn) => conn.from === service.id).map((conn) => conn.to)
  }

  private getDatabaseConfig(service: MicroserviceNode) {
    const dbConnections = this.connections.filter((conn) => conn.from === service.id && conn.type === "database")

    if (dbConnections.length === 0) return null

    return {
      type: "postgresql",
      host: "postgres",
      port: 5432,
      database: "database",
      username: "user",
      password: "password",
      pool: {
        min: 2,
        max: 10,
      },
    }
  }

  private getCacheConfig(service: MicroserviceNode) {
    const cacheConnections = this.connections.filter((conn) => conn.from === service.id && conn.type === "cache")

    if (cacheConnections.length === 0) return null

    return {
      type: "redis",
      host: "redis",
      port: 6379,
      ttl: 3600,
    }
  }

  private toPascalCase(str: string): string {
    return str
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("")
  }

  private generateMethodName(method: string, path: string): string {
    const pathParts = path.split("/").filter((part) => part && !part.startsWith(":"))
    const methodPrefix = method.toLowerCase()
    const pathSuffix = pathParts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("")

    return `${methodPrefix}${pathSuffix}`
  }

  private extractPathParams(path: string): string[] {
    const params = path.match(/:(\w+)/g)
    return params ? params.map((param) => `${param.slice(1)}: string`) : []
  }
}
