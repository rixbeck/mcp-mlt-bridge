import * as vscode from 'vscode';
import { MCPServer } from './server/mcpServer';
import { ExtensionRegistry } from './registry/extensionRegistry';
import { CommandExecutor } from './executor/commandExecutor';

let mcpServer: MCPServer;

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

export function deactivate() {
    if (mcpServer) {
        mcpServer.stop();
    }
}