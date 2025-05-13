# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the MCP-LMT-Bridge extension.

## Common Issues

### Installation Issues

#### Issue: Extension Not Visible After Installation

**Symptoms:**
- Extension doesn't appear in `code --list-extensions`
- Extension not visible in VS Code Extensions panel
- Extension not activated on startup

**Solutions:**

1. Verify installation:

```bash
# Remove existing installation
code --uninstall-extension mcp-lmt-bridge

# Clean install
npm run clean
npm run compile
npm run package:vsix
code --install-extension mcp-lmt-bridge-0.1.0.vsix
```

2. Check extension manifest:
    - Ensure `onStartupFinished` activation event is present in package.json
    - Verify extension ID matches: "mcp-lmt-bridge"
    - Check VS Code version compatibility (^1.85.0)

3. Review VS Code logs:

```bash
# Windows: %APPDATA%\Code\logs\extension-host.log
# macOS/Linux: ~/.vscode/logs/extension-host.log
```

### Connection Problems

#### Issue: Unable to Connect to MCP Server

**Symptoms:**
- "Connection refused" errors
- Tools not appearing in the extension
- Timeout errors when executing commands
- SSE connection failures
- Status bar showing "Stopped" state

**Solutions:**

1. Check server status:

```bash
# Check if server is running
netstat -tulpn | grep 3000
```

2. Verify port configuration:

```json
{
    "mcp-lmt-bridge": {
        "serverPort": 3000,
        "trace.server": "verbose",
        "logLevel": "debug"
    }
}
```

3. Check firewall settings:

```bash
# Allow traffic on server port
sudo ufw allow 3000/tcp
```

#### Issue: Frequent Disconnections

**Symptoms:**
- Random connection drops
- "Connection reset" errors
- Intermittent tool availability

**Solutions:**

1. Enable connection logging:

```json
{
    "mcp-lmt-bridge.trace.server": "verbose",
    "mcp-lmt-bridge.logLevel": "debug"
}
```

2. Check session timeout settings in server:
    - Default session timeout: 30 minutes
    - Sessions are cleaned up every minute

### Status Monitoring Issues

#### Issue: Status Bar Not Updating

**Symptoms:**
- Status bar shows incorrect server state
- Status updates not reflecting server activity
- Missing status bar icons or commands

**Solutions:**

1. Check Status Manager registration:
```typescript
// Verify status manager initialization
const statusManager = new MCPStatusManager(server);
context.subscriptions.push(statusManager);
```

2. Enable status debug logging:
```json
{
    "mcp-lmt-bridge.statusBar.debug": true
}
```

3. Verify event listeners:
```typescript
// Check event subscriptions
server.on('stateChanged', (state) => {
    console.log('Server state changed:', state);
});
```

#### Issue: SSE Connection Problems

**Symptoms:**
- Frequent disconnections
- Missing server events
- Delayed status updates
- "EventSource failed" errors

**Solutions:**

1. Check SSE endpoint configuration:
```typescript
await server.start({
    transportType: 'sse',
    sse: {
        endpoint: '/sse',
        port: 3000
    }
});
```

2. Enable SSE debug logging:
```json
{
    "mcp-lmt-bridge.sse.debug": true
}
```

3. Monitor SSE connection status:
```typescript
const eventSource = new EventSource('http://localhost:3000/sse');
eventSource.onerror = (error) => {
    console.error('SSE error:', error);
};
```

### Tool Execution Issues

#### Issue: Tool Execution Failures

**Symptoms:**
- "Tool not found" errors
- Parameter validation failures
- Execution timeouts

**Solutions:**

1. Verify tool registration:

```typescript
// Check if tool is registered
const tools = await vscode.commands.executeCommand('mcp.lmt.listExtensions');
console.log(tools);
```

2. Validate parameters:

```typescript
// Example of proper parameter formatting
const params = {
    input: "test",
    options: {
        timeout: 5000,
        retries: 3
    }
};
```

3. Check execution logs:

```bash
# View extension logs
code --log-level debug
```

#### Issue: Performance Problems

**Symptoms:**
- Slow tool execution
- High memory usage
- CPU spikes

**Solutions:**
1. Check system resources and memory usage
2. Monitor connection status and session management
3. Review WebSocket server logs for potential issues

### Integration Issues

#### Issue: Extension Conflicts

**Symptoms:**
- Tools from other extensions not visible
- Command conflicts
- Extension activation failures

**Solutions:**

1. Check extension logs:

```bash
# Open extension development host
code --extensionDevelopmentPath=/path/to/extension
```

2. Verify extension manifest:

```json
{
    "activationEvents": [
        "onCommand:mcp.lmt.listExtensions",
        "onCommand:mcp.lmt.executeTool"
    ]
}
```

3. Review extension dependencies:

```json
{
    "extensionDependencies": [
        "required.extension"
    ]
}
```

## JSON-RPC Error Codes

| Code    | Description        | Solution                                    |
|---------|-------------------|--------------------------------------------|
| -32700  | Parse error       | Check JSON message format                   |
| -32600  | Invalid request   | Verify request structure and JSON-RPC version |
| -32601  | Method not found  | Check method name and available commands    |
| -32602  | Invalid params    | Verify parameter types and required fields  |
| -32603  | Internal error    | Check server logs for details              |

## Diagnostic Tools

### System Information

```bash
# Get extension info
code --list-extensions --show-versions

# Check Node.js version
node --version

# View system resources
top -b -n 1
```

### Log Analysis

```bash
# View extension logs
code --log-level debug

# Analyze connection logs
grep "MCP-LMT-Bridge" ~/.vscode/extensions/logs/

# Check system logs
journalctl -u code.service
```

### Network Diagnostics

```bash
# Check server connectivity
curl -v http://localhost:3000/health

# Monitor network traffic
tcpdump -i lo port 3000

# Test WebSocket connection
wscat -c ws://localhost:3000
```

## Support

Report issues and contribute on GitHub:
[https://github.com/username/mcp-lmt-bridge](https://github.com/username/mcp-lmt-bridge)