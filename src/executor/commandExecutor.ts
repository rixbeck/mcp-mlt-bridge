import * as vscode from 'vscode';
import { ExtensionRegistry } from '../registry/extensionRegistry';

/**
 * Represents the result of a tool execution
 * @interface ExecutionResult
 */
interface ExecutionResult {
    success: boolean;
    result?: any;
    error?: ExecutionError;
    cached?: boolean;
    executionTime?: number;
}

/**
 * Represents an error that occurred during tool execution
 * @interface ExecutionError
 */
interface ExecutionError {
    code: string;
    message: string;
    details?: any;
}

/**
 * Represents a cached tool execution result
 * @interface CacheEntry
 * @internal
 */
interface CacheEntry {
    result: any;
    timestamp: number;
    parameters: string;
}

/**
 * Tracks metrics for ongoing tool executions
 * @interface ExecutionMetrics
 * @internal
 */
interface ExecutionMetrics {
    startTime: number;
    attempts: number;
    lastError?: Error;
}

/**
 * Describes a parameter for a language model tool
 * @interface ToolParameter
 */
interface ToolParameter {
    name: string;
    type: string;
    description: string;
    required: boolean;
}

/**
 * Describes a language model tool provided by an extension
 * @interface Tool
 */
interface Tool {
    id: string;
    name: string;
    description: string;
    parameters: ToolParameter[];
}

/**
 * Interface that must be implemented by extensions providing language model tools
 * @interface LanguageModelToolsAPI
 */
interface LanguageModelToolsAPI {
    executeTool(toolId: string, params: any): Promise<any>;
}

// Define minimal interface for VSCode API we need
/**
 * Minimal interface for required VS Code API functionality
 * @interface VSCodeAPI
 */
export interface VSCodeAPI {
    extensions: {
        getExtension(extensionId: string): vscode.Extension<any> | undefined;
    };
}

/**
 * Handles execution of language model tools provided by VS Code extensions
 * Implements caching, timeout handling, retries, and parameter validation
 * @class CommandExecutor
 */
export class CommandExecutor {
    private static readonly EXECUTION_TIMEOUT = 30000; // 30 seconds
    private static readonly ACTIVATION_TIMEOUT = 10000; // 10 seconds
    private static readonly MAX_RETRIES = 3;
    private static readonly RETRY_DELAY = 1000; // 1 second
    private static readonly CACHE_TTL = 300000; // 5 minutes
    
    private readonly cache: Map<string, CacheEntry> = new Map();
    private readonly activeExecutions: Map<string, ExecutionMetrics> = new Map();

    constructor(
        private readonly registry: ExtensionRegistry,
        private readonly vscodeApi: VSCodeAPI = vscode
    ) {
        // Clear expired cache entries periodically
        setInterval(() => this.cleanupCache(), 60000);
    }

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
                    const error = new Error(`Extension ${extensionId} does not implement LanguageModelTools API`);
                    (error as any).code = 'INVALID_API_IMPLEMENTATION';
                    throw error;
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

