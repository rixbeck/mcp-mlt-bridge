import * as vscode from 'vscode';
import { ExtensionRegistry } from '../registry/extensionRegistry';

interface ExecutionResult {
    success: boolean;
    result?: any;
    error?: ExecutionError;
    cached?: boolean;
    executionTime?: number;
}

interface ExecutionError {
    code: string;
    message: string;
    details?: any;
}

interface CacheEntry {
    result: any;
    timestamp: number;
    parameters: string;
}

interface ExecutionMetrics {
    startTime: number;
    attempts: number;
    lastError?: Error;
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
    private static readonly EXECUTION_TIMEOUT = 30000; // 30 seconds
    private static readonly MAX_RETRIES = 2;
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

            // Track execution metrics
            const metrics: ExecutionMetrics = {
                startTime,
                attempts: 0
            };
            this.activeExecutions.set(cacheKey, metrics);

            // Execute with retry logic
            const result = await this.executeWithRetry(toolId, parameters, metrics);

            // Cache successful results
            if (result.success) {
                this.cache.set(cacheKey, {
                    result: result.result,
                    timestamp: Date.now(),
                    parameters: JSON.stringify(parameters)
                });
            }

            return {
                ...result,
                executionTime: Date.now() - startTime
            };

        } catch (error) {
            return {
                success: false,
                error: this.createError('EXECUTION_ERROR', error),
                executionTime: Date.now() - startTime
            };
        } finally {
            this.activeExecutions.delete(cacheKey);
        }
    }

    private async executeWithRetry(
        toolId: string,
        parameters: any,
        metrics: ExecutionMetrics
    ): Promise<ExecutionResult> {
        while (metrics.attempts <= CommandExecutor.MAX_RETRIES) {
            try {
                metrics.attempts++;
                
                // Check timeout
                if (Date.now() - metrics.startTime > CommandExecutor.EXECUTION_TIMEOUT) {
                    throw new Error('Execution timeout exceeded');
                }

                const result = await this.executeWithTimeout(toolId, parameters);
                return result;

            } catch (error) {
                metrics.lastError = error as Error;
                
                if (metrics.attempts > CommandExecutor.MAX_RETRIES) {
                    return {
                        success: false,
                        error: this.createError('MAX_RETRIES_EXCEEDED', error)
                    };
                }
                
                // Wait before retrying (exponential backoff)
                await new Promise(resolve =>
                    setTimeout(resolve, Math.pow(2, metrics.attempts) * 1000)
                );
            }
        }

        return {
            success: false,
            error: this.createError(
                'UNKNOWN_ERROR',
                metrics.lastError || new Error('Unknown execution error')
            )
        };
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
    private async executeWithTimeout(toolId: string, parameters: any): Promise<ExecutionResult> {
        const [extensionId, localToolId] = this.parseToolId(toolId);
        
        // Get extension info
        const extensionInfo = await this.registry.getExtension(extensionId);
        if (!extensionInfo) {
            return {
                success: false,
                error: this.createError('EXTENSION_NOT_FOUND', { extensionId })
            };
        }

        // Find the tool
        const tool = extensionInfo.tools.find(t => t.id === localToolId);
        if (!tool) {
            return {
                success: false,
                error: this.createError('TOOL_NOT_FOUND', { toolId: localToolId, extensionId })
            };
        }

        // Validate parameters
        const paramValidation = this.validateParameters(tool, parameters);
        if (!paramValidation.success) {
            return paramValidation;
        }

        // Get extension instance
        const extension = this.vscodeApi.extensions.getExtension(extensionId);
        if (!extension) {
            return {
                success: false,
                error: this.createError('EXTENSION_INSTANCE_NOT_FOUND', { extensionId })
            };
        }

        // Activate extension if needed
        if (!extension.isActive) {
            try {
                await extension.activate();
            } catch (error) {
                return {
                    success: false,
                    error: this.createError('EXTENSION_ACTIVATION_FAILED', error)
                };
            }
        }

        // Verify API implementation
        const api = extension.exports;
        if (!api || typeof api.executeTool !== 'function') {
            return {
                success: false,
                error: this.createError('INVALID_API_IMPLEMENTATION', { extensionId })
            };
        }

        // Execute tool with timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Execution timeout')), CommandExecutor.EXECUTION_TIMEOUT);
        });

        try {
            const toolApi = api as LanguageModelToolsAPI;
            const result = await Promise.race([
                toolApi.executeTool(localToolId, parameters),
                timeoutPromise
            ]);

            return {
                success: true,
                result
            };

        } catch (error) {
            return {
                success: false,
                error: this.createError('TOOL_EXECUTION_FAILED', error)
            };
        }
    }

    private getCacheKey(toolId: string, parameters: any): string {
        return `${toolId}:${JSON.stringify(parameters)}`;
    }

    private cleanupCache(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (now - entry.timestamp > CommandExecutor.CACHE_TTL) {
                this.cache.delete(key);
            }
        }
    }

    private createError(code: string, error: any): ExecutionError {
        return {
            code,
            message: error instanceof Error ? error.message : String(error),
            details: error instanceof Error ? {
                name: error.name,
                stack: error.stack
            } : error
        };
    }
}