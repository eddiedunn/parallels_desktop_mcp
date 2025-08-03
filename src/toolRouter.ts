import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, CallToolRequest } from '@modelcontextprotocol/sdk/types.js';

// Type for tool handler functions
export type ToolHandler = (request: CallToolRequest) => Promise<any>;

// Tool router class to manage all tool handlers
export class ToolRouter {
  private handlers: Map<string, ToolHandler> = new Map();

  // Register a tool handler
  registerTool(toolName: string, handler: ToolHandler): void {
    this.handlers.set(toolName, handler);
  }

  // Register the router with the MCP server
  registerWithServer(server: Server): void {
    server.setRequestHandler(CallToolRequestSchema, (request: CallToolRequest) => {
      const toolName = request.params.name;
      const handler = this.handlers.get(toolName);

      if (!handler) {
        throw new Error(`Unknown tool: ${toolName}`);
      }

      return handler(request);
    });
  }

  // Get list of registered tool names
  getRegisteredTools(): string[] {
    return Array.from(this.handlers.keys());
  }
}
