import * as vscode from 'vscode';

/**
 * Represents information about a VS Code extension that provides language model tools
 * @interface ExtensionInfo
 */
export interface ExtensionInfo {
    id: string;
    name: string;
    version: string;
    capabilities: string[];
    tools: ToolInfo[];
    status: ExtensionStatus;
    lastError?: string;
}

/**
 * Possible states of a language model tool extension
 * @enum {string}
 */
export enum ExtensionStatus {
    Active = 'active',
    Inactive = 'inactive',
    Error = 'error'
}

/**
 * Custom error class for extension-related errors
 * @class ExtensionError
 * @extends {Error}
 */
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

/**
 * Represents a language model tool provided by an extension
 * @interface ToolInfo
 */
export interface ToolInfo {
    id: string;
    name: string;
    description: string;
    parameters: ParameterInfo[];
}

/**
 * Describes a parameter for a language model tool
 * @interface ParameterInfo
 */
export interface ParameterInfo {
    name: string;
    type: string;
    description: string;
    required: boolean;
}

/**
 * Registry for managing VS Code extensions that provide language model tools
 * Handles extension discovery, validation, and change tracking
 * @class ExtensionRegistry
 */
export class ExtensionRegistry {
    private extensions: Map<string, ExtensionInfo> = new Map();
    private readonly eventEmitter: vscode.EventEmitter<ExtensionInfo> = new vscode.EventEmitter<ExtensionInfo>();
    public readonly onExtensionChanged = this.eventEmitter.event;

    constructor() {
        this.discoverExtensions();
        this.setupExtensionWatcher();
    }

    /**
     * Retrieves information about all registered language model tool extensions
     * @returns {Promise<ExtensionInfo[]>} Array of extension information
     */
    public async listExtensions(): Promise<ExtensionInfo[]> {
        return Array.from(this.extensions.values());
    }

    /**
     * Retrieves information about a specific extension
     * @param {string} extensionId - The ID of the extension to retrieve
     * @returns {Promise<ExtensionInfo | undefined>} Extension information if found
     */
    public async getExtension(extensionId: string): Promise<ExtensionInfo | undefined> {
        return this.extensions.get(extensionId);
    }

    /**
     * Discovers and processes all VS Code extensions that provide language model tools
     * @private
     */
    private discoverExtensions(): void {
        const extensions = vscode.extensions.all;
        
        for (const extension of extensions) {
            this.processExtension(extension);
        }
    }

    /**
     * Processes a single VS Code extension to extract and validate its language model tools
     * @param {vscode.Extension<any>} extension - The extension to process
     * @throws {ExtensionError} If extension validation fails
     * @private
     */
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

    /**
     * Verifies that an extension has the required capabilities
     * @param {vscode.Extension<any>} extension - The extension to verify
     * @returns {string[]} Array of verified capabilities
     * @private
     */
    private verifyCapabilities(extension: vscode.Extension<any>): string[] {
        const declaredCapabilities = extension.packageJSON.capabilities || [];
        const requiredCapabilities = ['languageModelTools', 'webview'];
        
        return requiredCapabilities.filter(cap =>
            declaredCapabilities.includes(cap) ||
            (extension.packageJSON.activationEvents || []).includes(`onCapability:${cap}`)
        );
    }

    /**
     * Extracts and validates language model tools from an extension
     * @param {vscode.Extension<any>} extension - The extension containing tools
     * @returns {ToolInfo[]} Array of validated tool information
     * @private
     */
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

    /**
     * Processes and validates tool parameters
     * @param {any[]} parameters - Raw parameter definitions from extension
     * @returns {ParameterInfo[]} Array of validated parameter information
     * @private
     */
    private processParameters(parameters: any[]): ParameterInfo[] {
        return parameters.map(param => ({
            name: param.name,
            type: param.type,
            description: param.description || '',
            required: param.required || false
        }));
    }

    /**
     * Validates a tool definition from an extension
     * @param {any} tool - The tool definition to validate
     * @returns {boolean} True if the tool definition is valid
     * @private
     */
    private isValidToolDefinition(tool: any): boolean {
        return (
            typeof tool === 'object' &&
            typeof tool.id === 'string' &&
            typeof tool.name === 'string' &&
            typeof tool.description === 'string'
        );
    }

    /**
     * Sets up a watcher for extension changes
     * Handles extension installation, uninstallation, and updates
     * @private
     */
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

    /**
     * Cleans up resources used by the registry
     * @returns {void}
     */
    public dispose(): void {
        this.eventEmitter.dispose();
    }
}