# Parallels Desktop MCP Server

A Model Context Protocol (MCP) server for managing Parallels Desktop virtual machines on macOS via the `prlctl` command-line tool.

## Project Status

✅ **Build Status**: All builds passing  
✅ **Security**: No vulnerabilities detected  
✅ **Code Quality**: All ESLint errors resolved  
✅ **Test Coverage**: 22.55% (up from 8.3%)

## Features

- **VM Management**: List, create, start, stop, and delete virtual machines
- **Snapshot Management**: Create, restore, and list VM snapshots
- **VM Interaction**: Capture screenshots and get terminal session instructions
- **SSH Management**: Configure SSH authentication with public key support
- **Batch Operations**: Apply operations to multiple VMs simultaneously
- **Robust Architecture**: Single tool router pattern prevents handler conflicts
- **Type Safety**: Full TypeScript support with Zod schema validation
- **Security**: Input sanitization and command injection prevention

## Prerequisites

- macOS with Parallels Desktop installed
- Node.js 18+ and npm
- `prlctl` command available in PATH (installed with Parallels Desktop)

## Installation

```bash
# Clone the repository
git clone https://github.com/eddiedunn/parallels_desktop_mcp.git
cd parallels_desktop_mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### Starting the Server

```bash
# Run in development mode
npm run dev

# Run in production mode
npm start
```

### MCP Configuration

To use this server with an MCP client (like Claude Desktop), add it to your MCP settings:

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

## Available Tools

### VM Management

- **listVMs**: List all available Parallels virtual machines
- **createVM**: Create a new VM from scratch or clone from template
- **startVM**: Start a specified VM
- **stopVM**: Stop a specified VM (with optional force)
- **deleteVM**: Delete a specified VM (requires confirmation)

### Snapshot Management

- **takeSnapshot**: Create a snapshot of a VM
- **restoreSnapshot**: Restore a VM to a specified snapshot
- **listSnapshots**: List all snapshots for a VM

### VM Interaction

- **takeScreenshot**: Capture a screenshot of a running VM
- **createTerminalSession**: Get instructions to open a terminal session to a VM

### SSH Management

- **manageSshAuth**: Configure SSH authentication for passwordless access
  - Automatically generates SSH host keys if needed
  - Adds your public SSH key to the VM
  - Optionally enables passwordless sudo

### Batch Operations

- **batchOperation**: Apply an operation to multiple VMs
  - Supported operations: start, stop, suspend, resume, restart

## Examples

### List VMs

```javascript
{
  "tool": "listVMs",
  "arguments": {}
}
```

### Create a VM

```javascript
{
  "tool": "createVM",
  "arguments": {
    "name": "test-vm",
    "os": "ubuntu",
    "memory": 4096,
    "cpus": 2,
    "diskSize": 50
  }
}
```

### Clone a VM

```javascript
{
  "tool": "createVM",
  "arguments": {
    "name": "new-vm",
    "fromTemplate": "template-vm"
  }
}
```

### Configure SSH Access

```javascript
{
  "tool": "manageSshAuth",
  "arguments": {
    "vmId": "test-vm",
    "username": "ubuntu",
    "enablePasswordlessSudo": true
  }
}
```

### Batch Stop VMs

```javascript
{
  "tool": "batchOperation",
  "arguments": {
    "targetVMs": ["vm1", "vm2", "vm3"],
    "operation": "stop",
    "force": false
  }
}
```

## Security

- All `prlctl` commands are executed using `execFile` to prevent shell injection
- Input sanitization is applied to all VM identifiers
- Destructive operations (like deleteVM) require explicit confirmation
- The server runs with the permissions of the current user

## Architecture

The server uses a **single tool router pattern** to manage all MCP tool handlers. This architecture ensures:

- **Handler Isolation**: Each tool has its own handler module
- **No Conflicts**: Single CallToolRequestSchema handler prevents overwrites
- **Easy Extension**: Add new tools by registering with the router
- **Type Safety**: Full TypeScript support throughout

See [Architecture Documentation](docs/architecture.md) for detailed information.

## Development

```bash
# Run TypeScript type checking
npm run type-check

# Run in development mode with auto-reload
npm run dev

# Run linting and auto-fix
npm run lint
npm run lint:fix

# Format code with Prettier
npm run format
npm run format:check

# Build the project
npm run build

# Run security audit
npm run security:check

# Pre-commit checks (runs format, lint, type-check, and unit tests)
npm run pre-commit
```

## Testing

The project includes comprehensive test suites with unit, integration, and end-to-end tests.

### Test Coverage Improvements

- **Current Coverage**: 22.55% (significant improvement from 8.3%)
- **Unit Tests**: Added for key tools (listVMs, startVM, stopVM)
- **Security Tests**: Command injection prevention fully tested
- **Integration Tests**: VM lifecycle and tool interaction tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run test:e2e          # End-to-end tests (requires built project)
npm run test:coverage     # Generate coverage report
npm run test:watch        # Watch mode for TDD

# Run tests in CI mode
npm run test:ci
```

### Test Structure

```
src/
├── __tests__/
│   ├── unit/                    # Unit tests (isolated components)
│   │   ├── prlctl-handler.test.ts
│   │   ├── security/
│   │   │   └── command-injection.test.ts
│   │   └── tools/
│   │       ├── listVMs.test.ts
│   │       ├── startVM.test.ts
│   │       └── stopVM.test.ts
│   ├── integration/             # Integration tests (multiple components)
│   │   └── tools/
│   │       └── vm-lifecycle.test.ts
│   └── test-utils/              # Test utilities and mocks
│       ├── prlctl-mock.ts
│       └── mcp-harness.ts
```

See [docs/testing-guide.md](docs/testing-guide.md) for detailed testing documentation.

### Pre-commit Checks

The project includes a pre-commit script that runs:

- Prettier format checking
- ESLint for code quality
- TypeScript type checking
- Unit tests

Run manually with: `npm run pre-commit`

## Contributing

Contributions are welcome! Please see our [Contributing Guidelines](docs/CONTRIBUTING.md) for details on:

- Code style and formatting
- Testing requirements
- Pull request process
- Development workflow

## License

ISC
