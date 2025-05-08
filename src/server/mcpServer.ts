import * as WebSocket from 'ws';
import * as vscode from 'vscode';
import { ExtensionRegistry } from '../registry/extensionRegistry';
import { CommandExecutor } from '../executor/commandExecutor';

/**
 * Represents a JSON-RPC request in the Model Context Protocol
 * @interface MCPRequest
 */
export interface MCPRequest {
    id: string;
    method: string;
    params: any;
    jsonrpc: string;
}

/**
 * Represents an active WebSocket session with a client
 * @interface MCPSession
 * @internal
 */
interface MCPSession {
    id: string;
    socket: WebSocket;
    connectedAt: number;
    lastActivity: number;
}

/**
 * Represents a JSON-RPC response in the Model Context Protocol
 * @interface MCPResponse
 * @internal
 */
interface MCPResponse {
    id: string;
    result?: any;
    error?: {
        code: number;
        message: string;
    };
}

/**
 * Implementation of the Model Context Protocol server
 * Handles WebSocket connections, session management, and request processing
 * @class MCPServer
 */
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

    /**
     * Starts the MCP WebSocket server
     * @throws {Error} If server fails to start
     * @returns {Promise<void>}
     */
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

    /**
     * Stops the MCP server and closes all active connections
     * @returns {void}
     */
    public stop(): void {
        for (const [_, session] of this.sessions) {
            session.socket.close();
        }
        this.sessions.clear();
        this.server?.close();
    }

    /**
     * Handles new WebSocket connections
     * Sets up message, close and error handlers for the socket
     * @param {WebSocket} socket - The WebSocket connection to handle
     * @returns {void}
     * @private
     */
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

    /**
     * Validates an incoming JSON-RPC request
     * @param {any} data - The parsed JSON data to validate
     * @returns {MCPRequest} The validated request object
     * @throws {Error} If the request is invalid
     * @private
     */
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

    /**
     * Handles an MCP request and generates appropriate response
     * Supports methods: mcp.lmt.listExtensions, mcp.lmt.getToolInfo, mcp.lmt.executeTool
     * @param {MCPRequest} request - The validated request to handle
     * @param {MCPSession} session - The session that sent the request
     * @returns {Promise<MCPResponse>} The response to send back
     * @private
     */
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
    }

    /**
     * Generates a unique session ID combining timestamp and random string
     * @returns {string} The generated session ID
     * @private
     */
    private generateSessionId(): string {
        return `session_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
    }

    /**
     * Removes inactive sessions that have exceeded the timeout period
     * @returns {void}
     * @private
     */
    private cleanupSessions(): void {
        const now = Date.now();
        for (const [id, session] of this.sessions) {
            if (now - session.lastActivity > MCPServer.SESSION_TIMEOUT) {
                session.socket.close();
                this.sessions.delete(id);
            }
        }
    }

    /**
     * Creates an error object with JSON-RPC specific properties
     * @param {number} code - The JSON-RPC error code
     * @param {string} message - The error message
     * @param {string | number | null} requestId - The ID of the request that caused the error
     * @returns {Error} The created error object
     * @private
     */
    private createError(code: number, message: string, requestId: string | number | null): Error {
        const error = new Error(message);
        (error as any).code = code;
        (error as any).requestId = requestId;
        return error;
    }
}