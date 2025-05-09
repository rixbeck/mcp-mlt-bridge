import * as assert from 'assert';
import * as vscode from 'vscode';
import { CommandExecutor } from '../../executor/commandExecutor';
import { ExtensionRegistry } from '../../registry/extensionRegistry';
import { mockVscode } from './mockVscode';

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

suite('CommandExecutor Test Suite', () => {
    let executor: CommandExecutor;
    let registry: ExtensionRegistry;

    const createMockExtension = (id: string, tools: any[]): vscode.Extension<any> => ({
        id,
        extensionUri: vscode.Uri.file(''),
        extensionPath: '',
        isActive: true,
        packageJSON: {
            name: 'Test Extension',
            contributes: {
                languageModelTools: tools
            }
        },
        activate: async () => ({}),
        exports: {},
        extensionKind: vscode.ExtensionKind.Workspace
    });

    setup(() => {
        registry = new ExtensionRegistry();
        // Pass mockVscode as second parameter
        executor = new CommandExecutor(registry, mockVscode);
        mockVscode.setExtensions({
            getExtension: () => undefined
        });
    });

    test('Should reject invalid tool IDs', async () => {
        const result = await executor.executeCommand('invalid-tool', {}) as ExecutionResult;
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.error?.code, 'EXECUTION_ERROR');
        assert.ok(result.error?.message.includes('Invalid tool ID format'));
    });

    test('Should reject non-existent extensions', async () => {
        const result = await executor.executeCommand('nonexistent.extension.tool', {}) as ExecutionResult;
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.error?.code, 'EXTENSION_NOT_FOUND');
        assert.ok(result.error?.details?.extensionId);
    });

    test('Should validate required parameters', async () => {
        const extensionId = 'test.extension';
        const toolId = 'tool';
        const tools = [{
            id: toolId,
            name: 'Test Tool',
            description: 'A test tool',
            parameters: [{
                name: 'required_param',
                type: 'string',
                description: 'Required parameter',
                required: true
            }]
        }];

        // Register the mock extension
        const mockExt = createMockExtension(extensionId, tools);
        (registry as any).extensions.set(extensionId, {
            id: extensionId,
            name: mockExt.packageJSON.name,
            tools: tools
        });

        mockVscode.setExtensions({
            getExtension: () => mockExt
        });

        const result = await executor.executeCommand(`${extensionId}.${toolId}`, {}) as ExecutionResult;
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.error?.code, 'MISSING_REQUIRED_PARAMETERS');
        assert.ok(result.error?.details?.missing.includes('required_param'));
    });

    test('Should validate parameter types', async () => {
        const extensionId = 'test.extension';
        const toolId = 'tool';
        const tools = [{
            id: toolId,
            name: 'Test Tool',
            description: 'A test tool',
            parameters: [{
                name: 'number_param',
                type: 'number',
                description: 'Number parameter',
                required: true
            }]
        }];

        // Register the mock extension
        const mockExt = createMockExtension(extensionId, tools);
        (registry as any).extensions.set(extensionId, {
            id: extensionId,
            name: mockExt.packageJSON.name,
            tools: tools
        });

        mockVscode.setExtensions({
            getExtension: () => mockExt
        });

        const result = await executor.executeCommand(`${extensionId}.${toolId}`, {
            number_param: 'not a number'
        });
        
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.error?.code, 'INVALID_PARAMETER_TYPE');
        assert.strictEqual(result.error?.details?.expectedType, 'number');
    });

    test('Should handle extension activation failure', async () => {
        const toolId = 'mock.extension.tool';
        const result = await executor.executeCommand(toolId, {});
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.error?.code, 'EXTENSION_NOT_FOUND');
    });

    test('Should handle missing API implementation', async () => {
        const extensionId = 'test.extension';
        const toolId = 'tool';
        const tools = [{
            id: toolId,
            name: 'Test Tool',
            description: 'A test tool',
            parameters: []
        }];

        // Register the mock extension
        const mockExt = createMockExtension(extensionId, tools);
        (registry as any).extensions.set(extensionId, {
            id: extensionId,
            name: mockExt.packageJSON.name,
            tools: tools
        });

        // Mock extension without executeTool
        mockVscode.setExtensions({
            getExtension: () => ({
                ...mockExt,
                exports: {
                    someOtherFunction: () => {}
                }
            })
        });

        const result = await executor.executeCommand(`${extensionId}.${toolId}`, {});
        assert.strictEqual(result.success, false, 'Should fail when API is missing');
        assert.strictEqual(result.error?.code, 'INVALID_API_IMPLEMENTATION');
    });

    test('Should handle successful tool execution', async () => {
        const extensionId = 'test.extension';
        const toolId = 'tool';
        const tools = [{
            id: toolId,
            name: 'Test Tool',
            description: 'A test tool',
            parameters: [{
                name: 'input',
                type: 'string',
                description: 'Input parameter',
                required: true
            }]
        }];

        // Register the mock extension
        const mockExt = createMockExtension(extensionId, tools);
        (registry as any).extensions.set(extensionId, {
            id: extensionId,
            name: mockExt.packageJSON.name,
            tools: tools
        });

        // Mock extension with working executeTool
        mockVscode.setExtensions({
            getExtension: () => ({
                ...mockExt,
                exports: {
                    executeTool: async (_toolId: string, params: any) => {
                        return `Executed tool with ${params.input}`;
                    }
                }
            })
        });

        const result = await executor.executeCommand(`${extensionId}.${toolId}`, {
            input: 'test input'
        });
        
        assert.strictEqual(result.success, true, 'Execution should succeed');
        assert.ok(result.result, 'Result should be present');
        assert.strictEqual(typeof result.result, 'string', 'Result should be a string');
        assert.ok(result.result.includes('test input'), 'Result should include input parameter');
    });

    test('Should cache successful results', async () => {
        const extensionId = 'test.extension';
        const toolId = 'tool';
        const tools = [{
            id: toolId,
            name: 'Test Tool',
            description: 'A test tool',
            parameters: [{
                name: 'input',
                type: 'string',
                description: 'Input parameter',
                required: true
            }]
        }];

        let executionCount = 0;
        const mockExt = createMockExtension(extensionId, tools);
        (registry as any).extensions.set(extensionId, {
            id: extensionId,
            name: mockExt.packageJSON.name,
            tools: tools
        });

        mockVscode.setExtensions({
            getExtension: () => ({
                ...mockExt,
                exports: {
                    executeTool: async () => {
                        executionCount++;
                        return 'test result';
                    }
                }
            })
        });

        // First execution
        const result1 = await executor.executeCommand(`${extensionId}.${toolId}`, {
            input: 'test'
        }) as ExecutionResult;
        
        assert.strictEqual(result1.success, true);
        assert.strictEqual(result1.cached, undefined);
        assert.strictEqual(executionCount, 1);

        // Second execution (should be cached)
        const result2 = await executor.executeCommand(`${extensionId}.${toolId}`, {
            input: 'test'
        }) as ExecutionResult;

        assert.strictEqual(result2.success, true);
        assert.strictEqual(result2.cached, true);
        assert.strictEqual(executionCount, 1, 'Should not execute tool again when cached');
    });

    test('Should handle execution timeout', async () => {
        const extensionId = 'test.extension';
        const toolId = 'tool';
        const tools = [{
            id: toolId,
            name: 'Test Tool',
            description: 'A test tool',
            parameters: []
        }];

        const mockExt = createMockExtension(extensionId, tools);
        (registry as any).extensions.set(extensionId, {
            id: extensionId,
            name: mockExt.packageJSON.name,
            tools: tools
        });

        mockVscode.setExtensions({
            getExtension: () => ({
                ...mockExt,
                exports: {
                    executeTool: () => new Promise((_, reject) => setTimeout(() => reject(new Error('Execution timeout')), 5000))
                }
            })
        });

        const result = await executor.executeCommand(`${extensionId}.${toolId}`, {}) as ExecutionResult;

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.error?.code, 'TOOL_EXECUTION_FAILED');
        assert.ok(result.error?.message.includes('timeout'));
    });
});