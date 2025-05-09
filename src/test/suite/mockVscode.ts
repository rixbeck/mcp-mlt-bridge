import * as vscode from 'vscode';
import { VSCodeAPI } from '../../executor/commandExecutor';

export class MockVSCode implements VSCodeAPI {
    private registeredCommands = new Map<string, (...args: any[]) => any>();
    private readonly mockExtensionPath = '/test/path';

    private mockExtensions = {
        getExtension: (id: string): vscode.Extension<any> => ({
            id,
            extensionUri: vscode.Uri.file(this.mockExtensionPath),
            extensionPath: this.mockExtensionPath,
            isActive: false,
            packageJSON: { name: id },
            exports: undefined,
            activate: async () => {
                const ext = this.mockExtensions.getExtension(id);
                (ext as any).isActive = true;
                return ext.exports;
            },
            extensionKind: vscode.ExtensionKind.Workspace
        })
    };

    public setExtensions(mock: any) {
        this.mockExtensions = mock;
    }

    public get extensions() {
        return this.mockExtensions;
    }

    public get commands() {
        return {
            registerCommand: (command: string, callback: (...args: any[]) => any) => {
                this.registeredCommands.set(command, callback);
                return { dispose: () => this.registeredCommands.delete(command) };
            },
            executeCommand: async (command: string, ...args: any[]) => {
                const handler = this.registeredCommands.get(command);
                if (!handler) {
                    throw new Error(`Command '${command}' not found`);
                }
                return handler(...args);
            },
            getCommands: async () => Array.from(this.registeredCommands.keys())
        };
    }
}

export const mockVscode = new MockVSCode();