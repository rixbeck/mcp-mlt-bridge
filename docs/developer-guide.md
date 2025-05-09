# Developer Guide

This guide provides detailed information for developers who want to work on the MCP-LMT-Bridge extension or create extensions that integrate with it.

## Development Environment Setup

### Prerequisites

1. Install required software:

```bash
# Install Node.js (22.14.0 or higher)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install development tools
npm install -g typescript
npm install -g @vscode/vsce
```

2. Clone the repository:

```bash
git clone https://github.com/username/mcp-lmt-bridge.git
cd mcp-lmt-bridge
```

3. Install dependencies:

```bash
npm install
```

### VSCode Setup

1. Install recommended extensions:
    - ESLint
    - Prettier
    - TypeScript and JavaScript Language Features
    - Debug Extension

2. Configure workspace settings:

```json
{
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
        "source.fixAll.eslint": true
    },
    "typescript.preferences.importModuleSpecifier": "relative"
}
```

## Project Structure

```
mcp-lmt-bridge/
├── src/
│   ├── extension.ts           # Extension entry point
│   ├── server/
│   │   └── mcpServer.ts      # MCP server implementation
│   ├── registry/
│   │   └── extensionRegistry.ts  # Extension management
│   ├── executor/
│   │   └── commandExecutor.ts    # Command execution logic
│   └── test/
│       └── suite/            # Test files
├── docs/                     # Documentation
├── .vscode/                  # VSCode configuration
└── package.json             # Project configuration
```

## Build and Test

### Building the Extension

1. Development build:

```bash
npm run compile
```

2. Production build:

```bash
npm run package
```

3. Watch mode for development:

```bash
npm run watch
```

4. Create VSIX package:

```bash
npm run package:vsix
```

### Running Tests

1. Run all tests:

```bash
npm run test
```

2. Run tests in watch mode:

```bash
npm run test:watch
```

### Debugging

1. Launch configurations are provided in `.vscode/launch.json`:

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Extension",
            "type": "extensionHost",
            "request": "launch",
            "runtimeExecutable": "${execPath}",
            "args": [
                "--extensionDevelopmentPath=${workspaceFolder}"
            ]
        },
        {
            "name": "Extension Tests",
            "type": "extensionHost",
            "request": "launch",
            "runtimeExecutable": "${execPath}",
            "args": [
                "--extensionDevelopmentPath=${workspaceFolder}",
                "--extensionTestsPath=${workspaceFolder}/out/test/suite/index"
            ]
        }
    ]
}
```

2. Debug console logging:

```typescript
console.log('Debug message');
console.error('Error message');
```

## Implementation Guidelines

### Code Style

1. TypeScript best practices:

```typescript
// Use interface for public APIs
interface ToolDefinition {
    id: string;
    name: string;
}

// Use type for complex types
type ToolResult<T> = {
    success: boolean;
    data?: T;
    error?: Error;
};

// Use async/await for asynchronous operations
async function executeTool(id: string): Promise<ToolResult<any>> {
    try {
        const result = await performOperation();
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error };
    }
}
```

2. Error handling:

```typescript
class ToolExecutionError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: any
    ) {
        super(message);
        this.name = 'ToolExecutionError';
    }
}

function validateInput(input: unknown): asserts input is ValidInput {
    if (!isValidInput(input)) {
        throw new ToolExecutionError(
            'Invalid input',
            'INVALID_INPUT',
            { received: input }
        );
    }
}
```

### Testing Guidelines

1. Unit test structure:

```typescript
describe('CommandExecutor', () => {
    let executor: CommandExecutor;

    beforeEach(() => {
        executor = new CommandExecutor();
    });

    it('should execute valid command', async () => {
        const result = await executor.execute('test.command', { param: 'value' });
        expect(result).toBeDefined();
    });

    it('should handle errors', async () => {
        await expect(
            executor.execute('invalid.command', {})
        ).rejects.toThrow(ToolExecutionError);
    });
});
```

2. Mock implementation:

```typescript
class MockToolProvider implements MCPToolProvider {
    async getTools(): Promise<Tool[]> {
        return [
            {
                id: 'mock.tool',
                name: 'Mock Tool',
                execute: async () => ({ success: true })
            }
        ];
    }
}
```

### Performance Considerations

1. Resource management:

```typescript
class ResourcePool<T> {
    private resources: T[] = [];
    private maxSize: number;

    async acquire(): Promise<T> {
        if (this.resources.length > 0) {
            return this.resources.pop()!;
        }
        return this.createResource();
    }

    release(resource: T): void {
        if (this.resources.length < this.maxSize) {
            this.resources.push(resource);
        }
    }
}
```

2. Caching:

```typescript
class ResultCache<T> {
    private cache = new Map<string, {
        value: T;
        timestamp: number;
    }>();

    get(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (entry && Date.now() - entry.timestamp < this.ttl) {
            return entry.value;
        }
        return undefined;
    }
}
```

## Contributing

### Submission Guidelines

1. Create a new branch:

```bash
git checkout -b feature/new-feature
```

2. Make changes and commit:

```bash
git add .
git commit -m "feat: add new feature"
```

3. Run tests and linting:

```bash
npm run test
npm run lint
```

4. Submit pull request:
    - Follow PR template
    - Include tests
    - Update documentation
    - Add changelog entry

### Review Process

1. Code review requirements:
    - No lint errors
    - Test coverage maintained
    - Documentation updated
    - Changelog entry added

2. Review checklist:
    - [ ] Code follows style guide
    - [ ] Tests pass
    - [ ] Documentation is updated
    - [ ] Changelog is updated
    - [ ] PR description is clear

### Release Process

1. Version bump:

```bash
npm version patch|minor|major
```

2. Generate changelog:

```bash
npm run changelog
```

3. Create release:

```bash
vsce package
vsce publish