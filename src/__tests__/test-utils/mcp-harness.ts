import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListToolsRequestSchema, CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { PrlctlMock } from './prlctl-mock';
import * as childProcess from 'child_process';

export interface TestHarnessOptions {
  prlctlMock?: PrlctlMock;
}

/**
 * Test harness for MCP server testing
 */
export class MCPTestHarness {
  private server!: Server;
  private clientTransport!: InMemoryTransport;
  private serverTransport!: InMemoryTransport;
  private prlctlMock?: PrlctlMock;
  private initialized = false;
  private static mockedExecFile?: jest.SpyInstance;

  async start(options: TestHarnessOptions = {}) {
    console.log('[MCPTestHarness] Starting...');
    this.prlctlMock = options.prlctlMock;

    // Mock child_process.execFile if prlctl mock is provided
    if (this.prlctlMock) {
      console.log('[MCPTestHarness] Setting up prlctl mock...');
      // Clean up any existing mock first
      if (MCPTestHarness.mockedExecFile) {
        MCPTestHarness.mockedExecFile.mockRestore();
        MCPTestHarness.mockedExecFile = undefined;
      }


      // Mock execFile directly with proper typing
      MCPTestHarness.mockedExecFile = jest.spyOn(childProcess, 'execFile').mockImplementation(((
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

        this.prlctlMock!.execute(args as string[])
          .then((result) => actualCallback(null, result.stdout, result.stderr))
          .catch((error) => actualCallback(error));

        return null as any;
      }) as any);
    }

    console.log('[MCPTestHarness] Creating transports...');
    // Create bidirectional transports
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    this.clientTransport = clientTransport;
    this.serverTransport = serverTransport;

    // Start the transports
    await this.clientTransport.start();
    await this.serverTransport.start();

    console.log('[MCPTestHarness] Creating server...');
    // Create and configure server
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

    console.log('[MCPTestHarness] Registering tools...');
    // Import and register all tools (dynamic import to avoid circular dependencies)
    await this.registerTools();

    console.log('[MCPTestHarness] Connecting server to transport...');
    // Connect server to transport
    await this.server.connect(this.serverTransport);

    console.log('[MCPTestHarness] Initializing connection...');
    // Initialize the connection
    await this.initialize();

    console.log('[MCPTestHarness] Start complete');
    this.initialized = true;
  }

  async stop() {
    if (this.initialized) {
      await this.server.close();
      this.initialized = false;
    }

    // Clean up static mock
    if (MCPTestHarness.mockedExecFile) {
      MCPTestHarness.mockedExecFile.mockRestore();
      MCPTestHarness.mockedExecFile = undefined;
    }

    // Restore all mocks
    jest.restoreAllMocks();
  }

