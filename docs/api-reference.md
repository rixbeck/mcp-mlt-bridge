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

### 3. Execute Tool

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

## Connection Handling

- Server runs on port 3000 by default (configurable)
- WebSocket protocol for real-time communication
- Automatic connection error handling and recovery
- Clean session termination on connection close