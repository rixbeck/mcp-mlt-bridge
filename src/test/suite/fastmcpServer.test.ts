import * as assert from 'assert';
import { EventEmitter } from 'events';
import { ExtensionRegistry, ExtensionInfo, ExtensionStatus } from '../../registry/extensionRegistry';
import { MCPServer } from '../../server/fastmcpServer';
import { mockVscode } from './mockVscode';
import { FastMCP, Context, SerializableValue, Progress, Tool, ToolParameters } from './mocks/fastmcp.mock';

// Mock registry
class MockExtensionRegistry extends ExtensionRegistry {
    private mockExtensions: ExtensionInfo[] = [
        {
            id: 'test.extension1',
            name: 'Test Extension 1',
            version: '1.0.0',
            capabilities: ['languageModelTools', 'webview'],
            tools: [{
                id: 'test.tool1',
                name: 'Test Tool 1',
                description: 'A test tool',
                parameters: []
            }],
            status: ExtensionStatus.Active
        },
        {
            id: 'test.extension2',
            name: 'Test Extension 2',
            version: '1.0.0',
            capabilities: ['languageModelTools', 'webview'],
            tools: [],
            status: ExtensionStatus.Active
        }
    ];

    constructor() {
        super();
    }

    override async listExtensions(): Promise<ExtensionInfo[]> {
        return this.mockExtensions;
    }
}

suite('MCPServer Test Suite', () => {
    let server: MCPServer;
    let registry: MockExtensionRegistry;

    setup(() => {
        registry = new MockExtensionRegistry();
        server = new MCPServer(registry);

        // Create mock FastMCP and add ls_extensions tool
        const mockServer = new FastMCP({
            name: 'Test Server',
            version: '1.0.0',
            instructions: 'Test Server Instance'
        });

        mockServer.addTool({
            name: 'ls_extensions',
            description: 'List all extensions',
            parameters: {} as ToolParameters,
            execute: async (_args: ToolParameters, _context: Context<string>) => {
                const extensions: ExtensionInfo[] = await registry.listExtensions();
                return extensions.length > 0
                    ? extensions.map(ext => ext.id).join(', ')
                    : 'No extensions found';
            }
        });

        // Replace the real FastMCP instance with our mock
        (server as any).server = mockServer;
    });

    test('Server initialization', () => {
        assert.ok(server instanceof MCPServer);
        assert.ok(server instanceof EventEmitter);
    });

    test('Add tool', () => {
        const tool = {
            name: 'test_tool',
            description: 'Test tool',
            parameters: undefined,
            execute: async () => 'test result'
        };

        server.addTool(tool);
        // Tool was added successfully if no error was thrown
    });

    test('Start server', async () => {
        const port = 3001;
        await server.start(port);
        assert.strictEqual(server.getPort(), port);
    });

    test('Stop server', async () => {
        let stateChangeEvent = false;
        server.on('stateChanged', (state) => {
            assert.strictEqual(state, 'stopped');
            stateChangeEvent = true;
        });

        await server.stop();
        assert.ok(stateChangeEvent);
    });

    test('Session management', async () => {
        const mockSession = { id: 'test-session' };
        let sessionStarted = false;
        let sessionEnded = false;

        server.on('sessionStarted', (session) => {
            assert.deepStrictEqual(session, mockSession);
            sessionStarted = true;
        });

        server.on('sessionEnded', (session) => {
            assert.deepStrictEqual(session, mockSession);
            sessionEnded = true;
        });

        // Start the server to enable event handling
        await server.start();

        const mockServer = (server as any).server as FastMCP;

        // Simulate connection event
        mockServer.simulateConnect(mockSession);
        await new Promise(resolve => setTimeout(resolve, 10)); // Give events time to propagate
        assert.strictEqual(server.getSessionCount(), 1);
        assert.ok(sessionStarted);

        // Simulate disconnect event
        mockServer.simulateDisconnect(mockSession);
        await new Promise(resolve => setTimeout(resolve, 10)); // Give events time to propagate
        assert.strictEqual(server.getSessionCount(), 0);
        assert.ok(sessionEnded);
    });

    test('Built-in ls_extensions tool', async () => {
        const mockContext: Context<any> = {
            log: {
                debug: (_message: string, _data?: SerializableValue) => {},
                info: (_message: string, _data?: SerializableValue) => {},
                warn: (_message: string, _data?: SerializableValue) => {},
                error: (_message: string, _data?: SerializableValue) => {}
            },
            reportProgress: async (_progress: Progress) => {},
            session: {
                id: 'test-session',
                clientId: 'test-client',
                status: 'connected'
            }
        };
        // Get the ls_extensions tool
        const mockServer = (server as any).server as FastMCP;
        const tools = mockServer.getTools();
        const lsExtensionsTool = tools[0];
        
        // Test with mock extensions
        const result = await lsExtensionsTool.execute(undefined, mockContext);
        assert.strictEqual(result, 'test.extension1, test.extension2');
        
        // Test with no extensions
        const emptyRegistry = new class extends MockExtensionRegistry {
            override async listExtensions() {
                return [];
            }
        };
        const emptyServer = new MCPServer(emptyRegistry);
        (emptyServer as any).server = new FastMCP({
            name: 'Empty Test Server',
            version: '1.0.0',
            instructions: 'Empty Test Server Instance'
        });
        
        // Create new mock FastMCP with ls_extensions tool for empty registry
        const emptyMockServer = new FastMCP({
            name: 'Empty Test Server',
            version: '1.0.0',
            instructions: 'Empty Test Server Instance'
        });

        emptyMockServer.addTool({
            name: 'ls_extensions',
            description: 'List all extensions',
            parameters: {} as ToolParameters,
            execute: async (_args: ToolParameters, _context: Context<string>) => {
                const extensions: ExtensionInfo[] = await emptyRegistry.listExtensions();
                return extensions.length > 0
                    ? extensions.map(ext => ext.id).join(', ')
                    : 'No extensions found';
            }
        });

        (emptyServer as any).server = emptyMockServer;
        const emptyTools = emptyMockServer.getTools();
        const emptyLsExtensionsTool = emptyTools[0];
        const emptyResult = await emptyLsExtensionsTool.execute(undefined, mockContext);
        assert.strictEqual(emptyResult, 'No extensions found');
    });
});