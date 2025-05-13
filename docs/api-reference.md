# API Reference

This document provides detailed information about the MCP-LMT-Bridge API, including commands, interfaces, and response formats.

## MCP Commands

### 1. List Extensions

- **Command**: `mcp.lmt.listExtensions`
- **Display Name**: `MCP-LMT: List Extensions`
- **Description**: Lists all LanguageModelTools-compatible extensions
- **Parameters**: None
- **Returns**: Array of Extension objects

```typescript
interface Extension {
    id: string;
    name: string;
    version: string;
    tools: Tool[];
}
```

### 2. Get Tool Information

- **Command**: `mcp.lmt.getToolInfo`
- **Display Name**: `MCP-LMT: Get Tool Info`
- **Parameters**:
    - `toolId: string` - Unique identifier of the tool
- **Returns**: Detailed tool information

```typescript
interface ToolInfo {
    id: string;
    name: string;
    description: string;
    version: string;
    capabilities: string[];
    parameters: ParameterDefinition[];
    returns: ReturnTypeDefinition;
}
```

### 3. Status Bar Commands

- **Command**: `mcp-lmt-bridge.showServerInfo`
- **Display Name**: `MCP-LMT: Show Server Information`
- **Description**: Displays current server information including port and active sessions
- **Parameters**: None
- **Category**: MCP

- **Command**: `mcp-lmt-bridge.startServer`
- **Display Name**: `MCP-LMT: Start Server`
- **Description**: Starts the MCP server if it's not running
- **Parameters**: None
- **Category**: MCP

- **Command**: `mcp-lmt-bridge.showActiveRequests`
- **Display Name**: `MCP-LMT: Show Active Requests`
- **Description**: Shows information about currently active server sessions
- **Parameters**: None
- **Category**: MCP

### 4. Execute Tool

- **Command**: `mcp.lmt.executeTool`
- **Display Name**: `MCP-LMT: Execute Tool`
- **Parameters**:

```typescript
interface ExecuteToolParams {
    toolId: string;
    params: Record<string, any>;
    options?: ExecuteToolOptions;
}

interface ExecuteToolOptions {
    timeout?: number;
    retryCount?: number;
    ignoreErrors?: boolean;
}
```

- **Returns**: Tool-specific execution results

## Interfaces

### Tool Provider

```typescript
interface MCPToolProvider {
    getTools(): Tool[];
    executeTool(id: string, params: any): Promise<any>;
    validateParams?(params: any): boolean;
    getCapabilities?(): string[];
}
```

### Tool Definition

```typescript
interface Tool {
    id: string;
    name: string;
    description: string;
    parameters: ParameterDefinition[];
    returns: ReturnTypeDefinition;
    capabilities: string[];
    version: string;
}

interface ParameterDefinition {
    name: string;
    type: string;
    required: boolean;
    description?: string;
    default?: any;
    schema?: JsonSchema;
}

interface ReturnTypeDefinition {
    type: string;
    description: string;
    schema?: JsonSchema;
}
```

## Response Formats

### Response Format

#### Success Response

```json
{
    "jsonrpc": "2.0",
    "id": "request-123",
    "result": {
        // Tool-specific result data
    }
}
```

#### Error Response

```json
{
    "jsonrpc": "2.0",
    "id": "request-123",
    "error": {
        "code": -32600,
        "message": "Invalid request"
    }
}
```

## JSON-RPC Error Codes

| Code    | Description       |
|---------|------------------|
| -32700  | Parse error      |
| -32600  | Invalid request  |
| -32601  | Method not found |
| -32602  | Invalid params   |
| -32603  | Internal error   |

## Session Management

The MCP server implements session management with the following characteristics:

- Sessions are created upon WebSocket connection
- Session timeout: 30 minutes of inactivity
- Sessions are automatically cleaned up every minute
- Each session has a unique ID format: `session_[random]_[timestamp]`

## Status Bar Integration

The MCP server provides a status bar item that shows real-time server status:

### States

1. **Started**
   - Icon: `$(rocket)`
   - Text: "MCP Server: Running"
   - Action: Click to show server information
   
2. **Stopped**
   - Icon: `$(stop)`
   - Text: "MCP Server: Stopped"
   - Action: Click to start server
   
3. **Processing**
   - Icon: `$(sync~spin)`
   - Text: "MCP Server: Processing"
   - Action: Click to show active requests

### Status Updates
- Real-time updates based on server state changes
- Visual indicators for server health
- Interactive commands through status bar clicks

## Connection Handling

The MCP server now uses Server-Sent Events (SSE) for communication:

- Server runs on port 3000 by default (configurable)
- SSE-based transport for real-time, unidirectional communication
- Automatic reconnection handling with backoff
- Clean session management and termination
- Efficient event streaming with lower overhead than WebSocket
- Better compatibility with firewalls and proxies

### SSE Event Types

- `connect` - Emitted when a client connects
- `disconnect` - Emitted when a client disconnects
- `message` - Standard message event
- `error` - Error event with details
- `stateChanged` - Server state change notifications
- `requestStart`/`requestEnd` - Request lifecycle events

### FastMCP Integration

The server is built on FastMCP framework which provides:

- Standardized tool definitions and execution
- Built-in parameter validation
- Automatic schema generation
- Type-safe communication protocols
- Efficient event handling and streaming