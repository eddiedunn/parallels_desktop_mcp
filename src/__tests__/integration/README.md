# Integration Tests for MCP Parallels Desktop Server

## Overview

This directory contains comprehensive integration tests for all 12 tools in the MCP Parallels Desktop server. The tests validate complete request/response flows, error handling, concurrent operations, and real-world usage patterns.

## Test Structure

### Test Files
- `comprehensive-integration.test.ts` - Main test suite covering all tools
- `tools/vm-lifecycle.test.ts` - Existing VM lifecycle tests
- Additional test files can be added for specific workflows

### Test Utilities
- `test-utils/mcp-harness.ts` - MCP server test harness
- `test-utils/prlctl-mock.ts` - Mock for prlctl commands
- `test-utils/test-data-factory.ts` - Test data generation utilities

## Running Integration Tests

### Run All Integration Tests
```bash
npm run test:integration
```

### Run Specific Test Suite
```bash
npm run test:integration -- comprehensive-integration
```

### Run with Coverage
```bash
npm run test:integration -- --coverage
```

### Run in Watch Mode
```bash
npm run test:integration -- --watch
```

### Run in CI Mode
```bash
npm run test:ci
```

## Test Categories

### 1. Tool-Specific Tests
Each tool has dedicated test scenarios:
- **Success Scenarios**: Valid inputs, expected outputs
- **Failure Scenarios**: Error handling, edge cases
- **Validation Tests**: Input validation, boundary checks

### 2. Workflow Tests
Real-world usage patterns:
- **VM Lifecycle**: Create → Start → Snapshot → Stop → Delete
- **Disaster Recovery**: Snapshot → Failure → Restore → Verify
- **Batch Management**: Group operations on multiple VMs

### 3. Concurrent Operations
- Parallel VM starts/stops
- Concurrent snapshot operations
- Race condition handling

### 4. Security Tests
- Command injection prevention
- Input sanitization
- Permission validation

### 5. Performance Tests
- Large-scale operations (50+ VMs)
- Response time validation
- Resource usage monitoring

## Writing New Tests

### Test Template
```typescript
describe('Tool Name Integration', () => {
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
    it('should handle valid input', async () => {
      // Arrange: Set up mocks
      prlctlMock.addResponse('command', ['args'], {
        stdout: 'Success output'
      });

      // Act: Call tool
      const result = await harness.callTool('toolName', {
        param: 'value'
      });

      // Assert: Verify result
      TestUtils.assertSuccess(result);
      expect(result.content[0].text).toContain('expected text');
    });
  });
});
```

### Best Practices
1. **Use Test Data Factory**: Generate consistent test data
2. **Mock External Dependencies**: Use prlctl mock for all commands
3. **Test Both Success and Failure**: Cover all code paths
4. **Validate Side Effects**: Check mock was called correctly
5. **Clean Up After Tests**: Ensure no test pollution

## Debugging Tests

### Enable Verbose Logging
```bash
MCP_LOG_LEVEL=debug npm run test:integration
```

### Run Single Test
```bash
npm run test:integration -- -t "should create VM with default settings"
```

### Debug in VS Code
1. Set breakpoint in test or source code
2. Run "Debug Integration Tests" launch configuration
3. Step through code execution

## CI/CD Integration

### GitHub Actions
Tests run automatically on:
- Pull requests
- Push to main branch
- Nightly builds

### Coverage Requirements
- Minimum 90% line coverage
- 80% branch coverage
- 100% coverage for security-critical paths

### Test Reports
- JUnit XML reports in `test-results/`
- Coverage reports in `coverage/`
- HTML coverage report at `coverage/lcov-report/index.html`

## Maintenance

### Updating Tests
1. When adding new tools, add corresponding tests
2. Update test data factory for new scenarios
3. Add workflow tests for common use cases
4. Document any special test requirements

### Mock Maintenance
1. Keep mock responses realistic
2. Update mocks when prlctl output changes
3. Add new mock scenarios as needed
4. Version-specific mocks if required

### Performance Monitoring
1. Track test execution times
2. Investigate slow tests (>5s)
3. Optimize mock delays
4. Consider parallel execution

## Troubleshooting

### Common Issues

1. **Tests Timing Out**
   - Check mock delays
   - Verify async operations complete
   - Increase test timeout if needed

2. **Mock Not Found**
   - Ensure mock is added before tool call
   - Check command and arguments match exactly
   - Use default responses for flexibility

3. **Flaky Tests**
   - Avoid time-dependent assertions
   - Use proper async/await
   - Mock all external dependencies

4. **Coverage Gaps**
   - Run coverage report to identify gaps
   - Add tests for uncovered branches
   - Focus on error paths

## Tools Covered

1. **listVMs** - List all virtual machines
2. **createVM** - Create new VM or clone from template
3. **startVM** - Start a stopped VM
4. **stopVM** - Stop a running VM
5. **deleteVM** - Delete a VM (with confirmation)
6. **takeSnapshot** - Create VM snapshot
7. **restoreSnapshot** - Restore to snapshot
8. **listSnapshots** - List VM snapshots
9. **takeScreenshot** - Capture VM screenshot
10. **createTerminalSession** - Generate SSH instructions
11. **manageSshAuth** - Configure SSH authentication
12. **batchOperation** - Perform operations on multiple VMs

## Future Enhancements

1. **E2E Tests**: Optional tests against real Parallels
2. **Performance Benchmarks**: Track performance over time
3. **Stress Tests**: Test with extreme loads
4. **Compatibility Tests**: Multiple Parallels versions
5. **Integration Tests**: With other MCP servers