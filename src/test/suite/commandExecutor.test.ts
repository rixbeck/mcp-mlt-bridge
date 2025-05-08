import * as assert from 'assert';
import * as vscode from 'vscode';
import { CommandExecutor } from '../../executor/commandExecutor';
import { ExtensionRegistry } from '../../registry/extensionRegistry';
import { mockVscode } from './mockVscode';

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
        const result = await executor.executeCommand('invalid-tool', {});
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Invalid tool ID format'));
    });

    test('Should reject non-existent extensions', async () => {
        const result = await executor.executeCommand('nonexistent.extension.tool', {});
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Extension not found'));
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

        const result = await executor.executeCommand(`${extensionId}.${toolId}`, {});
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Missing required parameter'));
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
        assert.ok(result.error?.includes('must be a number'));
    });

    test('Should handle extension activation failure', async () => {
        const toolId = 'mock.extension.tool';
        const result = await executor.executeCommand(toolId, {});
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Extension not found'));
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
        assert.ok(result.error?.includes('does not implement LanguageModelTools API'));
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
});