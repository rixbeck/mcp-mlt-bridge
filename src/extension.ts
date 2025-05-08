import * as vscode from 'vscode';
import { MCPServer } from './server/mcpServer';
import { ExtensionRegistry } from './registry/extensionRegistry';
import { CommandExecutor } from './executor/commandExecutor';

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