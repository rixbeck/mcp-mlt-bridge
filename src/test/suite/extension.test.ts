import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { after } from 'mocha';

suite('Extension Test Suite', () => {
    const extensionId = 'your-publisher-name.mcp-lmt-bridge';
    let disposables: vscode.Disposable[] = [];

    after(() => {
        disposables.forEach(d => d.dispose());
    });

    suiteSetup(async () => {
        // Wait for the extension to be ready
        await new Promise<void>(resolve => global.setTimeout(resolve, 1000));
    });

    test('Extension should be present', async () => {
        const extension = vscode.extensions.getExtension(extensionId);
        assert.notEqual(extension, undefined, `Extension ${extensionId} should be present`);
    });

    test('Extension should activate', async () => {
        const extension = vscode.extensions.getExtension(extensionId);
        assert.notEqual(extension, undefined, 'Extension should be found');
        
        if (extension && !extension.isActive) {
            await extension.activate();
        }
        assert.equal(extension?.isActive, true, 'Extension should be activated');
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        
        const expectedCommands = [
            'mcp.lmt.listExtensions',
            'mcp.lmt.getToolInfo',
            'mcp.lmt.executeTool'
        ];

        for (const cmd of expectedCommands) {
            assert.ok(
                commands.includes(cmd), 
                `Command ${cmd} should be registered`
            );
        }
    });

    test('MCP Server should start', async function() {
        this.timeout(5000); // Increase timeout for server start

        // Wait for server to start
        await new Promise<void>(resolve => global.setTimeout(resolve, 1000));
        
        // Try to execute a command that requires the server
        const result = await vscode.commands.executeCommand('mcp.lmt.listExtensions');
        assert.ok(Array.isArray(result), 'listExtensions should return an array');
    });
});