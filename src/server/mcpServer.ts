import * as WebSocket from 'ws';
import * as vscode from 'vscode';
import { ExtensionRegistry } from '../registry/extensionRegistry';
import { CommandExecutor } from '../executor/commandExecutor';

export interface MCPRequest {
    id: string;
    method: string;
    params: any;
    jsonrpc: string;
}

interface MCPSession {
    id: string;
    socket: WebSocket;
    connectedAt: number;
    lastActivity: number;
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
    private static readonly PROTOCOL_VERSION = '2.0';
    private static readonly SESSION_TIMEOUT = 1800000; // 30 minutes

    private server: WebSocket.Server | undefined;
    private sessions: Map<string, MCPSession> = new Map();
    private readonly port: number;

    constructor(
        private readonly registry: ExtensionRegistry,
        private readonly executor: CommandExecutor,
        port: number = 3000
    ) {
        this.port = port;
        setInterval(() => this.cleanupSessions(), 60000); // Cleanup every minute
    }

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
        for (const [_, session] of this.sessions) {
            session.socket.close();
        }
        this.sessions.clear();
        this.server?.close();
    }

    private handleConnection(socket: WebSocket): void {
        const session: MCPSession = {
            id: this.generateSessionId(),
            socket,
            connectedAt: Date.now(),
            lastActivity: Date.now()
        };

        this.sessions.set(session.id, session);

        socket.on('message', async (data: WebSocket.RawData) => {
            try {
                const request = this.validateRequest(JSON.parse(data.toString()));
                session.lastActivity = Date.now();
                const response = await this.handleRequest(request, session);
                socket.send(JSON.stringify(response));
            } catch (error) {
                socket.send(JSON.stringify({
                    jsonrpc: MCPServer.PROTOCOL_VERSION,
                    id: error instanceof Error && 'requestId' in error ? (error as any).requestId : null,
                    error: {
                        code: error instanceof Error && 'code' in error ? (error as any).code : -32603,
                        message: error instanceof Error ? error.message : 'Internal error'
                    }
                }));
            }
        });

        socket.on('close', () => {
            this.sessions.delete(session.id);
        });

        socket.on('error', (error: Error) => {
            vscode.window.showErrorMessage(`WebSocket error: ${error.message}`);
            this.sessions.delete(session.id);
        });
    }

    private validateRequest(data: any): MCPRequest {
        if (!data || typeof data !== 'object') {
            throw this.createError(-32600, 'Invalid request', data?.id);
        }

        if (data.jsonrpc !== MCPServer.PROTOCOL_VERSION) {
            throw this.createError(-32600, 'Invalid JSON-RPC version', data.id);
        }

        if (typeof data.id !== 'string' && typeof data.id !== 'number') {
            throw this.createError(-32600, 'Invalid request ID', null);
        }

        if (typeof data.method !== 'string' || !data.method) {
            throw this.createError(-32600, 'Invalid method', data.id);
        }

        return data as MCPRequest;
    }

    private async handleRequest(request: MCPRequest, session: MCPSession): Promise<MCPResponse> {
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
    
        private generateSessionId(): string {
            return `session_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
        }
    
        private cleanupSessions(): void {
            const now = Date.now();
            for (const [id, session] of this.sessions) {
                if (now - session.lastActivity > MCPServer.SESSION_TIMEOUT) {
                    session.socket.close();
                    this.sessions.delete(id);
                }
            }
        }
    
        private createError(code: number, message: string, requestId: string | number | null): Error {
            const error = new Error(message);
            (error as any).code = code;
            (error as any).requestId = requestId;
            return error;
        }
    }
}