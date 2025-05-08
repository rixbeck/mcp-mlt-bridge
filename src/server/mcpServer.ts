import * as WebSocket from 'ws';
import * as vscode from 'vscode';
import { ExtensionRegistry } from '../registry/extensionRegistry';
import { CommandExecutor } from '../executor/commandExecutor';

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
    private clients: Set<WebSocket> = new Set();
    private readonly port = 3000;

    constructor(
        private readonly registry: ExtensionRegistry,
        private readonly executor: CommandExecutor
    ) {}

    public async start(): Promise<void> {
        try {
            this.server = new WebSocket.Server({ port: this.port });
            
            this.server.on('connection', (socket: WebSocket) => {
                this.handleConnection(socket);
            });

            this.server.on('error', (error: Error) => {
                vscode.window.showErrorMessage(`MCP Server error: ${error.message}`);
            });

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to start MCP server: ${error}`);
            throw error;
        }
    }

    public stop(): void {
        this.clients.forEach(client => client.close());
        this.clients.clear();
        this.server?.close();
    }

    private handleConnection(socket: WebSocket): void {
        this.clients.add(socket);

        socket.on('message', async (data: WebSocket.RawData) => {
            try {
                const request: MCPRequest = JSON.parse(data.toString());
                const response = await this.handleRequest(request);
                socket.send(JSON.stringify(response));
            } catch (error) {
                socket.send(JSON.stringify({
                    id: 'error',
                    error: {
                        code: -32603,
                        message: `Internal error: ${error}`
                    }
                }));
            }
        });

        socket.on('close', () => {
            this.clients.delete(socket);
        });

        socket.on('error', (error: Error) => {
            vscode.window.showErrorMessage(`WebSocket error: ${error.message}`);
            this.clients.delete(socket);
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
            return {
                id: request.id,
                error: {
                    code: -32603,
                    message: `Internal error: ${error}`
                }
            };
        }
    }
}