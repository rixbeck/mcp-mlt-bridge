import * as vscode from 'vscode';
import { MCPServer } from './server/fastmcpServer';
import { ExtensionRegistry } from './registry/extensionRegistry';
import { CommandExecutor } from './executor/commandExecutor';
import { MCPStatusManager } from './status/mcpStatusManager';

/**
 * Global instance of the MCP server
 * @internal
 */
let mcpServer: MCPServer | undefined;

/**
 * Activates the MCP-LMT Bridge extension
 * Sets up the extension registry, command executor, and MCP server
 * Registers VS Code commands for interacting with language model tools
 *
 * @param {vscode.ExtensionContext} context - The VS Code extension context
 * @returns {Promise<void>}
 */
export async function activate(context: vscode.ExtensionContext) {
    const registry = new ExtensionRegistry();
    const executor = new CommandExecutor(registry);

    // Register core MCP commands first
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

    // Initialize MCP server
    mcpServer = new MCPServer(registry);
    
    // Register status bar commands
    context.subscriptions.push(
        vscode.commands.registerCommand('mcp-lmt-bridge.showServerInfo', () => {
            console.log('Getting MCP server status information...');
            const port = mcpServer?.getPort();
            const sessionCount = mcpServer?.getSessionCount() ?? 0;
            console.log(`MCP Server status - Port: ${port || 'Not running'}, Active Sessions: ${sessionCount}`);
            vscode.window.showInformationMessage(
                `MCP Server Info:\nPort: ${port || 'Not running'}\nActive Sessions: ${sessionCount}`
            );
        }),
        vscode.commands.registerCommand('mcp-lmt-bridge.startServer', async () => {
            try {
                await mcpServer?.start();
                vscode.window.showInformationMessage('MCP Server started successfully');
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to start MCP Server: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        })
    );

    try {
        await mcpServer.start();
        vscode.window.showInformationMessage('LMT Bridge is now active');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to start LMT Bridge: ${error}`);
    }
}

/**
 * Deactivates the LMT Bridge extension
 * Stops the MCP server and cleans up resources
 */
export function deactivate() {
    mcpServer?.stop();
}

/**
 * Get the MCP server instance
 * @internal
 */
export function getMCPServer(): MCPServer | undefined {
    return mcpServer;
}