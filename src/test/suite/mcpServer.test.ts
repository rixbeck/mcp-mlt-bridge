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
    const TEST_PORT = 3000;

    setup(async () => {
        // Create mock registry and executor
        mockRegistry = new ExtensionRegistry();
        mockExecutor = new CommandExecutor(mockRegistry);

        // Initialize server
        server = new MCPServer(mockRegistry, mockExecutor);
        await server.start();

        // Create client connection
        return new Promise<void>((resolve) => {
            client = new WebSocket(`ws://localhost:${TEST_PORT}`);
            client.on('open', () => resolve());
        });
    });

    teardown(async () => {
        // Clean up connections
        if (client && client.readyState === WebSocket.OPEN) {
            client.close();
        }
        if (server) {
            server.stop();
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
            assert.ok(response.error.message.includes('Internal error'));
            done();
        });
    });

    test('Server should handle unknown methods', (done) => {
        const request = {
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
                id: `multi${i}`,
                method: 'mcp.lmt.listExtensions',
                params: {}
            };
            client.send(JSON.stringify(request));
        }
    });
});