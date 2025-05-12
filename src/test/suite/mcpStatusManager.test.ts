import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { MCPServer } from '../../server/sseServer';
import { MCPStatusManager, ServerState } from '../../status/mcpStatusManager';

// Mock class for StatusBarItem
class MockStatusBarItem implements vscode.StatusBarItem {
    public text: string = '';
    public tooltip: string | undefined;
    public color: string | vscode.ThemeColor | undefined;
    public backgroundColor: vscode.ThemeColor | undefined;
    public command: string | vscode.Command | undefined;
    public accessibilityInformation: vscode.AccessibilityInformation | undefined;
    public name: string = 'mock';
    public id: string = 'mock';
    public alignment: vscode.StatusBarAlignment = vscode.StatusBarAlignment.Right;
    public priority: number = 0;

    public show(): void {}
    public hide(): void {}
    public dispose(): void {}
}

suite('MCP Status Manager Tests', () => {
    let statusManager: MCPStatusManager;
    let mockServer: MCPServer & EventEmitter;
    let mockStatusBarItem: MockStatusBarItem;
    let createStatusBarItemCalls: any[][] = [];

    setup(() => {
        // Reset tracking
        createStatusBarItemCalls = [];
        
        // Mock status bar creation
        mockStatusBarItem = new MockStatusBarItem();
        const originalCreateStatusBarItem = vscode.window.createStatusBarItem;
        (vscode.window as any).createStatusBarItem = (...args: any[]) => {
            createStatusBarItemCalls.push(args);
            return mockStatusBarItem;
        };

        // Mock server
        mockServer = new EventEmitter() as MCPServer & EventEmitter;
    });

    teardown(() => {
        statusManager?.dispose();
    });

    test('Initialization', () => {
        statusManager = new MCPStatusManager(mockServer);

        assert.equal(createStatusBarItemCalls.length, 1, 'StatusBarItem should be created');
        assert.equal(mockStatusBarItem.text, '$(stop) MCP Server: Stopped', 'Initial state should be stopped');
        assert.ok(mockStatusBarItem.color instanceof vscode.ThemeColor, 'Should have error theme color');
        assert.equal(mockStatusBarItem.command, 'mcp-lmt-bridge.startServer', 'Should have start server command');
    });

    test('Status bar configuration', () => {
        statusManager = new MCPStatusManager(mockServer);
        const createCall = createStatusBarItemCalls[0];

        assert.equal(createCall[0], 'mcp-server-status', 'Should have correct ID');
        assert.equal(createCall[1], vscode.StatusBarAlignment.Right, 'Should be right-aligned');
        assert.equal(createCall[2], 100, 'Should have priority 100');
    });

    test('State transitions', () => {
        statusManager = new MCPStatusManager(mockServer);

        // Test STARTED state
        mockServer.emit('stateChanged', ServerState.STARTED);
        assert.equal(mockStatusBarItem.text, '$(rocket) MCP Server: Running', 'Should show running state');
        assert.equal(mockStatusBarItem.command, 'mcp-lmt-bridge.showServerInfo', 'Should have info command');

        // Test PROCESSING state
        mockServer.emit('stateChanged', ServerState.PROCESSING);
        assert.equal(mockStatusBarItem.text, '$(sync~spin) MCP Server: Processing', 'Should show processing state');
        assert.equal(mockStatusBarItem.command, 'mcp-lmt-bridge.showActiveRequests', 'Should have requests command');

        // Test STOPPED state
        mockServer.emit('stateChanged', ServerState.STOPPED);
        assert.equal(mockStatusBarItem.text, '$(stop) MCP Server: Stopped', 'Should show stopped state');
        assert.equal(mockStatusBarItem.command, 'mcp-lmt-bridge.startServer', 'Should have start command');
    });

    test('Request lifecycle events', () => {
        statusManager = new MCPStatusManager(mockServer);

        // Set initial state to STARTED
        mockServer.emit('stateChanged', ServerState.STARTED);

        // Test request start
        mockServer.emit('requestStart');
        assert.equal(mockStatusBarItem.text, '$(sync~spin) MCP Server: Processing', 'Should show processing on request start');

        // Test request end
        mockServer.emit('requestEnd');
        assert.equal(mockStatusBarItem.text, '$(rocket) MCP Server: Running', 'Should return to running on request end');
    });

    test('Error handling', () => {
        statusManager = new MCPStatusManager(mockServer);

        // Set initial state to STARTED
        mockServer.emit('stateChanged', ServerState.STARTED);

        // Test error event
        mockServer.emit('error', new Error('Test error'));
        assert.equal(mockStatusBarItem.text, '$(stop) MCP Server: Stopped', 'Should show stopped state on error');
        assert.ok(mockStatusBarItem.color instanceof vscode.ThemeColor, 'Should have error theme color');
    });

    test('Resource disposal', () => {
        statusManager = new MCPStatusManager(mockServer);
        
        let disposed = false;
        mockStatusBarItem.dispose = () => { disposed = true; };
        
        statusManager.dispose();
        assert.ok(disposed, 'StatusBarItem should be disposed');
    });
});