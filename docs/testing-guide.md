# Testing Guide for MCP Parallels Desktop Server

## Current Test Status

- **Coverage**: 22.55% (improved from 8.3%)
- **Build Status**: All tests passing
- **Test Suites**: Unit, Integration, and E2E tests
- **Key Improvements**: Added tests for listVMs, startVM, stopVM tools

## Quick Start

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run test:e2e         # End-to-end tests (requires built project)
npm run test:coverage    # Generate coverage report
npm run test:watch       # Watch mode for TDD
npm run test:ci          # CI mode with coverage
```

## Test Structure

```
src/
├── __tests__/
│   ├── unit/                    # Unit tests (isolated components)
│   │   ├── prlctl-handler.test.ts
│   │   └── security/
│   │       └── command-injection.test.ts
│   ├── integration/             # Integration tests (multiple components)
│   │   └── tools/
│   │       └── vm-lifecycle.test.ts
│   └── test-utils/              # Test utilities
│       ├── prlctl-mock.ts       # Mock for prlctl commands
│       └── mcp-harness.ts       # MCP test harness
e2e/                             # End-to-end tests
├── mcp-server.e2e.test.ts
├── setup.ts
└── teardown.ts
```

## Writing Tests

### Unit Test Example

```typescript
import { sanitizeVmIdentifier } from '../../prlctl-handler';

describe('sanitizeVmIdentifier', () => {
  it('should remove dangerous characters', () => {
    const input = 'vm; rm -rf /';
    const result = sanitizeVmIdentifier(input);
    expect(result).toBe('vmrmrf');
  });
});
```

### Integration Test Example

```typescript
import { MCPTestHarness } from '../../test-utils/mcp-harness';
import { PrlctlMock } from '../../test-utils/prlctl-mock';

describe('VM Creation', () => {
  let harness: MCPTestHarness;
  let mock: PrlctlMock;

  beforeEach(async () => {
    mock = new PrlctlMock();
    harness = new MCPTestHarness();
    await harness.start({ prlctlMock: mock });
  });

  it('should create a VM', async () => {
    mock.addResponse('create', ['test-vm'], {
      stdout: 'VM created successfully'
    });

    const result = await harness.callTool('createVM', {
      name: 'test-vm'
    });

    expect(result.isError).toBe(false);
  });
});
```

## Mocking Strategies

### Mock prlctl Commands

```typescript
const mock = new PrlctlMock();

// Add specific response
mock.addResponse('list', ['--all'], {
  stdout: '{uuid} running 192.168.1.100 Test VM'
});

// Add default response for any arguments
mock.addDefaultResponse('start', {
  stdout: 'VM started successfully'
});

// Simulate errors
mock.addResponse('stop', ['vm1'], {
  shouldFail: true,
  error: 'VM not found',
  stderr: 'Error: VM not found'
});
```

### Use Mock Response Factory

```typescript
import { MockResponseFactory } from './test-utils/prlctl-mock';

// Create VM list response
mock.addResponse('list', ['--all'], 
  MockResponseFactory.vmList([
    { uuid: '{uuid}', name: 'VM1', status: 'running', ipAddress: '192.168.1.100' },
    { uuid: '{uuid2}', name: 'VM2', status: 'stopped' }
  ])
);

// Common error responses
mock.addResponse('start', ['missing-vm'],
  MockResponseFactory.vmNotFound('missing-vm')
);
```

## Security Testing

All security tests are in `src/__tests__/unit/security/`. Key areas:

1. **Command Injection**: Test input sanitization
2. **Path Traversal**: Prevent directory traversal attacks
3. **Input Validation**: Boundary testing, malformed inputs
4. **Error Handling**: No sensitive data in errors

## Coverage Status and Goals

### Current Coverage (22.55%)
- **Statements**: 22.55% (127/563)
- **Branches**: 11.3% (12/106)
- **Functions**: 17.44% (15/86)
- **Lines**: 22.68% (124/547)

### Coverage Goals
- **Short-term Goal**: 50% overall coverage
- **Long-term Goal**: 90% overall coverage
- **Critical Modules**: 100% coverage required for:
  - `prlctl-handler.ts` (security-critical)
  - Input sanitization functions
  - Command execution functions

### Check Coverage
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

### Recently Added Tests
- `listVMs.test.ts` - Complete unit test coverage
- `startVM.test.ts` - Input validation and error handling
- `stopVM.test.ts` - Force stop scenarios
- `command-injection.test.ts` - Security testing

## CI/CD Integration

Tests run automatically on:
- Push to `main` or `develop`
- Pull requests to `main`

GitHub Actions workflow includes:
- Multiple macOS versions
- Multiple Node.js versions
- Security scanning
- Coverage reporting

## Debugging Tests

### Run Single Test File
```bash
npm test -- prlctl-handler.test.ts
```

### Run Tests Matching Pattern
```bash
npm test -- --testNamePattern="should sanitize"
```

### Debug in VS Code
1. Set breakpoints in test files
2. Run "Jest: Debug Current Test File" from Command Palette
3. Or use the provided `.vscode/launch.json` configuration

## Best Practices

1. **Follow TDD**: Write tests first, then implementation
2. **Keep Tests Fast**: Target <100ms per unit test
3. **Test Behavior, Not Implementation**: Focus on outputs, not internals
4. **Use Descriptive Names**: `should [expected behavior] when [condition]`
5. **One Assertion Per Test**: Keep tests focused
6. **Mock External Dependencies**: Never call real `prlctl` in tests
7. **Clean Up After Tests**: Use `beforeEach`/`afterEach` hooks

## Troubleshooting

### Tests Timing Out
- Increase timeout: `jest.setTimeout(10000)`
- Check for missing mock responses
- Ensure async operations complete

### Mock Not Working
- Verify mock is set up before test execution
- Check exact command arguments match
- Use `mock.getCallHistory()` to debug

### Coverage Not Met
- Run `npm run test:coverage`
- Check uncovered lines in report
- Add tests for edge cases

## Adding New Tests

1. Create test file following naming convention: `*.test.ts`
2. Import necessary utilities and mocks
3. Follow existing patterns for consistency
4. Ensure new code has corresponding tests
5. Run full test suite before committing