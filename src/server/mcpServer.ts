import * as WebSocket from 'ws';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { ExtensionRegistry } from '../registry/extensionRegistry';
import { CommandExecutor } from '../executor/commandExecutor';
import { ServerState } from '../status/mcpStatusManager';

/**
 * Extends WebSocket with health check property
 * @interface MCPWebSocket
 * @internal
 */
interface MCPWebSocket extends WebSocket {
    isAlive: boolean;
}

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
    socket: MCPWebSocket;
    connectedAt: number;
    lastActivity: number;
}

/**
 * Represents a JSON-RPC response in the Model Context Protocol
 * @interface MCPResponse
 * @internal
 */
interface MCPResponse {
    jsonrpc: string;
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
export class MCPServer extends EventEmitter {
    private static readonly PROTOCOL_VERSION = '2.0';
    private static readonly SESSION_TIMEOUT = 1800000; // 30 minutes
    private static readonly RETRY_DELAY = 1000; // 1 second
    private static readonly CONNECTION_TIMEOUT = 30000; // 30 seconds

    private server: WebSocket.Server | undefined;
    private sessions: Map<string, MCPSession> = new Map();
    private readonly basePort: number;
    private readonly maxPortRetries = 10;
    private currentPort?: number;

    /**
     * Gets the current port number the server is running on
     * @returns {number | undefined} The current port number, or undefined if server is not running
     */
    public getPort(): number | undefined {
        return this.currentPort;
    }

    /**
     * Gets the number of active sessions
     * @returns {number} Number of active sessions
     */
    public getSessionCount(): number {
        return this.sessions.size;
    }

    /**
     * Gets information about active sessions
     * @returns {Array<string>} Array of session IDs with their connection times
     */
    public getSessionInfo(): string[] {
        return Array.from(this.sessions.entries()).map(([id, session]) => {
            const duration = Math.floor((Date.now() - session.connectedAt) / 1000);
            return `Session ${id} (connected ${duration}s ago)`;
        });
    }

    constructor(
        private readonly registry: ExtensionRegistry,
        private readonly executor: CommandExecutor,
        port: number = 3000
    ) {
        super();
        this.basePort = port;
        setInterval(() => this.cleanupSessions(), 60000); // Cleanup every minute
    }

    /**
     * Finds an available port starting from basePort
     * @param {number} startPort - Port to start searching from
     * @returns {Promise<number>} First available port
     * @private
     */
    private async findAvailablePort(startPort: number): Promise<number> {
        for (let port = startPort; port < startPort + this.maxPortRetries; port++) {
            try {
                const server = new WebSocket.Server({ port });
                server.close();
                return port;
            } catch (error) {
                continue;
            }
        }
        throw new Error(`No available ports found between ${startPort} and ${startPort + this.maxPortRetries - 1}`);
    }

