import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { PrlctlMock } from './prlctl-mock';
import * as childProcess from 'child_process';

// Import tool router and handlers
import { ToolRouter } from '../../toolRouter.js';
import { handleListVMs } from '../../tools/listVMs.js';
import { handleCreateVM } from '../../tools/createVM.js';
import { handleStartVM } from '../../tools/startVM.js';
import { handleStopVM } from '../../tools/stopVM.js';
import { handleDeleteVM } from '../../tools/deleteVM.js';
import { handleTakeSnapshot } from '../../tools/takeSnapshot.js';
import { handleRestoreSnapshot } from '../../tools/restoreSnapshot.js';
import { handleListSnapshots } from '../../tools/listSnapshots.js';
import { handleTakeScreenshot } from '../../tools/takeScreenshot.js';
import { handleCreateTerminalSession } from '../../tools/createTerminalSession.js';
import { handleManageSshAuth } from '../../tools/manageSshAuth.js';
import { handleBatchOperation } from '../../tools/batchOperation.js';
import { handleSetHostname } from '../../tools/setHostname.js';

export interface TestClientOptions {
  prlctlMock?: PrlctlMock;
}

/**
 * MCP Test Client for integration testing
 */
export class MCPTestClient {
  private client!: Client;
  private server!: Server;
  private clientTransport!: InMemoryTransport;
  private serverTransport!: InMemoryTransport;
  private prlctlMock?: PrlctlMock;
  private static mockedExecFile?: jest.SpyInstance;

