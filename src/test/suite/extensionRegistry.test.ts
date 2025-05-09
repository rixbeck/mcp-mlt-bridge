import * as assert from 'assert';
import { ExtensionRegistry } from '../../registry/extensionRegistry';

suite('ExtensionRegistry Test Suite', () => {
    let registry: ExtensionRegistry;

    setup(() => {
        registry = new ExtensionRegistry();
    });

    test('ExtensionRegistry should be instantiated', () => {
        assert.notStrictEqual(registry, undefined);
    });

    test('listExtensions should return an array', async () => {
        const extensions = await registry.listExtensions();
        assert.strictEqual(Array.isArray(extensions), true);
    });

    test('getExtension should return undefined for non-existent extension', async () => {
        const extension = await registry.getExtension('non.existent.extension');
        assert.strictEqual(extension, undefined);
    });

    // Mock extension data for testing
    const mockExtensionData = {
        id: 'test.extension',
        name: 'Test Extension',
        activationEvents: [
            "onStartupFinished",
            "onCapability:languageModelTools",
            "onCapability:webview"
          ],
    
        tools: [
            {
                id: 'test.tool',
                name: 'Test Tool',
                description: 'A test tool',
                parameters: [
                    {
                        name: 'param1',
                        type: 'string',
                        description: 'Test parameter',
                        required: true
                    }
                ]
            }
        ]
    };

    test('Extension processing should handle valid tool definitions', async () => {
        // Create a mock extension with required capabilities
        const mockExtension = {
            id: mockExtensionData.id,
            packageJSON: {
                name: mockExtensionData.name,
                version: '1.0.0',
                capabilities: ['languageModelTools', 'webview'],
                activationEvents: [
                    "onStartupFinished",
                    'onCapability:languageModelTools',
                    'onCapability:webview'
                ],
                contributes: {
                    languageModelTools: mockExtensionData.tools
                }
            },
            exports: {
                activate: () => Promise.resolve({}) // Mock activate function
            },
            activate: () => Promise.resolve() // Mock activate at extension level
        };

        // Access private method for testing
        const processExtension = (registry as any).processExtension.bind(registry);
        
        // Process the mock extension
        await processExtension(mockExtension);

        // Verify the extension was registered
        const extension = await registry.getExtension(mockExtensionData.id);
        assert.notStrictEqual(extension, undefined);
        assert.strictEqual(extension?.id, mockExtensionData.id);
        assert.strictEqual(extension?.name, mockExtensionData.name);
        assert.strictEqual(extension?.tools.length, 1);
        
        const tool = extension?.tools[0];
        assert.ok(tool);
        assert.strictEqual(tool.id, `${mockExtensionData.id}.${mockExtensionData.tools[0].id}`);
        assert.strictEqual(tool.name, mockExtensionData.tools[0].name);
        assert.strictEqual(tool.description, mockExtensionData.tools[0].description);
    });

    test('Extension processing should ignore invalid tool definitions', async () => {
        // Create a mock extension with invalid tool data
        const mockInvalidExtension = {
            id: 'invalid.extension',
            packageJSON: {
                name: 'Invalid Extension',
                version: '1.0.0',
                contributes: {
                    languageModelTools: [
                        {
                            // Missing required fields
                            description: 'Invalid tool'
                        }
                    ]
                }
            }
        };

        // Access private method for testing
        const processExtension = (registry as any).processExtension.bind(registry);
        
        // Process the mock extension
        await assert.rejects(
            async () => {
                await processExtension(mockInvalidExtension);
            },
            (error: any) => {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes('does not declare required capabilities'));
                return true;
            }
        );
            
        // Verify the extension was not registered
        const extension = await registry.getExtension('invalid.extension');
        assert.strictEqual(extension, undefined);
    });
});