    /**
     * Starts the MCP WebSocket server with retry logic
     * @throws {Error} If server fails to start after retries
     * @returns {Promise<void>}
     */
    public async start(port?: number): Promise<void> {
        let lastError: Error | undefined;
        this.emit('stateChanged', ServerState.PROCESSING);
        
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const serverPort = port || await this.findAvailablePort(this.basePort);
                this.server = new WebSocket.Server({ port: serverPort });
                this.currentPort = serverPort;

                // Set up server event handlers
                this.server.on('connection', (socket: WebSocket) => {
                    this.handleConnection(socket);
                });

                this.server.on('error', (error: Error) => {
                    console.error(`MCP Server error:`, error);
                    vscode.window.showErrorMessage(`MCP Server error: ${error.message}`);
                });

                this.server.on('listening', () => {
                    console.log(`MCP Server listening on port ${serverPort}`);
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

                // Start health check monitoring
                this.startHealthCheck();
                this.emit('stateChanged', ServerState.STARTED);
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

    /**
     * Stops the MCP server and closes all active connections
     * @returns {Promise<void>}
     */
    public async stop(): Promise<void> {
        this.emit('stateChanged', ServerState.PROCESSING);
        for (const [_, session] of this.sessions) {
            session.socket.close();
        }
        this.sessions.clear();

        if (this.server) {
            await new Promise<void>((resolve) => {
                this.server!.close(() => resolve());
            });
            this.currentPort = undefined;
            this.emit('stateChanged', ServerState.STOPPED);
        }
    }

    /**
     * Handles new WebSocket connections
     * Sets up message, close and error handlers for the socket
     * @param {WebSocket} socket - The WebSocket connection to handle
     * @returns {void}
     * @private
     */
    private handleConnection(socket: WebSocket): void {
        const mcpSocket = socket as MCPWebSocket;
        mcpSocket.isAlive = true;

        // Set connection timeout
        const connectionTimeoutId = setTimeout(() => {
            mcpSocket.close(1000, 'Connection timeout');
        }, MCPServer.CONNECTION_TIMEOUT);

        const session: MCPSession = {
            id: this.generateSessionId(),
            socket: mcpSocket,
            connectedAt: Date.now(),
            lastActivity: Date.now()
        };

        this.sessions.set(session.id, session);

        mcpSocket.on('message', async (data: WebSocket.RawData) => {
            try {
                this.emit('requestStart');
                const request = this.validateRequest(JSON.parse(data.toString()));
                session.lastActivity = Date.now();
                const response = await this.handleRequest(request, session);
                
                if (mcpSocket.readyState === WebSocket.OPEN) {
                    mcpSocket.send(JSON.stringify(response));
                }
                this.emit('requestEnd');
            } catch (error) {
                if (mcpSocket.readyState === WebSocket.OPEN) {
                    let errorResponse: MCPResponse = {
                        jsonrpc: MCPServer.PROTOCOL_VERSION,
                        id: error instanceof Error && 'requestId' in error ? (error as any).requestId : null,
                        error: {
                            code: error instanceof Error && 'code' in error ? (error as any).code : -32603,
                            message: error instanceof Error ? error.message : 'Internal error'
                        }
                    };
                    mcpSocket.send(JSON.stringify(errorResponse));
                }
            }
        });

        mcpSocket.on('close', () => {
            clearTimeout(connectionTimeoutId);
            this.sessions.delete(session.id);
        });

        mcpSocket.on('error', (error: Error) => {
            console.error(`WebSocket error:`, error);
            vscode.window.showErrorMessage(`WebSocket error: ${error.message}`);
            clearTimeout(connectionTimeoutId);
            this.sessions.delete(session.id);
            mcpSocket.close(1011, error.message);
        });

        mcpSocket.on('pong', () => {
            mcpSocket.isAlive = true;
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

        if (typeof data.method !== 'string') {
            throw this.createError(-32600, 'Invalid method', data.id);
        }

        if (!data.method) {
            throw this.createError(-32601, 'Method not found', data.id);
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
            const baseResponse = {
                jsonrpc: MCPServer.PROTOCOL_VERSION,
                id: request.id
            };
            
            switch (request.method) {
                case 'mcp.lmt.listExtensions':
                    result = await this.registry.listExtensions();
                    return { ...baseResponse, result: result || [] };
                    
                case 'mcp.lmt.getToolInfo':
                    if (!request.params?.extensionId) {
                        return {
                            ...baseResponse,
                            error: {
                                code: -32602,
                                message: 'Missing required parameter: extensionId'
                            }
                        };
                    }
                    const extension = await this.registry.getExtension(request.params.extensionId);
                    return {
                        ...baseResponse,
                        result: extension || null
                    };
                    
                case 'mcp.lmt.executeTool':
                    if (!request.params?.toolId) {
                        return {
                            ...baseResponse,
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
                    return { ...baseResponse, result };
                    
                default:
                    return {
                        ...baseResponse,
                        error: {
                            code: -32601,
                            message: `Method not found: ${request.method}`
                        }
                    };
            }
        } catch (error) {
            console.error(`Request handling error:`, error);
            return {
                jsonrpc: MCPServer.PROTOCOL_VERSION,
                id: request.id,
                error: {
                    code: -32603,
                    message: error instanceof Error ? error.message : 'Internal error'
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

    /**
     * Starts the health check monitoring for WebSocket connections
     * @returns {void}
     * @private
     */
    private startHealthCheck(): void {
        const interval = setInterval(() => {
            for (const [id, session] of this.sessions) {
                if (!session.socket.isAlive) {
                    session.socket.terminate();
                    this.sessions.delete(id);
                    continue;
                }
                
                session.socket.isAlive = false;
                session.socket.ping();
            }
        }, 30000);

        this.server?.on('close', () => {
            clearInterval(interval);
        });
    }
}