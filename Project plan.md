# MCP - LanguageModelTools API Bridge Extension

A Visual Studio Code extension serving as a bridge between MCP-capable AI chat extensions and the LanguageModelTools API.

## Description

The MCP-LMT-Bridge creates an MCP server that enables AI chat extensions to leverage the powerful capabilities of LanguageModelTools API-enabled VSCode extensions. This bridge facilitates seamless integration and communication between these two extension ecosystems.

## Core Features

1. MCP Server Implementation
   - Acts as a dedicated MCP server within VSCode
   - Handles incoming requests from AI chat extensions
   - Manages communication protocol and data translation

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
- MCP Protocol compliance
- LanguageModelTools API compatibility

## Primary Commands

- `mcp.lmt.listExtensions`: Lists all LanguageModelTools-compatible extensions
- `mcp.lmt.getToolInfo`: Retrieves detailed tool information for a specific extension
- `mcp.lmt.executeTool`: Executes a specified tool with provided parameters

## API Reference

Extension authors can reference the [LanguageModelTools API documentation](https://code.visualstudio.com/api/extension-guides/tools) for implementation details.