    /**
     * Executes a language model tool with caching and retry logic
     * @param {string} toolId - The ID of the tool to execute (format: extensionId.toolName)
     * @param {any} parameters - Parameters to pass to the tool
     * @returns {Promise<ExecutionResult>} The result of the tool execution
     */
    public async executeCommand(toolId: string, parameters: any): Promise<ExecutionResult> {
        const startTime = Date.now();
        const cacheKey = this.getCacheKey(toolId, parameters);

        try {
            // Check cache first
            const cached = this.cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < CommandExecutor.CACHE_TTL) {
                return {
                    success: true,
                    result: cached.result,
                    cached: true
                };
            }

            // Extract extension and tool IDs
            const [extensionId, localToolId] = this.parseToolId(toolId);
            
            // Get extension info
            const extensionInfo = await this.registry.getExtension(extensionId);
            if (!extensionInfo) {
                return {
                    success: false,
                    error: this.createError('EXTENSION_NOT_FOUND', { extensionId })
                };
            }

            // Find the tool with exact ID match
            const tool = extensionInfo.tools.find(t => t.id === localToolId);
            if (!tool) {
                return {
                    success: false,
                    error: this.createError('TOOL_NOT_FOUND', { toolId: localToolId, extensionId })
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
                if (error instanceof Error && (error as any).code === 'INVALID_API_IMPLEMENTATION') {
                    return {
                        success: false,
                        error: this.createError('INVALID_API_IMPLEMENTATION', error)
                    };
                }
                return {
                    success: false,
                    error: this.createError('EXTENSION_VALIDATION_FAILED', error)
                };
            }

            const api = extension.exports;

            // Execute the tool with timeout
            try {
                const toolApi = api as LanguageModelToolsAPI;
                const result = await Promise.race([
                    toolApi.executeTool(localToolId, parameters),
                    new Promise<never>((_, reject) => {
                        setTimeout(() => reject(new Error('Execution timeout')), 
                            CommandExecutor.EXECUTION_TIMEOUT);
                    })
                ]);

                // Cache successful results
                this.cache.set(cacheKey, {
                    result,
                    timestamp: Date.now(),
                    parameters: JSON.stringify(parameters)
                });

                return {
                    success: true,
                    result,
                    executionTime: Date.now() - startTime
                };

            } catch (error) {
                return {
                    success: false,
                    error: this.createError('TOOL_EXECUTION_FAILED', error),
                    executionTime: Date.now() - startTime
                };
            }

        } catch (error) {
            return {
                success: false,
                error: this.createError('EXECUTION_ERROR', error),
                executionTime: Date.now() - startTime
            };
        }
    }

    /**
     * Splits a tool ID into extension ID and local tool ID
     * @param {string} toolId - The full tool ID to parse
     * @returns {[string, string]} Tuple of [extensionId, localToolId]
     * @throws {Error} If tool ID format is invalid
     * @private
     */
    private parseToolId(toolId: string): [string, string] {
        const parts = toolId.split('.');
        if (parts.length < 2) {
            throw new Error(`Invalid tool ID format: ${toolId}`);
        }

        const localToolId = parts.pop()!;
        const extensionId = parts.join('.');
        
        return [extensionId, localToolId];
    }

    /**
     * Validates tool parameters against their definitions
     * @param {Tool} tool - The tool containing parameter definitions
     * @param {any} parameters - The parameters to validate
     * @returns {ExecutionResult} Validation result
     * @private
     */
    private validateParameters(tool: Tool, parameters: any): ExecutionResult {
        // Check for required parameters
        const missing = tool.parameters
            .filter(p => p.required && !parameters.hasOwnProperty(p.name))
            .map(p => p.name);

        if (missing.length > 0) {
            return {
                success: false,
                error: {
                    code: 'MISSING_REQUIRED_PARAMETERS',
                    message: `Missing required parameter${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
                    details: { missing }
                }
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
                        error: {
                            code: 'INVALID_PARAMETER_TYPE',
                            message: `Parameter ${param.name} must be a ${param.type}`,
                            details: { parameter: param.name, expectedType: param.type, actualValue: value }
                        }
                    };
                }
            }
        }

        return { success: true };
    }

    /**
     * Validates a parameter value against its expected type
     * @param {ToolParameter} param - The parameter definition
     * @param {any} value - The value to validate
     * @returns {boolean} True if value matches expected type
     * @private
     */
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

    /**
     * Creates a standardized error object
     * @param {string} code - Error code
     * @param {any} error - Original error or error details
     * @returns {ExecutionError} Standardized error object
     * @private
     */
    private createError(code: string, error: any): ExecutionError {
        return {
            code,
            message: error instanceof Error ? error.message : String(error),
            details: error instanceof Error ? undefined : error
        };
    }

    /**
     * Generates a cache key for a tool execution
     * @param {string} toolId - The ID of the tool
     * @param {any} parameters - The parameters used
     * @returns {string} The generated cache key
     * @private
     */
    private getCacheKey(toolId: string, parameters: any): string {
        return `${toolId}:${JSON.stringify(parameters)}`;
    }

    /**
     * Removes expired entries from the execution cache
     * @private
     */
    private cleanupCache(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (now - entry.timestamp > CommandExecutor.CACHE_TTL) {
                this.cache.delete(key);
            }
        }
    }
}