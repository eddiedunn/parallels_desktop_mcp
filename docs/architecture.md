# Architecture Overview

This document describes the architecture of the Parallels Desktop MCP Server, focusing on the tool router pattern that ensures reliable and maintainable tool management.

## Core Architecture

The server follows a modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                   MCP Client (Claude)                    │
└────────────────────────┬────────────────────────────────┘
                         │ MCP Protocol
┌────────────────────────▼────────────────────────────────┐
│                    MCP Server Core                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │                 Tool Router                       │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐ │  │
│  │  │  Handler 1 │  │  Handler 2 │  │  Handler N │ │  │
│  │  └────────────┘  └────────────┘  └────────────┘ │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ execFile
┌────────────────────────▼────────────────────────────────┐
│                    prlctl (Parallels CLI)                │
└─────────────────────────────────────────────────────────┘
```

## The Tool Router Pattern

### Problem It Solves

In the MCP SDK, each call to `server.setRequestHandler(CallToolRequestSchema, handler)` overwrites the previous handler. This means only the last registered tool handler would work, making it impossible to have multiple tools in a straightforward implementation.

### Solution

The **Tool Router Pattern** solves this by creating a single handler that routes requests to the appropriate tool handler based on the tool name.

```typescript
// toolRouter.ts
export class ToolRouter {
  private handlers: Map<string, ToolHandler> = new Map();

  registerTool(toolName: string, handler: ToolHandler): void {
    this.handlers.set(toolName, handler);
  }

  registerWithServer(server: Server): void {
    // Single handler that routes to appropriate tool
    server.setRequestHandler(CallToolRequestSchema, (request) => {
      const toolName = request.params.name;
      const handler = this.handlers.get(toolName);
      
      if (!handler) {
        throw new Error(`Unknown tool: ${toolName}`);
      }
      
      return handler(request);
    });
  }
}
```

### Benefits

1. **Single Point of Registration**: Only one CallToolRequestSchema handler is registered with the server
2. **Scalability**: Easy to add new tools without modifying the core routing logic
3. **Isolation**: Each tool handler is independent and can be tested in isolation
4. **Type Safety**: Full TypeScript support with proper typing for handlers
5. **Maintainability**: Clear separation between routing logic and tool implementation

## Directory Structure

```
src/
├── index.ts                 # Server entry point and tool registration
├── toolRouter.ts            # Tool router implementation
├── prlctl-handler.ts        # Core prlctl command execution and parsing
├── types.ts                 # TypeScript type definitions
└── tools/                   # Individual tool handlers
    ├── listVMs.ts
    ├── createVM.ts
    ├── startVM.ts
    ├── stopVM.ts
    ├── deleteVM.ts
    ├── takeSnapshot.ts
    ├── restoreSnapshot.ts
    ├── listSnapshots.ts
    ├── takeScreenshot.ts
    ├── createTerminalSession.ts
    ├── manageSshAuth.ts
    └── batchOperation.ts
```

## Tool Handler Structure

Each tool handler follows a consistent pattern:

```typescript
// Example: tools/listVMs.ts
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { executePrlctl, parseVmList } from '../prlctl-handler.js';

export async function handleListVMs(request: CallToolRequest) {
  try {
    // 1. Validate input (if needed)
    // 2. Execute prlctl command
    const result = await executePrlctl(['list', '--all']);
    
    // 3. Parse output
    const vms = parseVmList(result.stdout);
    
    // 4. Return formatted response
    return {
      content: [{
        type: 'text',
        text: formatVmList(vms)
      }]
    };
  } catch (error) {
    // 5. Handle errors consistently
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}`
      }],
      isError: true
    };
  }
}
```

## Security Architecture

### Input Sanitization

All user inputs that could be passed to shell commands are sanitized:

```typescript
export function sanitizeVmIdentifier(input: string): string {
  // Remove any characters that could be used for command injection
  return input.replace(/[;&|`$()<>\n\r]/g, '');
}
```

### Command Execution

Commands are executed using `execFile` instead of `exec` to prevent shell injection:

```typescript
export async function executePrlctl(args: string[]): Promise<PrlctlResult> {
  return new Promise((resolve, reject) => {
    execFile('prlctl', args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      // Safe execution without shell interpretation
    });
  });
}
```

### Validation

Input validation using Zod schemas ensures type safety and prevents malformed inputs:

```typescript
const createVmSchema = z.object({
  name: z.string().min(1).max(255),
  memory: z.number().min(512).max(65536).optional(),
  cpus: z.number().min(1).max(32).optional(),
  // ... other validations
});
```

## Adding New Tools

To add a new tool to the server:

1. **Create the handler** in `src/tools/newTool.ts`:
   ```typescript
   export async function handleNewTool(request: CallToolRequest) {
     // Implementation
   }
   ```

2. **Import and register** in `src/index.ts`:
   ```typescript
   import { handleNewTool } from './tools/newTool.js';
   
   // In the tools array
   {
     name: 'newTool',
     description: 'Description of the new tool',
     inputSchema: { /* schema */ }
   }
   
   // Register with router
   toolRouter.registerTool('newTool', handleNewTool);
   ```

3. **Add tests** in `src/__tests__/unit/tools/newTool.test.ts`

4. **Update documentation** in README.md

## Error Handling

The architecture implements consistent error handling:

1. **Tool Level**: Each tool handler catches and formats its own errors
2. **Router Level**: Unknown tools are caught and reported
3. **Server Level**: Unhandled errors are caught and logged
4. **Process Level**: Unhandled rejections trigger graceful shutdown

```typescript
// Consistent error response format
{
  content: [{
    type: 'text',
    text: `Error: ${error.message}`
  }],
  isError: true
}
```

## Testing Architecture

The testing strategy ensures reliability at multiple levels:

### Unit Tests
- Test individual functions in isolation
- Mock external dependencies (prlctl)
- Focus on edge cases and error conditions

### Integration Tests
- Test tool handlers with mocked prlctl
- Verify complete request/response cycles
- Test interaction between components

### Security Tests
- Verify input sanitization
- Test command injection prevention
- Validate error message safety

See [Testing Guide](./testing-guide.md) for detailed testing documentation.

## Future Improvements

1. **Plugin System**: Allow dynamic tool loading
2. **Middleware**: Add request/response interceptors
3. **Metrics**: Add performance monitoring
4. **Caching**: Cache frequently accessed VM information
5. **WebSocket Support**: Real-time VM status updates