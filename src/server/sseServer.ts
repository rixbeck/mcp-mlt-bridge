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

const registry = new ExtensionRegistry();

// Tool definitions
const LIST_EXTENSIONS_TOOL: Tool = {
  name: "list_extensions",
  description: "List all available extensions",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
};

// Create server instance
const server = new Server({
  name: "mcp-lmt-bridge",
  version: "0.1.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [LIST_EXTENSIONS_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    switch (name) {
      case "list_extensions": {
        const extensions = await registry.listExtensions();
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
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  const port = 3000;
  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    const transport = new SSEServerTransport("http://localhost:" + port, res);
    server.connect(transport).catch(error => {
      console.error("Failed to connect transport:", error);
      process.exit(1);
    });
  });
  
  httpServer.listen(port);
  console.error("MCP-LMT Server running");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});