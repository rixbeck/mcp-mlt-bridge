import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'fast-glob';
import * as fs from 'fs';

async function cleanupTestArtifacts(): Promise<void> {
    const testDirs = [
        path.resolve(__dirname, '../test-workspace'),
        path.resolve(__dirname, '../test-resources'),
        path.resolve(__dirname, '../test-user-data')
    ];

    for (const dir of testDirs) {
        if (fs.existsSync(dir)) {
            await fs.promises.rm(dir, { recursive: true, force: true });
        }
    }
}

export async function run(): Promise<void> {
    // Create the mocha test
    const mocha = new (require('mocha'))({
        ui: 'tdd',
        color: true,
        timeout: 10000 // Increase timeout for VSCode extension tests
    });

    const testsRoot = path.resolve(__dirname);
    console.log('Tests root:', testsRoot);

    try {
        // Find test files
        const files = await glob.sync('*.test.js', {
            cwd: testsRoot,
            absolute: true
        });

        if (files.length === 0) {
            console.log('No test files found in:', testsRoot);
            console.log('Directory contents:', await glob.sync('*', {
                cwd: testsRoot,
                absolute: true
            }));
            throw new Error('No test files found');
        }

        console.log('Found test files:', files);

        // Add files to the test suite
        files.forEach((file: string) => {
            console.log('Adding test file:', file);
            mocha.addFile(file);
        });

        // Clean up any leftover test artifacts before running tests
        await cleanupTestArtifacts();

        // Run the mocha tests
        return new Promise<void>((resolve, reject) => {
            try {
                mocha.run((failures: number) => {
                    if (failures > 0) {
                        reject(new Error(`${failures} tests failed.`));
                    } else {
                        resolve();
                    }
                });
            } catch (err) {
                console.error('Error running tests:', err);
                reject(err);
            }
        });
    } catch (err) {
        console.error('Error in test suite:', err);
        throw err;
    } finally {
        // Clean up test artifacts after tests complete
        await cleanupTestArtifacts();
    }
}