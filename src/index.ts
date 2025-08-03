#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Import tool router and all tool handlers
import { ToolRouter } from './toolRouter.js';
import { handleListVMs } from './tools/listVMs.js';
import { handleCreateVM } from './tools/createVM.js';
import { handleStartVM } from './tools/startVM.js';
import { handleStopVM } from './tools/stopVM.js';
import { handleDeleteVM } from './tools/deleteVM.js';
import { handleTakeSnapshot } from './tools/takeSnapshot.js';
import { handleRestoreSnapshot } from './tools/restoreSnapshot.js';
import { handleListSnapshots } from './tools/listSnapshots.js';
import { handleTakeScreenshot } from './tools/takeScreenshot.js';
import { handleCreateTerminalSession } from './tools/createTerminalSession.js';
import { handleManageSshAuth } from './tools/manageSshAuth.js';
import { handleBatchOperation } from './tools/batchOperation.js';
import { handleSetHostname } from './tools/setHostname.js';

// Server metadata
const SERVER_NAME = 'parallels-desktop-mcp';
const SERVER_VERSION = '1.0.0';

async function main() {
  // Create server instance
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List all available tools
  const tools = [
    {
      name: 'listVMs',
      description: 'List all available Parallels virtual machines',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'createVM',
      description: 'Create a new VM from scratch or clone from template with integrated hostname and user configuration',
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
          setHostname: { type: 'boolean', description: 'Set hostname inside VM to match VM name (default: true)' },
          createUser: { type: 'boolean', description: 'Create user matching Mac username with passwordless sudo (default: false)' },
          enableSshAuth: { type: 'boolean', description: 'Setup SSH authentication for passwordless access (default: false)' },
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
          username: { type: 'string', description: 'Username to configure (optional)' },
          publicKeyPath: { type: 'string', description: 'Path to public key (optional)' },
          enablePasswordlessSudo: { type: 'boolean', description: 'Enable passwordless sudo' },
        },
        required: ['vmId'],
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
      description: 'Set the hostname inside a VM to match the VM name or a custom value',
      inputSchema: {
        type: 'object',
        properties: {
          vmId: { type: 'string', description: 'VM ID or name' },
          hostname: { type: 'string', description: 'Hostname to set (RFC 1123 compliant)' },
        },
        required: ['vmId', 'hostname'],
      },
    },
  ];

  // Register tools list handler
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));

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

  // Register the router with the server (this creates the single CallToolRequestSchema handler)
  toolRouter.registerWithServer(server);

  // Create transport and connect
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`${SERVER_NAME} v${SERVER_VERSION} - MCP server running`);
  console.error('Available tools:', tools.map((t) => t.name).join(', '));
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