  async start(options: TestClientOptions = {}) {
    this.prlctlMock = options.prlctlMock;

    // Mock child_process.execFile if prlctl mock is provided
    if (this.prlctlMock) {
      // Clean up any existing mock first
      if (MCPTestClient.mockedExecFile) {
        MCPTestClient.mockedExecFile.mockRestore();
        MCPTestClient.mockedExecFile = undefined;
      }


      // Mock execFile directly with proper typing
      MCPTestClient.mockedExecFile = jest.spyOn(childProcess, 'execFile').mockImplementation(((
        command: any,
        args: any,
        options: any,
        callback?: any
      ) => {
        // Handle both callback and options+callback signatures
        let actualCallback = callback;

        if (typeof options === 'function') {
          actualCallback = options;
        }

        if (command !== 'prlctl' || !args) {
          actualCallback(new Error(`Command not found: ${command}`));
          return null as any;
        }

        // Debug logging
        console.log('Mocked execFile called:', command, args);

        this.prlctlMock!.execute(args as string[])
          .then((result) => {
            console.log('Mock result:', result);
            actualCallback(null, result.stdout, result.stderr);
          })
          .catch((error) => {
            console.log('Mock error:', error);
            actualCallback(error);
          });

        return null as any;
      }) as any);
    }

    // Create bidirectional transports
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    this.clientTransport = clientTransport;
    this.serverTransport = serverTransport;

    // Create server
    this.server = new Server(
      {
        name: 'test-parallels-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Register tools with server
    this.registerTools();

    // Create client
    this.client = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    // Connect server and client to their transports
    await this.server.connect(this.serverTransport);
    await this.client.connect(this.clientTransport);
  }

  async stop() {
    await this.client?.close();
    await this.server?.close();

    // Clean up static mock
    if (MCPTestClient.mockedExecFile) {
      MCPTestClient.mockedExecFile.mockRestore();
      MCPTestClient.mockedExecFile = undefined;
    }

    // Restore all mocks
    jest.restoreAllMocks();
  }

  /**
   * Call a tool with given arguments
   */
  async callTool(name: string, args: any): Promise<CallToolResult> {
    const result = await this.client.callTool({ name, arguments: args });
    return result as CallToolResult;
  }

  /**
   * List available tools
   */
  async listTools(): Promise<Tool[]> {
    const result = await this.client.listTools();
    return result.tools;
  }

  /**
   * Get the mock instance for assertions
   */
  getMock(): PrlctlMock | undefined {
    return this.prlctlMock;
  }

  /**
   * Register all tool handlers
   */
  private registerTools() {
    // List all available tools
    const tools = [
      {
        name: 'listVMs',
        description: 'List all available Parallels virtual machines',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'createVM',
        description: 'Create a new VM from scratch or clone from template',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'VM name' },
            fromTemplate: { type: 'string', description: 'Template VM to clone from (optional)' },
            os: {
              type: 'string',
              enum: ['ubuntu', 'debian', 'windows-11', 'macos', 'other'],
              description: 'OS type (optional)',
            },
            distribution: { type: 'string', description: 'OS distribution (optional)' },
            memory: { type: 'number', description: 'Memory in MB (optional)' },
            cpus: { type: 'number', description: 'Number of CPUs (optional)' },
            diskSize: { type: 'number', description: 'Disk size in GB (optional)' },
          },
          required: ['name'],
        },
      },
      {
        name: 'startVM',
        description: 'Start a specified VM',
        inputSchema: {
          type: 'object',
          properties: {
            vmId: { type: 'string', description: 'VM ID or name' },
          },
          required: ['vmId'],
        },
      },
      {
        name: 'stopVM',
        description: 'Stop a specified VM',
        inputSchema: {
          type: 'object',
          properties: {
            vmId: { type: 'string', description: 'VM ID or name' },
            force: { type: 'boolean', description: 'Force stop (kill) the VM' },
          },
          required: ['vmId'],
        },
      },
      {
        name: 'deleteVM',
        description: 'Delete a specified VM (requires confirmation)',
        inputSchema: {
          type: 'object',
          properties: {
            vmId: { type: 'string', description: 'VM ID or name' },
            confirm: { type: 'boolean', description: 'Confirm deletion' },
          },
          required: ['vmId'],
        },
      },
      {
        name: 'takeSnapshot',
        description: 'Create a snapshot of a VM',
        inputSchema: {
          type: 'object',
          properties: {
            vmId: { type: 'string', description: 'VM ID or name' },
            name: { type: 'string', description: 'Snapshot name' },
            description: { type: 'string', description: 'Snapshot description (optional)' },
          },
          required: ['vmId', 'name'],
        },
      },
      {
        name: 'restoreSnapshot',
        description: 'Restore a VM to a specified snapshot',
        inputSchema: {
          type: 'object',
          properties: {
            vmId: { type: 'string', description: 'VM ID or name' },
            snapshotId: { type: 'string', description: 'Snapshot ID or name' },
          },
          required: ['vmId', 'snapshotId'],
        },
      },
      {
        name: 'listSnapshots',
        description: 'List all snapshots for a VM',
        inputSchema: {
          type: 'object',
          properties: {
            vmId: { type: 'string', description: 'VM ID or name' },
          },
          required: ['vmId'],
        },
      },
      {
        name: 'takeScreenshot',
        description: 'Capture a screenshot of a running VM',
        inputSchema: {
          type: 'object',
          properties: {
            vmId: { type: 'string', description: 'VM ID or name' },
            outputPath: { type: 'string', description: 'Output file path (optional)' },
          },
          required: ['vmId'],
        },
      },
      {
        name: 'createTerminalSession',
        description: 'Get instructions to open a terminal session to a VM',
        inputSchema: {
          type: 'object',
          properties: {
            vmId: { type: 'string', description: 'VM ID or name' },
            user: { type: 'string', description: 'Username (optional)' },
          },
          required: ['vmId'],
        },
      },
      {
        name: 'manageSshAuth',
        description: 'Configure SSH authentication for passwordless access',
        inputSchema: {
          type: 'object',
          properties: {
            vmId: { type: 'string', description: 'VM ID or name' },
            username: { type: 'string', description: 'Username to configure' },
            publicKeyPath: { type: 'string', description: 'Path to public key (optional)' },
            enablePasswordlessSudo: { type: 'boolean', description: 'Enable passwordless sudo' },
          },
          required: ['vmId', 'username'],
        },
      },
      {
        name: 'batchOperation',
        description: 'Apply an operation to multiple VMs',
        inputSchema: {
          type: 'object',
          properties: {
            targetVMs: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of VM IDs or names',
            },
            operation: {
              type: 'string',
              enum: ['start', 'stop', 'suspend', 'resume', 'restart'],
              description: 'Operation to apply',
            },
            force: { type: 'boolean', description: 'Force the operation' },
          },
          required: ['targetVMs', 'operation'],
        },
      },
      {
        name: 'setHostname',
        description: 'Set the hostname of a VM',
        inputSchema: {
          type: 'object',
          properties: {
            vmId: { type: 'string', description: 'VM ID or name' },
            hostname: { type: 'string', description: 'Hostname to set' },
          },
          required: ['vmId', 'hostname'],
        },
      },
    ];

    // Register tool list handler
    this.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));

    // Create and configure tool router
    const toolRouter = new ToolRouter();

    // Register all tool handlers with the router
    toolRouter.registerTool('listVMs', handleListVMs);
    toolRouter.registerTool('createVM', handleCreateVM);
    toolRouter.registerTool('startVM', handleStartVM);
    toolRouter.registerTool('stopVM', handleStopVM);
    toolRouter.registerTool('deleteVM', handleDeleteVM);
    toolRouter.registerTool('takeSnapshot', handleTakeSnapshot);
    toolRouter.registerTool('restoreSnapshot', handleRestoreSnapshot);
    toolRouter.registerTool('listSnapshots', handleListSnapshots);
    toolRouter.registerTool('takeScreenshot', handleTakeScreenshot);
    toolRouter.registerTool('createTerminalSession', handleCreateTerminalSession);
    toolRouter.registerTool('manageSshAuth', handleManageSshAuth);
    toolRouter.registerTool('batchOperation', handleBatchOperation);
    toolRouter.registerTool('setHostname', handleSetHostname);

    // Register the router with the server
    toolRouter.registerWithServer(this.server);
  }
}

/**
 * Test utilities
 */
export class TestUtils {
  /**
   * Create a valid VM UUID
   */
  static createUuid(): string {
    const hex = () => Math.floor(Math.random() * 16).toString(16);
    const segment = (length: number) => Array(length).fill(0).map(hex).join('');

    return `{${segment(8)}-${segment(4)}-${segment(4)}-${segment(4)}-${segment(12)}}`;
  }

  /**
   * Create test VM data
   */
  static createTestVm(
    overrides: Partial<{
      uuid: string;
      name: string;
      status: string;
      ipAddress?: string;
    }> = {}
  ) {
    return {
      uuid: TestUtils.createUuid(),
      name: `test-vm-${Date.now()}`,
      status: 'stopped',
      ...overrides,
    };
  }

  /**
   * Create test snapshot data
   */
  static createTestSnapshot(
    overrides: Partial<{
      id: string;
      name: string;
      date: string;
      current?: boolean;
    }> = {}
  ) {
    return {
      id: TestUtils.createUuid(),
      name: `snapshot-${Date.now()}`,
      date: new Date().toISOString(),
      current: false,
      ...overrides,
    };
  }

  /**
   * Assert tool response is successful
   */
  static assertSuccess(result: CallToolResult) {
    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
  }

  /**
   * Assert tool response is an error
   */
  static assertError(result: CallToolResult) {
    expect(result.isError).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0].text).toContain('Error');
  }
}
