# API Reference

This document provides detailed information about the MCP-LMT-Bridge API, including commands, interfaces, and response formats.

## MCP Commands

### 1. List Extensions
- **Command**: `mcp.lmt.listExtensions`
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

### Success Response
```json
{
    "status": "success",
    "data": {
        "result": "Operation completed",
        "metadata": {
            "timestamp": "2025-05-08T17:45:56Z",
            "toolId": "example.tool",
            "execution": {
                "duration": "120ms",
                "memory": "5MB"
            }
        }
    }
}
```

### Error Response
```json
{
    "status": "error",
    "error": {
        "code": "INVALID_PARAMS",
        "message": "Invalid parameters provided",
        "details": {
            "param": "input",
            "expected": "string",
            "received": "number"
        },
        "timestamp": "2025-05-08T17:45:56Z"
    }
}
```

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `INVALID_PARAMS` | Invalid parameters provided | 400 |
| `TOOL_NOT_FOUND` | Requested tool not found | 404 |
| `EXECUTION_ERROR` | Tool execution failed | 500 |
| `TIMEOUT_ERROR` | Execution timeout exceeded | 408 |
| `AUTH_ERROR` | Authentication failed | 401 |
| `RATE_LIMIT` | Rate limit exceeded | 429 |

## Webhook Events

### Event Types
1. **tool.executed**
   - Triggered when a tool execution completes
   ```typescript
   interface ToolExecutedEvent {
       type: 'tool.executed';
       toolId: string;
       status: 'success' | 'error';
       timestamp: string;
       duration: number;
       result: any;
   }
   ```

2. **extension.registered**
   - Triggered when a new extension is registered
   ```typescript
   interface ExtensionRegisteredEvent {
       type: 'extension.registered';
       extensionId: string;
       timestamp: string;
       tools: string[];
   }
   ```

## Rate Limiting

The API implements rate limiting with the following default limits:
- 100 requests per minute per client
- 1000 requests per hour per client
- Maximum execution time: 30 seconds per request

Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1683565556