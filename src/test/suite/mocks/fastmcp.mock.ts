import { EventEmitter } from 'events';

export type SerializableValue = any;
export type Progress = { message?: string; percent: number };

export interface Context<T> {
    log: {
        debug: (message: string, data?: SerializableValue) => void;
        info: (message: string, data?: SerializableValue) => void;
        warn: (message: string, data?: SerializableValue) => void;
        error: (message: string, data?: SerializableValue) => void;
    };
    reportProgress: (progress: Progress) => Promise<void>;
    session: {
        id: string;
        clientId: string;
        status: string;
    };
}

export interface Tool<R, P> {
    name: string;
    description: string;
    parameters: P;
    execute: (args: P, context: Context<R>) => Promise<R>;
}

export interface ToolParameters {
    [key: string]: any;
}

export class FastMCP extends EventEmitter {
    private tools: Tool<any, any>[] = [];
    private isRunning: boolean = false;

    constructor(private config: { name: string; version: string; instructions: string }) {
        super();
    }

    addTool<P extends ToolParameters>(tool: Tool<any, P>): Tool<any, P> {
        if (!tool.execute) {
            throw new Error('Tool must have execute method');
        }
        const wrappedTool = {
            ...tool,
            execute: tool.execute
        };
        this.tools.push(wrappedTool);
        return wrappedTool;
    }

    async start(config: { transportType: string; sse: { endpoint: string; port: number } }): Promise<void> {
        this.isRunning = true;
    }

    stop(): void {
        if (this.isRunning) {
            this.isRunning = false;
        }
    }

    getTools(): Tool<any, any>[] {
        return this.tools;
    }

    getTool(index: number): Tool<any, any> {
        if (index < 0 || index >= this.tools.length) {
            throw new Error(`Tool index ${index} out of bounds`);
        }
        return this.tools[index];
    }

    // Test helper methods
    simulateConnect(session: any): void {
        this.emit('connect', { session });
    }

    simulateDisconnect(session: any): void {
        this.emit('disconnect', { session });
    }

    // Status info methods
    getPort(): number {
        return 3000; // Default test port
    }

    getSessionCount(): number {
        return this.listenerCount('connect') - this.listenerCount('disconnect');
    }
}