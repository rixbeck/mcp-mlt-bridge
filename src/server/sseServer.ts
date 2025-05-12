import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { MCPStatusManager } from "../status/mcpStatusManager";
import { ExtensionRegistry } from "../registry/extensionRegistry";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  ServerRequest
} from "@modelcontextprotocol/sdk/types.js";
import { EventEmitter } from "events";

interface ToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

export class MCPServer extends EventEmitter {
  private server: Server;
  private registry: ExtensionRegistry;
  private httpServer: ReturnType<typeof createServer> | null = null;
  private currentPort: number | undefined;
  private activeConnections: number = 0;
  
  // Tool definitions
  private static LIST_EXTENSIONS_TOOL: Tool = {
    name: "list_extensions",
    description: "List all available extensions",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  };

  constructor(registry: ExtensionRegistry) {
    super();
    this.registry = registry;

    // Create server instance with tools enabled
    const config = {
      name: "mcp-lmt-bridge",
      version: "0.1.0",
      capabilities: {
        tools: true,
        resources: {}
      },
      supportedTools: [MCPServer.LIST_EXTENSIONS_TOOL],
      requestHandlers: {
        'tools/list': async () => ({
          tools: [MCPServer.LIST_EXTENSIONS_TOOL]
        }),
        'tools/call': async (request: ServerRequest) => {
          this.emit('requestStart');
          try {
            const params = request.params as unknown as ToolCallParams;
            const { name, arguments: args } = params;

            if (!args) {
              throw new Error("No arguments provided");
            }

            switch (name) {
              case "list_extensions": {
                const extensions = await this.registry.listExtensions();
                return {
                  content: [
                    {
                      type: "text",
                      text: `Available extensions: ${extensions.map(ext => ext.id).join(", ")}`,
                    },
                  ],
                  isError: false,
                };
              }

              default:
                return {
                  content: [{ type: "text", text: `Unknown tool: ${name}` }],
                  isError: true,
                };
            }
          } catch (error) {
            this.emit('error', error);
            return {
              content: [
                {
                  type: "text",
                  text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
              isError: true,
            };
          } finally {
            this.emit('requestEnd');
          }
        }
      }
    };

    // Initialize server with capabilities
    this.server = new Server(config);
  }

  public async start(port: number = 3000): Promise<void> {
    this.currentPort = port;
    this.httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      const transport = new SSEServerTransport("http://localhost:" + port, res);
      this.onConnect();
      this.server.connect(transport).then(() => {
        req.on('close', () => this.onDisconnect());
      }).catch(error => {
        this.onDisconnect();
        console.error("Failed to connect transport:", error);
      });
    });
    
    return new Promise((resolve) => {
      this.httpServer?.listen(port, () => {
        console.log("MCP-LMT Server running on port", port);
        this.emit('stateChanged', 'started');
        resolve();
      });
    });
  }
  
  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.httpServer) {
        resolve();
        return;
      }
      
      this.httpServer.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.httpServer = null;
          this.currentPort = undefined;
          this.emit('stateChanged', 'stopped');
          resolve();
        }
      });
    });
  }

  public getPort(): number | undefined {
    return this.currentPort;
  }

  public getSessionCount(): number {
    return this.activeConnections;
  }

  protected onConnect(): void {
    this.activeConnections++;
    this.emit('connectionChanged', this.activeConnections);
  }

  protected onDisconnect(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
    this.emit('connectionChanged', this.activeConnections);
  }
}