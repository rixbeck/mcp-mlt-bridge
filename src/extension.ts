import * as vscode from 'vscode';
import { MCPServer } from './server/mcpServer';
import { ExtensionRegistry } from './registry/extensionRegistry';
import { CommandExecutor } from './executor/commandExecutor';
import { MCPStatusManager } from './status/mcpStatusManager';

/**
 * Global instance of the MCP server
 * @internal
 */
let mcpServer: MCPServer;

/**
 * Activates the MCP-LMT Bridge extension
 * Sets up the extension registry, command executor, and MCP server
 * Registers VS Code commands for interacting with language model tools
 *
 * @param {vscode.ExtensionContext} context - The VS Code extension context
 * @returns {Promise<void>}
 *
 * Commands registered:
 * - mcp.lmt.listExtensions: List all available language model tool extensions
 * - mcp.lmt.getToolInfo: Get information about a specific extension
 * - mcp.lmt.executeTool: Execute a specific language model tool
 *
 * @throws {Error} If the MCP server fails to start
 */
export async function activate(context: vscode.ExtensionContext) {
    const registry = new ExtensionRegistry();
    const executor = new CommandExecutor(registry);
    mcpServer = new MCPServer(registry, executor);
    
    // Initialize status manager
    const statusManager = new MCPStatusManager(mcpServer);
    context.subscriptions.push(statusManager);

    // Register status bar commands
    context.subscriptions.push(
        vscode.commands.registerCommand('mcp-lmt-bridge.showServerInfo', () => {
            const port = mcpServer.getPort();
            const sessionCount = mcpServer.getSessionCount();
            vscode.window.showInformationMessage(
                `MCP Server Info:\nPort: ${port || 'Not running'}\nActive Sessions: ${sessionCount}`
            );
        }),
        vscode.commands.registerCommand('mcp-lmt-bridge.startServer', async () => {
            try {
                await mcpServer.start();
                vscode.window.showInformationMessage('MCP Server started successfully');
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to start MCP Server: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }),
        vscode.commands.registerCommand('mcp-lmt-bridge.showActiveRequests', () => {
            const sessions = mcpServer.getSessionInfo();
            if (sessions.length === 0) {
                vscode.window.showInformationMessage('No active sessions');
            } else {
                vscode.window.showInformationMessage('Active Sessions:\n' + sessions.join('\n'));
            }
        })
    );

    try {
        await mcpServer.start();
        vscode.window.showInformationMessage('MCP-LMT Bridge is now active');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to start MCP-LMT Bridge: ${error}`);
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('mcp.lmt.listExtensions', () => {
            return registry.listExtensions();
        }),
        vscode.commands.registerCommand('mcp.lmt.getToolInfo', (extensionId: string) => {
            return registry.getExtension(extensionId);
        }),
        vscode.commands.registerCommand('mcp.lmt.executeTool', async (toolId: string, params: any) => {
            return executor.executeCommand(toolId, params);
        })
    );
}

/**
 * Deactivates the MCP-LMT Bridge extension
 * Stops the MCP server and cleans up resources
 *
 * @returns {void}
 */
export function deactivate() {
    if (mcpServer) {
        mcpServer.stop();
    }
}

/**
 * Make mcpServer accessible in tests
 * @internal
 */
export function getMCPServer(): MCPServer {
    return mcpServer;
}