  /**
   * Initialize MCP connection
   */
  private async initialize() {
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      },
    };

    await this.sendRequest(request);
  }

  /**
   * Call a tool with given arguments
   */
  async callTool(name: string, args: any): Promise<CallToolResult> {
    if (!this.initialized) {
      throw new Error('Harness not initialized. Call start() first.');
    }

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    };

    const response = await this.sendRequest(request);
    return response.result as CallToolResult;
  }

  /**
   * List available tools
   */
  async listTools(): Promise<Tool[]> {
    if (!this.initialized) {
      throw new Error('Harness not initialized. Call start() first.');
    }

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
      params: {},
    };

    const response = await this.sendRequest(request);
    return response.result.tools;
  }

  /**
   * Get the mock instance for assertions
   */
  getMock(): PrlctlMock | undefined {
    return this.prlctlMock;
  }

  /**
   * Send raw request and get response
   */
  private async sendRequest(request: any): Promise<any> {
    const timeout = 5000; // 5 second timeout
    const startTime = Date.now();

    // Send the request
    await this.clientTransport.send(request);

    // Wait for response with proper promise handling
    while (Date.now() - startTime < timeout) {
      // Give server time to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      // The server sends responses back through the transport
      // We need to check if there's a handler set for messages
      const response = await this.waitForResponse(request.id, 100);
      if (response) {
        if (response.error) {
          throw new Error(response.error.message);
        }
        return response;
      }
    }

    throw new Error(`Request timeout after ${timeout}ms waiting for response to ${request.method}`);
  }

  private waitForResponse(requestId: number, timeoutMs: number): Promise<any | null> {
    return new Promise((resolve) => {
      let resolved = false;

      // Set up a one-time message handler
      const originalHandler = (this.clientTransport as any).handler;
      (this.clientTransport as any).handler = (message: any) => {
        if (message.id === requestId && !resolved) {
          resolved = true;
          (this.clientTransport as any).handler = originalHandler;
          resolve(message);
        } else if (originalHandler) {
          originalHandler(message);
        }
      };

      // Timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          (this.clientTransport as any).handler = originalHandler;
          resolve(null);
        }
      }, timeoutMs);
    });
  }

  /**
   * Register all tool handlers
   */
  private async registerTools() {
    console.log('[MCPTestHarness] Starting tool imports...');
    // Dynamically import tool handler functions and router to avoid circular dependencies
    try {
      console.log('[MCPTestHarness] Importing tool router...');
      const { ToolRouter } = await import('../../toolRouter.js');
      console.log('[MCPTestHarness] Importing listVMs...');
      const { handleListVMs } = await import('../../tools/listVMs.js');
      console.log('[MCPTestHarness] Importing createVM...');
      const { handleCreateVM } = await import('../../tools/createVM.js');
      console.log('[MCPTestHarness] Importing startVM...');
      const { handleStartVM } = await import('../../tools/startVM.js');
      console.log('[MCPTestHarness] Importing stopVM...');
      const { handleStopVM } = await import('../../tools/stopVM.js');
      console.log('[MCPTestHarness] Importing deleteVM...');
      const { handleDeleteVM } = await import('../../tools/deleteVM.js');
      console.log('[MCPTestHarness] Importing takeSnapshot...');
      const { handleTakeSnapshot } = await import('../../tools/takeSnapshot.js');
      console.log('[MCPTestHarness] Importing restoreSnapshot...');
      const { handleRestoreSnapshot } = await import('../../tools/restoreSnapshot.js');
      console.log('[MCPTestHarness] Importing listSnapshots...');
      const { handleListSnapshots } = await import('../../tools/listSnapshots.js');
      console.log('[MCPTestHarness] Importing takeScreenshot...');
      const { handleTakeScreenshot } = await import('../../tools/takeScreenshot.js');
      console.log('[MCPTestHarness] Importing createTerminalSession...');
      const { handleCreateTerminalSession } = await import('../../tools/createTerminalSession.js');
      console.log('[MCPTestHarness] Importing manageSshAuth...');
      const { handleManageSshAuth } = await import('../../tools/manageSshAuth.js');
      console.log('[MCPTestHarness] Importing batchOperation...');
      const { handleBatchOperation } = await import('../../tools/batchOperation.js');
      console.log('[MCPTestHarness] All imports complete');

      // Register tool list handler
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
      ];

      console.log('[MCPTestHarness] Setting up tool list handler...');
      this.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));

      console.log('[MCPTestHarness] Setting up tool router...');
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

      // Register the router with the server (this creates the single CallToolRequestSchema handler)
      toolRouter.registerWithServer(this.server);
      console.log('[MCPTestHarness] All tools registered');
    } catch (error) {
      console.error('[MCPTestHarness] Error during tool registration:', error);
      throw error;
    }
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
    expect(result.content[0]).toBeDefined();

    const text = result.content[0].text;
    expect(text).toContain('Success');
    expect(text).not.toContain('Error');
  }

  /**
   * Assert tool response is an error
   */
  static assertError(result: CallToolResult, expectedError?: string) {
    expect(result.isError).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content[0]).toBeDefined();

    const text = result.content[0].text;
    expect(text).toContain('Error');

    if (expectedError) {
      expect(text).toContain(expectedError);
    }
  }
}
