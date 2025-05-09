import * as WebSocket from 'ws';
import * as vscode from 'vscode';
import { ExtensionRegistry } from '../registry/extensionRegistry';
import { CommandExecutor } from '../executor/commandExecutor';

interface MCPWebSocket extends WebSocket {
    isAlive: boolean;
}

interface MCPRequest {
    id: string;
    method: string;
    params: any;
}

interface MCPResponse {
    id: string;
    result?: any;
    error?: {
        code: number;
        message: string;
    };
}

export class MCPServer {
    private server: WebSocket.Server | undefined;
    private clients: Set<MCPWebSocket> = new Set();
    private readonly basePort = 3000;
    private readonly maxPortRetries = 10;
    private readonly connectionTimeout = 30000; // 30 seconds
    private static readonly RETRY_DELAY = 1000;

    constructor(
        private readonly registry: ExtensionRegistry,
        private readonly executor: CommandExecutor
    ) {}

    private async findAvailablePort(startPort: number): Promise<number> {
        for (let port = startPort; port < startPort + this.maxPortRetries; port++) {
            try {
                const server = new WebSocket.Server({ port });
                server.close();
                return port;
            } catch (error) {
                // Port is in use, try next one
                continue;
            }
        }
        throw new Error(`No available ports found between ${startPort} and ${startPort + this.maxPortRetries - 1}`);
    }

    public async start(port?: number): Promise<void> {
        let lastError: Error | undefined;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const serverPort = port || await this.findAvailablePort(this.basePort);
                this.server = new WebSocket.Server({ port });

                // Set up server event handlers
                this.server.on('connection', (socket: WebSocket) => {
                    this.handleConnection(socket);
                });

                this.server.on('error', (error: Error) => {
                    console.error(`MCP Server error:`, error);
                    vscode.window.showErrorMessage(`MCP Server error: ${error.message}`);
                });

                this.server.on('listening', () => {
                    console.log(`MCP Server listening on port ${port}`);
                });

                // Wait for server to start listening
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Server startup timeout'));
                    }, 5000);

                    this.server!.once('listening', () => {
                        clearTimeout(timeout);
                        resolve();
                    });

                    this.server!.once('error', (error) => {
                        clearTimeout(timeout);
                        reject(error);
                    });
                });

                return;

            } catch (error) {
                lastError = error as Error;
                if (attempt < 3) {
                    await new Promise(resolve => setTimeout(resolve, MCPServer.RETRY_DELAY));
                    continue;
                }
            }
        }

        const errorMessage = lastError ? `Failed to start MCP server: ${lastError.message}` : 'Failed to start MCP server';
        vscode.window.showErrorMessage(errorMessage);
        throw lastError || new Error(errorMessage);
    }

    public async stop(): Promise<void> {
        this.clients.forEach(client => client.close());
        this.clients.clear();
        if (this.server) {
            await new Promise<void>((resolve) => {
                this.server!.close(() => resolve());
            });
        }
    }

    private handleConnection(socket: WebSocket): void {
        const mcpSocket = socket as MCPWebSocket;
        // Set connection timeout
        const connectionTimeoutId = setTimeout(() => {
            mcpSocket.close(1000, 'Connection timeout');
        }, this.connectionTimeout);

        mcpSocket.isAlive = true;
        this.clients.add(mcpSocket);

        mcpSocket.on('message', async (data: WebSocket.RawData) => {
            try {
                const request: MCPRequest = JSON.parse(data.toString());
                const response = await this.handleRequest(request);
                
                if (mcpSocket.readyState === WebSocket.OPEN) {
                    mcpSocket.send(JSON.stringify(response));
                }
            } catch (error) {
                if (mcpSocket.readyState === WebSocket.OPEN) {
                    mcpSocket.send(JSON.stringify({
                        id: 'error',
                        error: {
                            code: -32603,
                            message: error instanceof Error ? error.message : 'Internal error'
                        }
                    }));
                }
            }
        });

        mcpSocket.on('close', () => {
            clearTimeout(connectionTimeoutId);
            this.clients.delete(mcpSocket);
        });

        mcpSocket.on('error', (error: Error) => {
            console.error(`WebSocket error:`, error);
            vscode.window.showErrorMessage(`WebSocket error: ${error.message}`);
            clearTimeout(connectionTimeoutId);
            this.clients.delete(mcpSocket);
            mcpSocket.close(1011, error.message);
        });

        // Initialize connection health monitoring
        mcpSocket.on('pong', () => {
            mcpSocket.isAlive = true;
        });
    }

    private async handleRequest(request: MCPRequest): Promise<MCPResponse> {
        try {
            let result;
            
            switch (request.method) {
                case 'mcp.lmt.listExtensions':
                    result = await this.registry.listExtensions();
                    return { id: request.id, result };
                    
                case 'mcp.lmt.getToolInfo':
                    if (!request.params?.extensionId) {
                        return {
                            id: request.id,
                            error: {
                                code: -32602,
                                message: 'Missing required parameter: extensionId'
                            }
                        };
                    }
                    const extension = await this.registry.getExtension(request.params.extensionId);
                    return {
                        id: request.id,
                        result: extension || null
                    };
                    
                case 'mcp.lmt.executeTool':
                    if (!request.params?.toolId) {
                        return {
                            id: request.id,
                            error: {
                                code: -32602,
                                message: 'Missing required parameter: toolId'
                            }
                        };
                    }
                    result = await this.executor.executeCommand(
                        request.params.toolId,
                        request.params.parameters || {}
                    );
                    return { id: request.id, result };
                    
                default:
                    return {
                        id: request.id,
                        error: {
                            code: -32601,
                            message: `Method not found: ${request.method}`
                        }
                    };
            }
        } catch (error) {
            console.error(`Request handling error:`, error);
            return {
                id: request.id,
                error: {
                    code: -32603,
                    message: error instanceof Error ? error.message : 'Internal error'
                }
            };
        }
    }

    // Health check interval
    private startHealthCheck(): void {
        const interval = setInterval(() => {
            this.clients.forEach((socket) => {
                if (socket.isAlive === false) {
                    socket.terminate();
                    return;
                }
                
                socket.isAlive = false;
                socket.ping();
            });
        }, 30000);

        this.server?.on('close', () => {
            clearInterval(interval);
        });
    }
}