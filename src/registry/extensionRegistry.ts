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
    private static readonly MAX_RETRIES = 3;
    private static readonly RETRY_DELAY = 1000;
    private static readonly DISCOVERY_TIMEOUT = 5000;

    constructor() {
        this.discoverExtensions().catch(error => {
            console.error('Failed to discover extensions:', error);
        });
        this.setupExtensionWatcher();
    }

    public async listExtensions(): Promise<ExtensionInfo[]> {
        return Array.from(this.extensions.values());
    }

    public async getExtension(extensionId: string): Promise<ExtensionInfo | undefined> {
        for (let attempt = 1; attempt <= ExtensionRegistry.MAX_RETRIES; attempt++) {
            const extension = this.extensions.get(extensionId);
            if (extension) {
                return extension;
            }

            // If not found, try to rediscover extensions
            await this.discoverExtensions();
            
            // If this isn't the last attempt, wait before retrying
            if (attempt < ExtensionRegistry.MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, ExtensionRegistry.RETRY_DELAY));
            }
        }
        
        return undefined;
    }

    private async discoverExtensions(): Promise<void> {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Extension discovery timeout')),
                ExtensionRegistry.DISCOVERY_TIMEOUT);
        });

        const discoveryPromise = (async () => {
            const extensions = vscode.extensions.all;
            
            for (const extension of extensions) {
                await this.processExtensionWithRetry(extension);
            }
        })();

        try {
            await Promise.race([discoveryPromise, timeoutPromise]);
        } catch (error) {
            if (error instanceof Error && error.message === 'Extension discovery timeout') {
                console.warn('Extension discovery timed out, some extensions may not be available');
            } else {
                throw error;
            }
        }
    }

    private async processExtensionWithRetry(extension: vscode.Extension<any>): Promise<void> {
        for (let attempt = 1; attempt <= ExtensionRegistry.MAX_RETRIES; attempt++) {
            try {
                await this.processExtension(extension);
                return;
            } catch (error) {
                if (attempt === ExtensionRegistry.MAX_RETRIES) {
                    console.error(`Failed to process extension ${extension.id}:`, error);
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, ExtensionRegistry.RETRY_DELAY));
            }
        }
    }

    private async processExtension(extension: vscode.Extension<any>): Promise<void> {
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
            this.discoverExtensions().catch(error => {
                console.error('Failed to rediscover extensions:', error);
            });
        });
    }
}