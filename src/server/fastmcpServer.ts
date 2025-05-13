import {FastMCP, type Context, type Tool, type ToolParameters, type ContentResult} from 'fastmcp';
import {EventEmitter} from 'events';
import {ExtensionRegistry} from '../registry/extensionRegistry';
import {z} from 'zod';
import {StandardSchemaV1} from '@standard-schema/spec';

// define event types of the server
export type ServerEvent =
  | 'sessionStarted'
  | 'sessionEnded'
  | 'stateChanged'
  | 'error'
  | 'requestStart'
  | 'requestEnd';

export class MCPServer extends EventEmitter {
  private server: FastMCP;
  private registry: ExtensionRegistry | undefined;
  private serverPort: number = 0;
  private activeSessions: number = 0;

  constructor(registry: ExtensionRegistry) {
    super();
    this.registry = registry;

    this.server = new FastMCP({
      name: 'LMT Bridge',
      version: '1.0.0',
      //instructions: 'Language Model Tools Bridge Server',
    });

    this.addTool({
      name: 'ls_extensions',
      description: 'List all extensions',
      parameters: undefined,
      execute: async (_args, _context) => {
        return this.registry?.listExtensions().then(extensions => {
          return extensions.map(ext => ext.id).join(', ');
        }) || 'No extensions found';
      }
    });
  }

  public addTool<Params extends ToolParameters>(tool: Tool<undefined, Params>) {
    this.server.addTool(tool);
  }

  public async start(port: number = 3000): Promise<void> {
    this.serverPort = port;
    await this.server.start({
      transportType: 'sse',
      sse: {
        endpoint: '/sse',
        port: this.serverPort
      }
    });

    this.server.on('connect', (event: {session: any}) => {
      console.log('Client connected:', event.session);
      this.activeSessions++;
      this.emit('sessionStarted', event.session);
    });

    this.server.on('disconnect', (event: {session: any}) => {
      console.log('Client disconnected:', event.session);
      this.activeSessions = Math.max(0, this.activeSessions - 1);
      this.emit('sessionEnded', event.session);
    });
  }

  public async stop(): Promise<void> {
    this.server.stop();
    this.emit('stateChanged', 'stopped');
  }

  public getPort(): number {
    return this.serverPort;
  }

  public getSessionCount(): number {
    return this.activeSessions;
  }
}
