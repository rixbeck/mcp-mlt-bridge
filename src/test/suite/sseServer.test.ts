import { strict as assert } from 'assert';
import { MCPServer } from '../../server/sseServer';
import { ExtensionRegistry, ExtensionInfo, ExtensionStatus } from '../../registry/extensionRegistry';
import { EventEmitter } from 'events';
import { Tool, ServerRequest } from '@modelcontextprotocol/sdk/types.js';

suite('SSE Server Tests', () => {
    let server: MCPServer;
    let registry: ExtensionRegistry;
    let mockExtension: ExtensionInfo;

    setup(() => {
        mockExtension = {
            id: 'test.extension',
            name: 'Test Extension',
            version: '1.0.0',
            capabilities: ['test'],
            tools: [],
            status: ExtensionStatus.Active
        };
        registry = new ExtensionRegistry();
        server = new MCPServer(registry);
    });

    teardown(async () => {
        await server.stop();
    });

    test('Server initialization', () => {
        assert.ok(server instanceof EventEmitter, 'Server should extend EventEmitter');
        assert.equal(server.getSessionCount(), 0, 'Initial session count should be 0');
        assert.equal(server.getPort(), undefined, 'Initial port should be undefined');
    });

    test('Server start/stop', async () => {
        const testPort = 3001;
        await server.start(testPort);
        assert.equal(server.getPort(), testPort, 'Port should be set after start');
        
        let stateChanged = false;
        server.on('stateChanged', (state) => {
            assert.equal(state, 'stopped', 'State should change to stopped');
            stateChanged = true;
        });

        await server.stop();
        assert.equal(server.getPort(), undefined, 'Port should be undefined after stop');
        assert.ok(stateChanged, 'StateChanged event should have fired');
    });

    test('Connection handling', async () => {
        await server.start(3002);
        
        let connectionCount = 0;
        server.on('connectionChanged', (count) => {
            connectionCount = count;
        });

        // Simulate connections
        server['onConnect']();
        assert.equal(server.getSessionCount(), 1, 'Session count should be 1');
        assert.equal(connectionCount, 1, 'Connection changed event should fire with count 1');

        server['onConnect']();
        assert.equal(server.getSessionCount(), 2, 'Session count should be 2');
        assert.equal(connectionCount, 2, 'Connection changed event should fire with count 2');

        server['onDisconnect']();
        assert.equal(server.getSessionCount(), 1, 'Session count should be 1 after disconnect');
        assert.equal(connectionCount, 1, 'Connection changed event should fire with count 1');
    });

    test('List tools functionality', async () => {
        // Access the list tools handler directly
        const handlers = server['server']['_requestHandlers'];
        const listToolsHandler = handlers.get('listTools');
        assert.ok(listToolsHandler, 'List tools handler should be registered');

        const response = await listToolsHandler({
            jsonrpc: '2.0',
            method: 'listTools',
            id: '1',
            params: {}
        });

        assert.ok(Array.isArray(response.tools), 'Should return tools array');
        assert.equal(response.tools[0].name, 'list_extensions', 'Should have list_extensions tool');
    });

    test('Call tool functionality', async () => {
        let requestStarted = false;
        let requestEnded = false;

        server.on('requestStart', () => requestStarted = true);
        server.on('requestEnd', () => requestEnded = true);

        // Access the call tool handler directly
        const handlers = server['server']['_requestHandlers'];
        const callToolHandler = handlers.get('callTool');
        assert.ok(callToolHandler, 'Call tool handler should be registered');

        // Mock the registry to return our test extension
        const originalListExtensions = registry.listExtensions;
        registry.listExtensions = async () => [mockExtension];

        // Test successful case
        const successResult = await callToolHandler({
            jsonrpc: '2.0',
            method: 'callTool',
            id: '1',
            params: {
                name: 'list_extensions',
                arguments: {}
            }
        });

        assert.ok(requestStarted, 'Request start event should fire');
        assert.ok(requestEnded, 'Request end event should fire');
        assert.deepEqual(successResult.content[0], {
            type: 'text',
            text: `Available extensions: ${mockExtension.id}`
        });
        assert.equal(successResult.isError, false);

        // Test unknown tool
        const unknownResult = await callToolHandler({
            jsonrpc: '2.0',
            method: 'callTool',
            id: '1',
            params: {
                name: 'unknown_tool',
                arguments: {}
            }
        });

        assert.equal(unknownResult.isError, true);
        assert.equal(unknownResult.content[0].text, 'Unknown tool: unknown_tool');

        // Test missing arguments
        const missingArgsResult = await callToolHandler({
            jsonrpc: '2.0',
            method: 'callTool',
            id: '1',
            params: {
                name: 'list_extensions'
            }
        });

        assert.equal(missingArgsResult.isError, true);
        assert.equal(missingArgsResult.content[0].text, 'Error: No arguments provided');

        // Restore original method
        registry.listExtensions = originalListExtensions;
    });
});
