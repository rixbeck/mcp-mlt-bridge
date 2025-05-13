# MCP - LanguageModelTools API Bridge Extension

A Visual Studio Code extension serving as a bridge between MCP-capable AI chat extensions and the LanguageModelTools API.

## Description

The MCP-LMT-Bridge creates an MCP server that enables AI chat extensions to leverage the powerful capabilities of LanguageModelTools API-enabled VSCode extensions. This bridge facilitates seamless integration and communication between these two extension ecosystems.

## Core Features

1. MCP Server Implementation
   - Implements FastMCP protocol for efficient server communication
   - Handles incoming requests from AI chat extensions via SSE
   - Manages communication protocol and data translation
   - Provides real-time status monitoring and visualization

2. Extension Discovery & Mapping
   - Lists all installed VSCode extensions with LanguageModelTools API support
   - Provides detailed tool information from each compatible extension
   - Creates dynamic mappings between MCP commands and API tools

3. Command Integration
   - Exposes LanguageModelTools capabilities as MCP commands
   - Enables direct tool execution through MCP command interface
   - Supports real-time command response handling

## Technical Requirements

- Visual Studio Code 1.85.0 or higher
- FastMCP v1.0.0 or higher
- MCP Protocol compliance
- LanguageModelTools API compatibility
- Node.js 16.x or higher

## Primary Commands

- `mcp.lmt.listExtensions`: Lists all LanguageModelTools-compatible extensions
- `mcp.lmt.getToolInfo`: Retrieves detailed tool information for a specific extension
- `mcp.lmt.executeTool`: Executes a specified tool with provided parameters
- `mcp-lmt-bridge.showServerInfo`: Displays current server status and session information
- `mcp-lmt-bridge.startServer`: Manually starts the MCP server if not running

## API Reference

Extension authors can reference:
- [LanguageModelTools API documentation](https://code.visualstudio.com/api/extension-guides/tools)
- [FastMCP Protocol Specification](https://fastmcp.dev/docs)
- [MCP Status API Documentation](./docs/api-reference.md#status-management)

## Current Status

The extension currently provides:
- Full FastMCP protocol implementation with SSE transport
- Basic extension discovery and registration
- Command execution pipeline
- Status monitoring and visualization
- Real-time session tracking

Planned enhancements:
- Enhanced security features
- Extended tool capabilities mapping
- Performance optimizations
- Advanced error handling