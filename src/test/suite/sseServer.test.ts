import { strict as assert } from 'assert';
import { MCPServer } from '../../server/sseServer';
import { ExtensionRegistry, ExtensionInfo, ExtensionStatus } from '../../registry/extensionRegistry';
import { EventEmitter } from 'events';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

// Helper to get a random port between 3000-4000 to avoid conflicts
const getRandomPort = () => Math.floor(Math.random() * 1000) + 3000;

// Mock request type
type MockRequest = {
    jsonrpc: string;
    id: string;
    method: string;
    params: Record<string, any>;
};

suite('SSE Server Tests', () => {
    let server: MCPServer;
    let registry: ExtensionRegistry;
    let mockExtension: ExtensionInfo;

    // Mock extension registry before each test
    setup(async () => {
        mockExtension = {
            id: 'test.extension',
            name: 'Test Extension',
            version: '1.0.0',
            capabilities: ['test'],
            tools: [],
            status: ExtensionStatus.Active
        };

        // Create registry with mocked listExtensions method
        registry = new ExtensionRegistry();
        registry.listExtensions = async () => [mockExtension];

        // Create server instance
        server = new MCPServer(registry);

        // Wait for server to be ready
        await new Promise<void>(resolve => {
            const checkReady = () => {
                if (server.getPort() === undefined) {
                    resolve();
                }
            };
            checkReady();
        });
    });

    // Clean up after each test
    teardown(async () => {
        if (server) {
            await server.stop();
            // Wait for server to fully stop
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    });

    test('Server initialization', () => {
        assert.ok(server instanceof EventEmitter, 'Server should extend EventEmitter');
        assert.equal(server.getSessionCount(), 0, 'Initial session count should be 0');
        assert.equal(server.getPort(), undefined, 'Initial port should be undefined');
    });

    test('Server start/stop', async () => {
        const testPort = getRandomPort();
        
        // Test start
        await server.start(testPort);
        assert.equal(server.getPort(), testPort, 'Port should be set after start');
        
        // Test state change events
        let stateChanged = false;
        server.on('stateChanged', (state) => {
            assert.equal(state, 'stopped', 'State should change to stopped');
            stateChanged = true;
        });

        // Test stop
        await server.stop();
        assert.equal(server.getPort(), undefined, 'Port should be undefined after stop');
        assert.ok(stateChanged, 'StateChanged event should have fired');

        // Wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    test('Connection handling', async () => {
        const testPort = getRandomPort();
        await server.start(testPort);
        
        let connectionChangedCount = 0;
        let lastConnectionCount = 0;
        
        server.on('connectionChanged', (count) => {
            connectionChangedCount++;
            lastConnectionCount = count;
        });

        // Simulate connections
        server['onConnect']();
        assert.equal(server.getSessionCount(), 1, 'Session count should be 1');
        assert.equal(lastConnectionCount, 1, 'Connection changed event should fire with count 1');

        server['onConnect']();
        assert.equal(server.getSessionCount(), 2, 'Session count should be 2');
        assert.equal(lastConnectionCount, 2, 'Connection changed event should fire with count 2');

        server['onDisconnect']();
        assert.equal(server.getSessionCount(), 1, 'Session count should be 1 after disconnect');
        assert.equal(lastConnectionCount, 1, 'Connection changed event should fire with count 1');

        await server.stop();
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    test('List tools functionality', async () => {
        const testPort = getRandomPort();
        await server.start(testPort);

        // Get list tools handler
        const handlers = server.getHandlers();
        const listToolsHandler = handlers['tools/list'];
        assert.ok(listToolsHandler, 'List tools handler should be registered');

        // Test list tools handler
        const mockRequest: MockRequest = {
            jsonrpc: '2.0',
            method: 'tools/list',
            id: '1',
            params: {}
        };

        const response = await listToolsHandler(mockRequest);
        assert.ok(Array.isArray(response.tools), 'Should return tools array');
        assert.equal(response.tools[0].name, 'list_extensions', 'Should have list_extensions tool');

        await server.stop();
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    test('Call tool functionality', async () => {
        const testPort = getRandomPort();
        await server.start(testPort);

        let requestStarted = false;
        let requestEnded = false;

        server.on('requestStart', () => requestStarted = true);
        server.on('requestEnd', () => requestEnded = true);

        // Get call tool handler
        const handlers = server.getHandlers();
        const callToolHandler = handlers['tools/call'];
        assert.ok(callToolHandler, 'Call tool handler should be registered');

        // Test successful case
        const successResult = await callToolHandler({
            jsonrpc: '2.0',
            method: 'tools/call',
            id: '1',
            params: {
                name: 'list_extensions',
                arguments: {}
            }
        });

        assert.ok(requestStarted, 'Request start event should fire');
        assert.ok(requestEnded, 'Request end event should fire');
        assert.equal(successResult.isError, false, 'Success result should not have error');
        assert.deepEqual(successResult.content[0], {
            type: 'text',
            text: `Available extensions: ${mockExtension.id}`
        });

        // Test unknown tool
        const unknownResult = await callToolHandler({
            jsonrpc: '2.0',
            method: 'tools/call',
            id: '1',
            params: {
                name: 'unknown_tool',
                arguments: {}
            }
        });

        assert.ok(unknownResult.isError, 'Unknown tool should return error');
        assert.equal(unknownResult.content[0].text, 'Unknown tool: unknown_tool');

        // Test missing arguments
        const missingArgsResult = await callToolHandler({
            jsonrpc: '2.0',
            method: 'tools/call',
            id: '1',
            params: {
                name: 'unknown_tool'
            }
        });

        assert.ok(missingArgsResult.isError, 'Missing arguments should return error');
        assert.equal(missingArgsResult.content[0].text, 'No arguments provided');

        await server.stop();
        await new Promise(resolve => setTimeout(resolve, 100));
    });
});
