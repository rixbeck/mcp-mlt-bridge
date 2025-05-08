import * as vscode from 'vscode';

export interface ExtensionInfo {
    id: string;
    name: string;
    version: string;
    capabilities: string[];
    tools: ToolInfo[];
    status: ExtensionStatus;
    lastError?: string;
}

export enum ExtensionStatus {
    Active = 'active',
    Inactive = 'inactive',
    Error = 'error'
}

export class ExtensionError extends Error {
    constructor(
        message: string,
        public readonly extensionId: string,
        public readonly code: string
    ) {
        super(message);
        this.name = 'ExtensionError';
    }
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
    private readonly eventEmitter: vscode.EventEmitter<ExtensionInfo> = new vscode.EventEmitter<ExtensionInfo>();
    public readonly onExtensionChanged = this.eventEmitter.event;

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
        try {
            const contributes = extension.packageJSON.contributes;
            
            if (!contributes || !contributes.languageModelTools) {
                return;
            }

            // Verify required capabilities
            const capabilities = this.verifyCapabilities(extension);
            if (!capabilities.length) {
                throw new ExtensionError(
                    'Extension does not declare required capabilities',
                    extension.id,
                    'MISSING_CAPABILITIES'
                );
            }

            const tools = this.processTools(extension);
            if (tools.length === 0) {
                throw new ExtensionError(
                    'No valid tools found in extension',
                    extension.id,
                    'NO_TOOLS'
                );
            }

            const info: ExtensionInfo = {
                id: extension.id,
                name: extension.packageJSON.displayName || extension.packageJSON.name,
                version: extension.packageJSON.version,
                capabilities,
                tools,
                status: ExtensionStatus.Active
            };

            this.extensions.set(extension.id, info);
            this.eventEmitter.fire(info);
        } catch (error) {
            const errorInfo: ExtensionInfo = {
                id: extension.id,
                name: extension.packageJSON.displayName || extension.packageJSON.name,
                version: extension.packageJSON.version,
                capabilities: [],
                tools: [],
                status: ExtensionStatus.Error,
                lastError: error instanceof Error ? error.message : String(error)
            };
            
            this.extensions.set(extension.id, errorInfo);
            this.eventEmitter.fire(errorInfo);
            
            vscode.window.showErrorMessage(
                `Failed to process extension ${extension.id}: ${errorInfo.lastError}`
            );
        }
    }

    private verifyCapabilities(extension: vscode.Extension<any>): string[] {
        const declaredCapabilities = extension.packageJSON.capabilities || [];
        const requiredCapabilities = ['languageModelTools', 'webview'];
        
        return requiredCapabilities.filter(cap =>
            declaredCapabilities.includes(cap) ||
            (extension.packageJSON.activationEvents || []).includes(`onCapability:${cap}`)
        );
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
            // Store old state for comparison
            const oldExtensions = new Map(this.extensions);
            
            // Clear and rediscover
            this.extensions.clear();
            this.discoverExtensions();
            
            // Emit change events
            this.extensions.forEach((newInfo, id) => {
                const oldInfo = oldExtensions.get(id);
                if (!oldInfo ||
                    oldInfo.status !== newInfo.status ||
                    oldInfo.version !== newInfo.version ||
                    oldInfo.tools.length !== newInfo.tools.length) {
                    this.eventEmitter.fire(newInfo);
                }
            });

            // Emit removal events for extensions that no longer exist
            oldExtensions.forEach((oldInfo, id) => {
                if (!this.extensions.has(id)) {
                    this.eventEmitter.fire({
                        ...oldInfo,
                        status: ExtensionStatus.Inactive
                    });
                }
            });
        });
    }

    public dispose(): void {
        this.eventEmitter.dispose();
    }
}