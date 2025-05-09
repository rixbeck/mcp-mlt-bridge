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
    
    private static readonly MAX_RETRIES = 3;
    private static readonly RETRY_DELAY = 1000;
    private static readonly DISCOVERY_TIMEOUT = 5000;

    constructor() {
        this.discoverExtensions().catch(error => {
            console.error('Failed to discover extensions:', error);
        });
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

    /**
     * Discovers and processes all VS Code extensions that provide language model tools
     * Includes timeout handling and retry logic
     * @private
     */
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

    /**
     * Processes a single extension with retry logic
     * @param {vscode.Extension<any>} extension - The extension to process
     * @private
     */
    private async processExtensionWithRetry(extension: vscode.Extension<any>): Promise<void> {
        for (let attempt = 1; attempt <= ExtensionRegistry.MAX_RETRIES; attempt++) {
            try {
                await this.processExtension(extension);
                return;
            } catch (error) {
                if (attempt === ExtensionRegistry.MAX_RETRIES) {
                    console.error(`Failed to process extension ${extension.id}:`, error);
                    this.handleExtensionError(extension, error);
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, ExtensionRegistry.RETRY_DELAY));
            }
        }
    }

    /**
     * Processes a single VS Code extension to extract and validate its language model tools
     * @param {vscode.Extension<any>} extension - The extension to process
     * @throws {ExtensionError} If extension validation fails
     * @private
     */
    private async processExtension(extension: vscode.Extension<any>): Promise<void> {
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
    }

    /**
     * Handles errors during extension processing
     * @param {vscode.Extension<any>} extension - The extension that encountered an error
     * @param {any} error - The error that occurred
     * @private
     */
    private handleExtensionError(extension: vscode.Extension<any>, error: any): void {
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
            this.discoverExtensions().catch(error => {
                console.error('Failed to rediscover extensions:', error);
            });

            // Emit change events for new or modified extensions
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