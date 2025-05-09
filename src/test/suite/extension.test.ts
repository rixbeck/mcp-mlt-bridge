import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { after } from 'mocha';

async function retryOperation<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    delayMs: number = 1000
): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;
            if (attempt === maxAttempts) break;
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    
    throw lastError;
}

suite('Extension Test Suite', () => {
    const extensionId = 'neologik-team.mcp-lmt-bridge';
    let disposables: vscode.Disposable[] = [];
    const activationTimeout = 10000; // 10 seconds timeout

    after(async () => {
        disposables.forEach(d => d.dispose());
        // Ensure proper cleanup
        await new Promise<void>(resolve => setTimeout(resolve, 500));
    });

    suiteSetup(async function() {
        this.timeout(activationTimeout);
        
        await retryOperation(async () => {
            const extension = vscode.extensions.getExtension(extensionId);
            if (!extension) {
                throw new Error(`Extension ${extensionId} not found`);
            }
            
            if (!extension.isActive) {
                await extension.activate();
            }
            
            return extension;
        });
    });

    test('Extension should be present', async () => {
        const extension = vscode.extensions.getExtension(extensionId);
        assert.notEqual(extension, undefined, `Extension ${extensionId} should be present`);
    });

    test('Extension should activate', async function() {
        this.timeout(activationTimeout);
        
        const extension = await retryOperation(async () => {
            const ext = vscode.extensions.getExtension(extensionId);
            if (!ext) {
                throw new Error('Extension not found');
            }
            
            if (!ext.isActive) {
                await ext.activate();
            }
            
            assert.equal(ext.isActive, true, 'Extension should be activated');
            return ext;
        });
        
        assert.notEqual(extension, undefined, 'Extension should be found and activated');
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
        this.timeout(activationTimeout);
        
        await retryOperation(async () => {
            const result = await vscode.commands.executeCommand('mcp.lmt.listExtensions');
            assert.ok(Array.isArray(result), 'listExtensions should return an array');
            return result;
        }, 5, 2000); // 5 attempts, 2 second delay between attempts
    });
});