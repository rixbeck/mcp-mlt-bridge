import * as path from 'path';
import * as fs from 'fs';
import { runTests } from '@vscode/test-electron';

async function ensureDir(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
    }
}

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to the extension test script
        const extensionTestsPath = path.resolve(__dirname, './suite/index.js');

        // Set up test workspace
        const testWorkspacePath = path.resolve(__dirname, './test-workspace');
        const testResourcesPath = path.resolve(__dirname, './test-resources');

        console.log('Extension development path:', extensionDevelopmentPath);
        console.log('Extension tests path:', extensionTestsPath);
        // Ensure test directories exist
        await ensureDir(testWorkspacePath);
        await ensureDir(testResourcesPath);
        await ensureDir(path.resolve(__dirname, './test-user-data'));

        console.log('Test workspace path:', testWorkspacePath);
        console.log('Test resources path:', testResourcesPath);

        // Download VS Code, unzip it and run the integration test
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                testWorkspacePath,
                '--disable-extensions', // Disable other extensions for clean testing
                '--user-data-dir', path.resolve(__dirname, './test-user-data')
            ],
            extensionTestsEnv: {
                TEST_RESOURCES: testResourcesPath,
                TEST_WORKSPACE: testWorkspacePath
            }
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();