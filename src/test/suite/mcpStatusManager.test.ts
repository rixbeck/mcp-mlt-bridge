import * as assert from 'assert';
import * as vscode from 'vscode';
import { MCPStatusManager, ServerState } from '../../status/mcpStatusManager';
import { MCPServer } from '../../server/mcpServer';
import { ExtensionRegistry } from '../../registry/extensionRegistry';
import { CommandExecutor } from '../../executor/commandExecutor';
import { EventEmitter } from 'events';

suite('MCPStatusManager Test Suite', () => {
    let statusManager: MCPStatusManager;
    let server: MCPServer;
    let statusBarItem: vscode.StatusBarItem;

    setup(() => {
        // Create a new server instance for each test
        const registry = new ExtensionRegistry();
        const executor = new CommandExecutor(registry);
        server = new MCPServer(registry, executor);

        // Create a mock status bar item
        statusBarItem = {
            text: '',
            color: undefined,
            command: undefined,
            tooltip: undefined,
            show: () => {},
            hide: () => {},
            dispose: () => {},
        } as vscode.StatusBarItem;

        // Mock the createStatusBarItem method
        const originalCreateStatusBarItem = vscode.window.createStatusBarItem;
        vscode.window.createStatusBarItem = (...args: any[]) => statusBarItem;

        // Create the status manager
        statusManager = new MCPStatusManager(server);

        // Restore the original method
        vscode.window.createStatusBarItem = originalCreateStatusBarItem;
    });

    teardown(() => {
        statusManager.dispose();
    });

    test('Should initialize with STOPPED state', () => {
        assert.strictEqual(statusBarItem.text, '$(stop) MCP Server: Stopped');
        assert.strictEqual(statusBarItem.command, 'mcp-lmt-bridge.startServer');
    });

    test('Should update status on server start', async () => {
        server.emit('stateChanged', ServerState.STARTED);
        assert.strictEqual(statusBarItem.text, '$(rocket) MCP Server: Running');
        assert.strictEqual(statusBarItem.command, 'mcp-lmt-bridge.showServerInfo');
    });

    test('Should update status on server stop', async () => {
        server.emit('stateChanged', ServerState.STOPPED);
        assert.strictEqual(statusBarItem.text, '$(stop) MCP Server: Stopped');
        assert.strictEqual(statusBarItem.command, 'mcp-lmt-bridge.startServer');
    });

    test('Should update status during request processing', async () => {
        server.emit('requestStart');
        assert.strictEqual(statusBarItem.text, '$(sync~spin) MCP Server: Processing');
        assert.strictEqual(statusBarItem.command, 'mcp-lmt-bridge.showActiveRequests');

        server.emit('requestEnd');
        assert.strictEqual(statusBarItem.text, '$(rocket) MCP Server: Running');
        assert.strictEqual(statusBarItem.command, 'mcp-lmt-bridge.showServerInfo');
    });

    test('Should handle server errors', async () => {
        server.emit('error', new Error('Test error'));
        assert.strictEqual(statusBarItem.text, '$(stop) MCP Server: Stopped');
        assert.strictEqual(statusBarItem.command, 'mcp-lmt-bridge.startServer');
    });
});