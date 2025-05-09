import * as vscode from 'vscode';
import { ExtensionRegistry } from '../registry/extensionRegistry';

interface ExecutionResult {
    success: boolean;
    result?: any;
    error?: string;
}

interface ToolParameter {
    name: string;
    type: string;
    description: string;
    required: boolean;
}

interface Tool {
    id: string;
    name: string;
    description: string;
    parameters: ToolParameter[];
}

interface LanguageModelToolsAPI {
    executeTool(toolId: string, params: any): Promise<any>;
}

// Define minimal interface for VSCode API we need
export interface VSCodeAPI {
    extensions: {
        getExtension(extensionId: string): vscode.Extension<any> | undefined;
    };
}

export class CommandExecutor {
    private static readonly ACTIVATION_TIMEOUT = 10000; // 10 seconds
    private static readonly MAX_RETRIES = 3;
    private static readonly RETRY_DELAY = 1000; // 1 second

    constructor(
        private readonly registry: ExtensionRegistry,
        private readonly vscodeApi: VSCodeAPI = vscode
    ) {}

    private async validateExtension(extensionId: string): Promise<vscode.Extension<any>> {
        let lastError: Error | undefined;
        
        for (let attempt = 1; attempt <= CommandExecutor.MAX_RETRIES; attempt++) {
            try {
                const extension = this.vscodeApi.extensions.getExtension(extensionId);
                if (!extension) {
                    throw new Error(`Extension not found: ${extensionId}`);
                }

                if (!extension.isActive) {
                    const activationPromise = extension.activate();
                    const timeoutPromise = new Promise<never>((_, reject) => {
                        setTimeout(() => reject(new Error('Activation timeout')),
                            CommandExecutor.ACTIVATION_TIMEOUT);
                    });

                    await Promise.race([activationPromise, timeoutPromise]);
                }

                if (!extension.exports || typeof extension.exports.executeTool !== 'function') {
                    throw new Error(`Extension ${extensionId} does not implement LanguageModelTools API`);
                }

                return extension;
            } catch (error) {
                lastError = error as Error;
                if (attempt === CommandExecutor.MAX_RETRIES) break;
                await new Promise(resolve => setTimeout(resolve, CommandExecutor.RETRY_DELAY));
            }
        }
        
        throw lastError || new Error(`Failed to validate extension: ${extensionId}`);
    }

    public async executeCommand(toolId: string, parameters: any): Promise<ExecutionResult> {
        try {
            // Extract extension and tool IDs
            const [extensionId, localToolId] = this.parseToolId(toolId);
            
            // Get extension info
            const extensionInfo = await this.registry.getExtension(extensionId);
            if (!extensionInfo) {
                return {
                    success: false,
                    error: `Extension not found: ${extensionId}`
                };
            }

            // Find the tool with exact ID match
            const tool = extensionInfo.tools.find(t => t.id === localToolId);
            if (!tool) {
                return {
                    success: false,
                    error: `Tool not found: ${localToolId} in extension ${extensionId}`
                };
            }

            // Validate parameters first
            const paramValidation = this.validateParameters(tool, parameters);
            if (!paramValidation.success) {
                return paramValidation;
            }

            // Get and validate the extension instance with retry logic
            let extension;
            try {
                extension = await this.validateExtension(extensionId);
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                };
            }

            const api = extension.exports;

            // Execute the tool
            try {
                const toolApi = api as LanguageModelToolsAPI;
                const result = await toolApi.executeTool(localToolId, parameters);
                return {
                    success: true,
                    result
                };
            } catch (error) {
                return {
                    success: false,
                    error: `Tool execution failed: ${error}`
                };
            }

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private parseToolId(toolId: string): [string, string] {
        const parts = toolId.split('.');
        if (parts.length < 2) {
            throw new Error(`Invalid tool ID format: ${toolId}`);
        }

        const localToolId = parts.pop()!;
        const extensionId = parts.join('.');
        
        return [extensionId, localToolId];
    }

    private validateParameters(tool: Tool, parameters: any): ExecutionResult {
        // Check for required parameters
        const missing = tool.parameters
            .filter(p => p.required && !parameters.hasOwnProperty(p.name))
            .map(p => p.name);

        if (missing.length > 0) {
            return {
                success: false,
                error: `Missing required parameter${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`
            };
        }

        // Validate parameter types
        for (const param of tool.parameters) {
            if (parameters.hasOwnProperty(param.name)) {
                const value = parameters[param.name];
                const typeValidation = this.validateParameterType(param, value);
                if (!typeValidation) {
                    return {
                        success: false,
                        error: `Parameter ${param.name} must be a ${param.type}`
                    };
                }
            }
        }

        return { success: true };
    }

    private validateParameterType(param: ToolParameter, value: any): boolean {
        switch (param.type.toLowerCase()) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number';
            case 'boolean':
                return typeof value === 'boolean';
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            default:
                return false;
        }
    }
}