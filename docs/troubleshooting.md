# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the MCP-LMT-Bridge extension.

## Common Issues

### Connection Problems

#### Issue: Unable to Connect to MCP Server
**Symptoms:**
- "Connection refused" errors
- Tools not appearing in the extension
- Timeout errors when executing commands

**Solutions:**
1. Check server status:
   ```bash
   # Check if server is running
   netstat -tulpn | grep 3000
   ```

2. Verify port configuration:
   ```json
   {
       "mcp-lmt-bridge.serverPort": 3000,
       "mcp-lmt-bridge.autoReconnect": true
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

2. Increase timeout settings:
   ```json
   {
       "mcp-lmt-bridge.connectionTimeout": 30000,
       "mcp-lmt-bridge.requestTimeout": 60000
   }
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
1. Enable performance monitoring:
   ```json
   {
       "mcp-lmt-bridge.performance.monitoring": true,
       "mcp-lmt-bridge.performance.sampling": 1000
   }
   ```

2. Optimize resource usage:
   ```json
   {
       "mcp-lmt-bridge.maxConcurrentExecutions": 5,
       "mcp-lmt-bridge.maxQueueSize": 100
   }
   ```

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

## Error Codes Reference

### System Errors (1xxx)
| Code | Description | Solution |
|------|-------------|----------|
| 1001 | Server startup failed | Check port availability |
| 1002 | Configuration error | Verify settings.json |
| 1003 | Resource exhaustion | Adjust resource limits |

### Protocol Errors (2xxx)
| Code | Description | Solution |
|------|-------------|----------|
| 2001 | Invalid message format | Check message structure |
| 2002 | Protocol version mismatch | Update extension |
| 2003 | Authentication failed | Verify credentials |

### Execution Errors (3xxx)
| Code | Description | Solution |
|------|-------------|----------|
| 3001 | Tool not found | Verify tool ID |
| 3002 | Invalid parameters | Check parameter types |
| 3003 | Execution timeout | Adjust timeout settings |

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

## Performance Tuning

### Memory Optimization
```json
{
    "mcp-lmt-bridge.memory": {
        "maxHeapSize": "512M",
        "gcInterval": 300000
    }
}
```

### Connection Pooling
```json
{
    "mcp-lmt-bridge.pool": {
        "minSize": 5,
        "maxSize": 20,
        "idleTimeout": 60000
    }
}
```

### Caching Configuration
```json
{
    "mcp-lmt-bridge.cache": {
        "enabled": true,
        "ttl": 300000,
        "maxSize": 1000
    }
}
```

## Support Channels

1. **GitHub Issues**
   - Report bugs
   - Request features
   - Share improvements

2. **Documentation**
   - [Online documentation](https://example.com/docs)
   - [API reference](https://example.com/api)
   - [FAQ](https://example.com/faq)

3. **Community**
   - [Discord server](https://discord.gg/example)
   - [Stack Overflow tag](https://stackoverflow.com/questions/tagged/mcp-lmt-bridge)
   - [GitHub Discussions](https://github.com/org/mcp-lmt-bridge/discussions)