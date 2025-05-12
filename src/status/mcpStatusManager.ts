import * as vscode from 'vscode';
import { MCPServer } from '../server/sseServer';
import { EventEmitter } from 'events';

/**
 * Represents the possible states of the MCP server
 */
export enum ServerState {
    STARTED = 'started',
    STOPPED = 'stopped',
    PROCESSING = 'processing'
}

/**
 * Interface for status display configuration
 */
interface StatusDisplay {
    text: string;
    color?: string | vscode.ThemeColor;
    command?: string;
}

/**
 * Manages the VSCode status bar item for the MCP server
 */
export class MCPStatusManager implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private currentState: ServerState;
    private readonly stateDisplayConfig: Record<ServerState, StatusDisplay> = {
        [ServerState.STARTED]: {
            text: "$(rocket) MCP Server: Running",
            command: 'mcp-lmt-bridge.showServerInfo'
        },
        [ServerState.STOPPED]: {
            text: "$(stop) MCP Server: Stopped",
            color: new vscode.ThemeColor('statusBar.errorForeground'),
            command: 'mcp-lmt-bridge.startServer'
        },
        [ServerState.PROCESSING]: {
            text: "$(sync~spin) MCP Server: Processing",
            command: 'mcp-lmt-bridge.showActiveRequests'
        }
    };

    constructor(server: MCPServer & EventEmitter) {
        this.currentState = ServerState.STOPPED;
        this.statusBarItem = this.createStatusBarItem();
        this.listenToServerEvents(server);
        this.updateStatus(this.currentState);
    }

    /**
     * Creates and configures the status bar item
     */
    private createStatusBarItem(): vscode.StatusBarItem {
        const item = vscode.window.createStatusBarItem(
            'mcp-server-status',
            vscode.StatusBarAlignment.Right,
            100
        );
        item.show();
        return item;
    }

    /**
     * Sets up event listeners for server state changes
     */
    private listenToServerEvents(server: MCPServer & EventEmitter): void {
        server.on('stateChanged', (newState: ServerState) => {
            this.updateStatus(newState);
        });

        server.on('error', () => {
            this.updateStatus(ServerState.STOPPED);
        });

        // Update status when request processing starts/ends
        server.on('requestStart', () => {
            this.updateStatus(ServerState.PROCESSING);
        });

        server.on('requestEnd', () => {
            this.updateStatus(ServerState.STARTED);
        });
    }

    /**
     * Updates the status bar item based on the current state
     */
    private updateStatus(state: ServerState): void {
        this.currentState = state;
        const display = this.stateDisplayConfig[state];
        
        this.statusBarItem.text = display.text;
        this.statusBarItem.color = display.color;
        this.statusBarItem.command = display.command;
        this.statusBarItem.tooltip = `MCP Server is ${state}`;
    }

    /**
     * Disposes of the status bar item
     */
    public dispose(): void {
        this.statusBarItem.dispose();
    }
}