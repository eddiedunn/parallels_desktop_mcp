# Test Patterns Guide

This guide documents the test infrastructure patterns and helpers available for writing clean, maintainable tests in the Parallels Desktop MCP project.

## Table of Contents

1. [Overview](#overview)
2. [Test Setup](#test-setup)
3. [Common Test Patterns](#common-test-patterns)
4. [Helper Classes](#helper-classes)
5. [Best Practices](#best-practices)
6. [Examples](#examples)

## Overview

The test infrastructure provides a set of reusable patterns and helpers to:
- Reduce test code duplication
- Standardize test structure
- Simplify complex test scenarios
- Improve test maintainability

## Test Setup

### Basic Setup

All test files should use the standardized setup:

```typescript
import { setupTestSuite } from '../test-utils/test-setup';

describe('My Test Suite', () => {
  setupTestSuite(); // Handles all setup/teardown
  
  // Your tests here
});
```

### Integration Test Setup

For integration tests with MCP harness:

```typescript
import { MCPTestHarness } from '../test-utils/mcp-harness';
import { PrlctlMock } from '../test-utils/prlctl-mock';
import { setupTestSuite } from '../test-utils/test-setup';

describe('Integration Test', () => {
  setupTestSuite();
  
  let harness: MCPTestHarness;
  let prlctlMock: PrlctlMock;

  beforeEach(async () => {
    prlctlMock = new PrlctlMock();
    harness = new MCPTestHarness();
    await harness.start({ prlctlMock });
    TestDataGenerators.reset();
  });

  afterEach(async () => {
    await harness.stop();
  });
});
```

## Common Test Patterns

### VM Test Scenarios

Test common VM operations with minimal code:

```typescript
// Test VM creation with configuration
const result = await VMTestScenarios.testVMWithConfiguration(harness, prlctlMock, {
  vmName: 'test-vm',
  memory: 2048,
  cpus: 2,
  setHostname: true,
  createUser: true,
  enableSshAuth: true,
});

// Test complete VM lifecycle
await VMTestScenarios.testBasicLifecycle(harness, prlctlMock, 'vm-name');

// Test batch operations
const result = await VMTestScenarios.testBatchOperation(
  harness,
  prlctlMock,
  ['vm1', 'vm2', 'vm3'],
  'start',
  ['vm2'] // Expected failures
);

// Test snapshot workflow
await VMTestScenarios.testSnapshotWorkflow(
  harness,
  prlctlMock,
  'vm-name',
  'snapshot-name'
);
```

### Error Scenarios

Test common error conditions:

```typescript
// Test permission denied
await ErrorScenarios.testPermissionDenied(
  harness,
  prlctlMock,
  'listVMs',
  {},
  'list',
  ['--all']
);

// Test VM not found
await ErrorScenarios.testVMNotFound(harness, prlctlMock, 'startVM', 'non-existent');

// Test invalid input
await ErrorScenarios.testInvalidInput(
  harness,
  'createVM',
  { name: 'test', memory: 100 },
  'Memory must be at least 512 MB'
);
```

### Assertions

Use standardized assertions:

```typescript
// Assert VM list contains expected VMs
TestAssertions.assertVMList(result, ['vm1', 'vm2', 'vm3']);

// Assert batch operation results
TestAssertions.assertBatchResults(result, totalVMs: 4, successCount: 3);

// Assert configuration summary
TestAssertions.assertConfigurationSummary(result, totalSteps: 5, completedSteps: 5);

// Assert tool was called
TestAssertions.assertToolCalled(prlctlMock, 'start', ['vm-name']);
```

## Helper Classes

### TestDataGenerators

Generate consistent test data:

```typescript
// Generate unique VM names
const vmName = TestDataGenerators.generateVMName('prefix');

// Generate unique snapshot names
const snapshotName = TestDataGenerators.generateSnapshotName('backup');

// Generate VM lists
const vms = TestDataGenerators.generateVMList(5, {
  0: { name: 'custom-vm', status: 'running' },
  2: { status: 'stopped' }
});

// Reset counters (call in afterEach)
TestDataGenerators.reset();
```

### PerformanceHelpers

Test performance requirements:

```typescript
// Assert operation completes within time limit
const result = await PerformanceHelpers.assertPerformance(
  () => harness.callTool('listVMs', {}),
  1000, // max milliseconds
  'List VMs operation'
);

// Measure operation duration
const { result, duration } = await PerformanceHelpers.measureDuration(
  () => harness.callTool('startVM', { vmId: 'test' })
);
```

### ConcurrencyHelpers

Test concurrent operations:

```typescript
// Test concurrent VM operations
const results = await ConcurrencyHelpers.testConcurrentVMOperations(
  harness,
  prlctlMock,
  ['vm1', 'vm2', 'vm3'],
  'start',
  (vmName) => ({ vmId: vmName })
);

// Run custom concurrent operations
const results = await ConcurrencyHelpers.runConcurrent(
  [op1, op2, op3],
  (result, index) => {
    TestUtils.assertSuccess(result);
  }
);
```

### ScenarioBuilder

Build complex test scenarios declaratively:

```typescript
// Build custom scenario
await new ScenarioBuilder(harness, prlctlMock)
  .addStep('Create VM', async () => {
    // VM creation logic
  })
  .addStep('Configure VM', async () => {
    // Configuration logic
  })
  .addStep('Verify setup', async () => {
    // Verification logic
  })
  .execute();

// Use pre-built scenarios
await ScenarioBuilder
  .createAndConfigureVM(harness, prlctlMock, 'vm-name')
  .addStep('Custom step', async () => {
    // Additional logic
  })
  .execute();
```

## Best Practices

### 1. Use Data Generators

Instead of hardcoding test data:

```typescript
// ❌ Bad
const vmName = 'test-vm-1';

// ✅ Good
const vmName = TestDataGenerators.generateVMName('test');
```

### 2. Use Test Scenarios

For common workflows:

```typescript
// ❌ Bad - Manually setting up all mocks
prlctlMock.addResponse('create', [vmName], {...});
prlctlMock.addResponse('set', [vmName, '--memsize', '2048'], {...});
// ... many more lines

// ✅ Good - Use scenario helper
await VMTestScenarios.testVMWithConfiguration(harness, prlctlMock, {
  vmName,
  memory: 2048
});
```

### 3. Use Assertion Helpers

For consistent assertions:

```typescript
// ❌ Bad
expect(result.isError).toBeFalsy();
expect(result.content[0].text).toContain('Success');
expect(result.content[0].text).toContain('vm1');

// ✅ Good
TestUtils.assertSuccess(result);
TestAssertions.assertVMList(result, ['vm1']);
```

### 4. Group Related Tests

Use describe blocks effectively:

```typescript
describe('VM Operations', () => {
  describe('Success Scenarios', () => {
    // Success tests
  });

  describe('Error Scenarios', () => {
    // Error tests
  });

  describe('Edge Cases', () => {
    // Edge case tests
  });
});
```

### 5. Keep Tests Focused

Each test should verify one specific behavior:

```typescript
// ❌ Bad - Testing multiple things
it('should create VM and handle errors and validate input', async () => {
  // Too many assertions
});

// ✅ Good - Focused tests
it('should create VM with default settings', async () => {
  // Single focus
});

it('should reject invalid memory size', async () => {
  // Single focus
});
```

## Examples

### Complete Example: Testing a New Tool

```typescript
import { MCPTestHarness } from '../test-utils/mcp-harness';
import { PrlctlMock } from '../test-utils/prlctl-mock';
import { 
  VMTestScenarios, 
  ErrorScenarios, 
  TestDataGenerators 
} from '../test-utils/test-patterns';
import { setupTestSuite } from '../test-utils/test-setup';

describe('newTool', () => {
  setupTestSuite();
  
  let harness: MCPTestHarness;
  let prlctlMock: PrlctlMock;

  beforeEach(async () => {
    prlctlMock = new PrlctlMock();
    harness = new MCPTestHarness();
    await harness.start({ prlctlMock });
  });

  afterEach(async () => {
    await harness.stop();
  });

  describe('Success Scenarios', () => {
    it('should execute successfully', async () => {
      const vmName = TestDataGenerators.generateVMName('new-tool');
      
      prlctlMock.addResponse('new-command', [vmName], {
        stdout: 'Success'
      });

      const result = await harness.callTool('newTool', { vmId: vmName });

      TestUtils.assertSuccess(result);
      TestAssertions.assertToolCalled(prlctlMock, 'new-command', [vmName]);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle VM not found', async () => {
      await ErrorScenarios.testVMNotFound(
        harness, 
        prlctlMock, 
        'newTool', 
        'non-existent'
      );
    });
  });
});
```

### Unit Test Example

```typescript
describe('Tool Unit Test', () => {
  setupTestSuite();
  
  const createRequest = (args: any = {}): CallToolRequest => ({
    method: 'tools/call',
    params: { name: 'toolName', arguments: args }
  });

  it('should process request', async () => {
    const request = createRequest({ param: 'value' });
    const result = await handleTool(request);
    
    TestUtils.assertSuccess(result);
    expect(result.content[0].text).toContain('expected output');
  });
});
```

## Summary

The test patterns infrastructure provides:

1. **Reduced Boilerplate**: Common scenarios are encapsulated in helper functions
2. **Consistency**: Standardized patterns across all tests
3. **Maintainability**: Changes to test logic can be made in one place
4. **Readability**: Tests focus on behavior rather than setup
5. **Reusability**: Patterns can be shared across different test files

By following these patterns, tests become more maintainable, readable, and consistent throughout the codebase.