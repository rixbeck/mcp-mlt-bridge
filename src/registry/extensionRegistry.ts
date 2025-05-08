import * as vscode from 'vscode';

export interface ExtensionInfo {
    id: string;
    name: string;
    tools: ToolInfo[];
}

export interface ToolInfo {
    id: string;
    name: string;
    description: string;
    parameters: ParameterInfo[];
}

export interface ParameterInfo {
    name: string;
    type: string;
    description: string;
    required: boolean;
}

export class ExtensionRegistry {
    private extensions: Map<string, ExtensionInfo> = new Map();

    constructor() {
        this.discoverExtensions();
        this.setupExtensionWatcher();
    }

    public async listExtensions(): Promise<ExtensionInfo[]> {
        return Array.from(this.extensions.values());
    }

    public async getExtension(extensionId: string): Promise<ExtensionInfo | undefined> {
        return this.extensions.get(extensionId);
    }

    private discoverExtensions(): void {
        const extensions = vscode.extensions.all;
        
        for (const extension of extensions) {
            this.processExtension(extension);
        }
    }

    private processExtension(extension: vscode.Extension<any>): void {
        const contributes = extension.packageJSON.contributes;
        
        if (!contributes || !contributes.languageModelTools) {
            return;
        }

        const tools = this.processTools(extension);
        
        if (tools.length > 0) {
            this.extensions.set(extension.id, {
                id: extension.id,
                name: extension.packageJSON.displayName || extension.packageJSON.name,
                tools
            });
        }
    }

    private processTools(extension: vscode.Extension<any>): ToolInfo[] {
        const tools: ToolInfo[] = [];
        const languageModelTools = extension.packageJSON.contributes.languageModelTools;

        if (!Array.isArray(languageModelTools)) {
            return tools;
        }

        for (const tool of languageModelTools) {
            if (this.isValidToolDefinition(tool)) {
                tools.push({
                    id: `${extension.id}.${tool.id}`,
                    name: tool.name,
                    description: tool.description,
                    parameters: this.processParameters(tool.parameters || [])
                });
            }
        }

        return tools;
    }

    private processParameters(parameters: any[]): ParameterInfo[] {
        return parameters.map(param => ({
            name: param.name,
            type: param.type,
            description: param.description || '',
            required: param.required || false
        }));
    }

    private isValidToolDefinition(tool: any): boolean {
        return (
            typeof tool === 'object' &&
            typeof tool.id === 'string' &&
            typeof tool.name === 'string' &&
            typeof tool.description === 'string'
        );
    }

    private setupExtensionWatcher(): void {
        vscode.extensions.onDidChange(() => {
            this.extensions.clear();
            this.discoverExtensions();
        });
    }
}