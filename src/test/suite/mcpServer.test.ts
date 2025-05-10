import * as assert from 'assert';
import WebSocket = require('ws');
import { MCPServer } from '../../server/mcpServer';
import { ExtensionRegistry } from '../../registry/extensionRegistry';
import { CommandExecutor } from '../../executor/commandExecutor';

suite('MCPServer Test Suite', () => {
    let server: MCPServer;
    let mockRegistry: ExtensionRegistry;
    let mockExecutor: CommandExecutor;
    let client: WebSocket;
    let testPort: number;

    const findAvailablePort = async (): Promise<number> => {
        const server = require('net').createServer();
        return new Promise((resolve, reject) => {
            server.listen(0, () => {
                const port = server.address().port;
                server.close(() => resolve(port));
            });
            server.on('error', reject);
        });
    };

    setup(async () => {
        // Get available port
        testPort = await findAvailablePort();
        // Create mock registry and executor
        mockRegistry = new ExtensionRegistry();
        mockExecutor = new CommandExecutor(mockRegistry);

        // Initialize server
        server = new MCPServer(mockRegistry, mockExecutor);
        await server.start(testPort);

        // Create client connection
        return new Promise<void>((resolve) => {
            client = new WebSocket(`ws://localhost:${testPort}`);
            client.on('open', () => resolve());
        });
    });

    teardown(async () => {
        // Clean up connections
        if (client && client.readyState === WebSocket.OPEN) {
            client.close();
        }
        if (server) {
            await server.stop();
        }

        // Wait for connections to close
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
    });

    test('Server should accept WebSocket connections', () => {
        assert.strictEqual(client.readyState, WebSocket.OPEN);
    });

    test('Server should handle invalid JSON messages', (done) => {
        client.send('invalid json');

        client.on('message', (data: WebSocket.RawData) => {
            const response = JSON.parse(data.toString());
            assert.strictEqual(response.error.code, -32603);
            assert.ok(response.error.message.includes('Unexpected token'));
            done();
        });
    });

    test('Server should handle unknown methods', (done) => {
        const request = {
            jsonrpc: '2.0',
            id: '1',
            method: 'unknown.method',
            params: {}
        };

        client.send(JSON.stringify(request));

        client.on('message', (data: WebSocket.RawData) => {
            const response = JSON.parse(data.toString());
            assert.strictEqual(response.id, '1');
            assert.strictEqual(response.error.code, -32601);
            assert.ok(response.error.message.includes('Method not found'));
            done();
        });
    });

    test('Server should handle listExtensions command', (done) => {
        const request = {
            jsonrpc: '2.0',
            id: '2',
            method: 'mcp.lmt.listExtensions',
            params: {}
        };

        client.send(JSON.stringify(request));

        client.on('message', (data: WebSocket.RawData) => {
            const response = JSON.parse(data.toString());
            assert.strictEqual(response.id, '2');
            assert.ok(Array.isArray(response.result));
            done();
        });
    });

    test('Server should handle getToolInfo command', (done) => {
        const request = {
            jsonrpc: '2.0',
            id: '3',
            method: 'mcp.lmt.getToolInfo',
            params: {
                extensionId: 'test.extension'
            }
        };

        client.send(JSON.stringify(request));

        client.on('message', (data: WebSocket.RawData) => {
            const response = JSON.parse(data.toString());
            assert.strictEqual(response.id, '3');
            // Result might be undefined for non-existent extension
            assert.ok('result' in response);
            done();
        });
    });

    test('Server should handle executeTool command', (done) => {
        const request = {
            jsonrpc: '2.0',
            id: '4',
            method: 'mcp.lmt.executeTool',
            params: {
                toolId: 'test.extension.tool',
                parameters: {}
            }
        };

        client.send(JSON.stringify(request));

        client.on('message', (data: WebSocket.RawData) => {
            const response = JSON.parse(data.toString());
            assert.strictEqual(response.id, '4');
            // Execution result should contain success property
            assert.ok('result' in response);
            done();
        });
    });

    test('Server should handle multiple concurrent requests', (done) => {
        let responses = 0;
        const totalRequests = 3;

        client.on('message', () => {
            responses++;
            if (responses === totalRequests) {
                done();
            }
        });

        // Send multiple requests
        for (let i = 0; i < totalRequests; i++) {
            const request = {
                jsonrpc: '2.0',
                id: `multi${i}`,
                method: 'mcp.lmt.listExtensions',
                params: {}
            };
            client.send(JSON.stringify(request));
        }
    });

    test('Server should track port number correctly', async () => {
        assert.strictEqual(server.getPort(), testPort);
        await server.stop();
        assert.strictEqual(server.getPort(), undefined);
    });

    test('Server should manage session count correctly', async () => {
        assert.strictEqual(server.getSessionCount(), 1); // One client from setup
        
        // Add another client
        const client2 = new WebSocket(`ws://localhost:${testPort}`);
        await new Promise<void>(resolve => client2.on('open', resolve));
        
        assert.strictEqual(server.getSessionCount(), 2);
        
        // Close second client
        client2.close();
        await new Promise<void>(resolve => setTimeout(resolve, 100));
        
        assert.strictEqual(server.getSessionCount(), 1);
    });

    test('Server should provide session information', async () => {
        const info = server.getSessionInfo();
        assert.strictEqual(info.length, 1); // One client from setup
        assert.match(info[0], /Session .+ \(connected \d+s ago\)/);
    });

    test('Server should emit state change events', async () => {
        const states: string[] = [];
        server.on('stateChanged', state => states.push(state));

        await server.stop();
        await server.start(testPort);

        assert.deepStrictEqual(states, ['processing', 'stopped', 'processing', 'started']);
    });

    test('Server should emit request events', (done) => {
        const events: string[] = [];
        server.on('requestStart', () => events.push('start'));
        server.on('requestEnd', () => {
            events.push('end');
            assert.deepStrictEqual(events, ['start', 'end']);
            done();
        });

        const request = {
            jsonrpc: '2.0',
            id: 'test',
            method: 'mcp.lmt.listExtensions',
            params: {}
        };
        client.send(JSON.stringify(request));
    });
});