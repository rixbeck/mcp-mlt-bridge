import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { MCPStatusManager } from "../status/mcpStatusManager";
import { ExtensionRegistry } from "../registry/extensionRegistry";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  CallToolResult,
  TextContent,
  ImageContent,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { EventEmitter } from "events";

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
    
    // Create server instance
    this.server = new Server({
      name: "mcp-lmt-bridge",
      version: "0.1.0",
      capabilities: {
        resources: {},
        tools: {},
      },
    });
    
    this.registerToolHandlers();
  }
  
  private registerToolHandlers(): void {
    // Tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [MCPServer.LIST_EXTENSIONS_TOOL],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.emit('requestStart');
      try {
        const { name, arguments: args } = request.params;

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
                  text: `Available extensions: ${extensions.join(", ")}`,
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
    });
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
  
  public stop(): Promise<void> {
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

// Example usage:
// const registry = new ExtensionRegistry();
// const mcServer = new MCServer(registry);
// mcServer.start().catch((error) => {
//   console.error("Fatal error running server:", error);
//   process.exit(1);
// });