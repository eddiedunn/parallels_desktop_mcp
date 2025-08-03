# Quick Reference Guide

## Available Tools

| Tool | Description | Required Parameters |
|------|-------------|-------------------|
| `listVMs` | List all VMs | None |
| `createVM` | Create new VM | `name` |
| `startVM` | Start a VM | `vmId` |
| `stopVM` | Stop a VM | `vmId` |
| `deleteVM` | Delete a VM | `vmId` |
| `takeSnapshot` | Create snapshot | `vmId`, `name` |
| `restoreSnapshot` | Restore snapshot | `vmId`, `snapshotId` |
| `listSnapshots` | List VM snapshots | `vmId` |
| `takeScreenshot` | Capture VM screen | `vmId` |
| `createTerminalSession` | Get SSH instructions | `vmId` |
| `manageSshAuth` | Configure SSH | `vmId`, `username` |
| `batchOperation` | Batch VM operations | `targetVMs`, `operation` |

## Common Commands

### Development
```bash
npm run dev              # Start in dev mode
npm run build            # Build for production
npm start                # Run production build
```

### Testing
```bash
npm test                 # Run all tests
npm run test:unit        # Unit tests only
npm run test:coverage    # With coverage report
npm run test:watch       # Watch mode
```

### Code Quality
```bash
npm run lint             # Check code style
npm run lint:fix         # Fix style issues
npm run format           # Format with Prettier
npm run type-check       # TypeScript checking
npm run pre-commit       # All checks
```

## MCP Client Configuration

### Claude Desktop
```json
{
  "mcpServers": {
    "parallels": {
      "command": "node",
      "args": ["/path/to/parallels_desktop_mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

## Tool Usage Examples

### Basic VM Management
```javascript
// List all VMs
{ "tool": "listVMs", "arguments": {} }

// Start a VM
{ "tool": "startVM", "arguments": { "vmId": "ubuntu-dev" } }

// Stop a VM (graceful)
{ "tool": "stopVM", "arguments": { "vmId": "ubuntu-dev" } }

// Force stop a VM
{ "tool": "stopVM", "arguments": { "vmId": "ubuntu-dev", "force": true } }
```

### VM Creation
```javascript
// Create from scratch
{
  "tool": "createVM",
  "arguments": {
    "name": "ubuntu-server",
    "os": "ubuntu",
    "memory": 4096,
    "cpus": 2,
    "diskSize": 50
  }
}

// Clone from template
{
  "tool": "createVM",
  "arguments": {
    "name": "dev-clone",
    "fromTemplate": "ubuntu-template"
  }
}
```

### Snapshot Management
```javascript
// Take snapshot
{
  "tool": "takeSnapshot",
  "arguments": {
    "vmId": "ubuntu-dev",
    "name": "before-update",
    "description": "State before system update"
  }
}

// Restore snapshot
{
  "tool": "restoreSnapshot",
  "arguments": {
    "vmId": "ubuntu-dev",
    "snapshotId": "before-update"
  }
}
```

### Batch Operations
```javascript
// Start multiple VMs
{
  "tool": "batchOperation",
  "arguments": {
    "targetVMs": ["web-server", "db-server", "cache-server"],
    "operation": "start"
  }
}

// Force stop all test VMs
{
  "tool": "batchOperation",
  "arguments": {
    "targetVMs": ["test-1", "test-2", "test-3"],
    "operation": "stop",
    "force": true
  }
}
```

## Architecture Overview

```
MCP Client → MCP Server → Tool Router → Tool Handler → prlctl
```

- **Tool Router**: Single handler that routes to appropriate tool
- **Tool Handlers**: Individual modules for each tool
- **prlctl Handler**: Secure command execution and parsing

## Security Notes

- All inputs are sanitized before shell execution
- Commands use `execFile` (not `exec`) to prevent injection
- Destructive operations require confirmation
- Error messages don't expose sensitive information

## Troubleshooting

### Common Issues

1. **"prlctl: command not found"**
   - Ensure Parallels Desktop is installed
   - Check PATH includes Parallels bin directory

2. **"VM not found"**
   - Use `listVMs` to see available VMs
   - Check VM name/UUID spelling

3. **Permission errors**
   - Ensure user has Parallels Desktop permissions
   - Some operations may require admin rights

### Debug Mode

Set environment variable for verbose logging:
```bash
DEBUG=parallels-mcp npm run dev
```

## File Structure

```
src/
├── index.ts              # Entry point
├── toolRouter.ts         # Router implementation
├── prlctl-handler.ts     # Command execution
├── types.ts              # TypeScript types
└── tools/                # Tool handlers
    ├── listVMs.ts
    ├── startVM.ts
    └── ...
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.