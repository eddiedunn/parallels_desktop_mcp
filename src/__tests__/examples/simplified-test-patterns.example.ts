/**
 * Simplified Test Pattern Examples
 * 
 * This file demonstrates how to use the new test infrastructure
 * to write clean, maintainable tests with minimal boilerplate.
 */

import { MCPTestHarness, TestUtils } from '../test-utils/mcp-harness';
import { PrlctlMock } from '../test-utils/prlctl-mock';
import {
  VMTestScenarios,
  ErrorScenarios,
  TestAssertions,
  TestDataGenerators,
  ScenarioBuilder,
} from '../test-utils/test-patterns';
import { setupTestSuite } from '../test-utils/test-setup';

describe('Example: Simplified Test Patterns', () => {
  setupTestSuite(); // Handles all setup/teardown
  
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

  describe('Simple VM Operations', () => {
    it('should create and configure a VM with one line', async () => {
      // One line to test VM creation with full configuration
      const result = await VMTestScenarios.testVMWithConfiguration(harness, prlctlMock, {
        vmName: TestDataGenerators.generateVMName('example'),
        memory: 2048,
        cpus: 2,
        setHostname: true,
        createUser: true,
        enableSshAuth: true,
      });

      // Simple assertions
      TestAssertions.assertConfigurationSummary(result, 5, 5);
    });

    it('should test complete VM lifecycle with minimal code', async () => {
      const vmName = TestDataGenerators.generateVMName('lifecycle');
      await VMTestScenarios.testBasicLifecycle(harness, prlctlMock, vmName);
    });

    it('should test snapshot workflow easily', async () => {
      const vmName = TestDataGenerators.generateVMName('snapshot-test');
      const snapshotName = TestDataGenerators.generateSnapshotName('backup');
      
      await VMTestScenarios.testSnapshotWorkflow(
        harness,
        prlctlMock,
        vmName,
        snapshotName
      );
    });
  });

  describe('Error Handling', () => {
    it('should test permission denied with one line', async () => {
      await ErrorScenarios.testPermissionDenied(
        harness,
        prlctlMock,
        'listVMs',
        {},
        'list',
        ['--all']
      );
    });

    it('should test VM not found error easily', async () => {
      await ErrorScenarios.testVMNotFound(
        harness,
        prlctlMock,
        'startVM',
        'non-existent-vm'
      );
    });

    it('should validate invalid inputs', async () => {
      await ErrorScenarios.testInvalidInput(
        harness,
        'createVM',
        { name: 'test-vm', memory: 100 }, // Below minimum
        'Memory must be at least 512 MB'
      );
    });
  });

  describe('Batch Operations', () => {
    it('should test batch operations with expected failures', async () => {
      const vms = ['vm1', 'vm2', 'vm3', 'vm4'];
      const expectedFailures = ['vm2', 'vm4'];
      
      const result = await VMTestScenarios.testBatchOperation(
        harness,
        prlctlMock,
        vms,
        'start',
        expectedFailures
      );

      TestAssertions.assertBatchResults(result, 4, 2);
    });
  });

  describe('Complex Workflows', () => {
    it('should build complex scenarios declaratively', async () => {
      const vmName = TestDataGenerators.generateVMName('complex');
      
      await new ScenarioBuilder(harness, prlctlMock)
        .addStep('Create VM with resources', async () => {
          const result = await VMTestScenarios.testVMWithConfiguration(
            harness,
            prlctlMock,
            { vmName, memory: 4096, cpus: 4 }
          );
          TestUtils.assertSuccess(result);
        })
        .addStep('Take initial snapshot', async () => {
          await VMTestScenarios.testSnapshotWorkflow(
            harness,
            prlctlMock,
            vmName,
            'initial-state'
          );
        })
        .addStep('Configure VM', async () => {
          // Add configuration steps
        })
        .execute();
    });

    it('should use pre-built scenario for common workflows', async () => {
      const vmName = TestDataGenerators.generateVMName('dev-env');
      
      await ScenarioBuilder
        .createAndConfigureVM(harness, prlctlMock, vmName)
        .addStep('Install development tools', async () => {
          // Custom installation steps
        })
        .execute();
    });
  });

  describe('Data Generation', () => {
    it('should generate consistent test data', () => {
      // Generate unique VM names
      const vm1 = TestDataGenerators.generateVMName('test');
      const vm2 = TestDataGenerators.generateVMName('test');
      expect(vm1).not.toEqual(vm2);

      // Generate VM lists with specific properties
      const vms = TestDataGenerators.generateVMList(5, {
        0: { name: 'custom-vm-1', status: 'running' },
        2: { name: 'custom-vm-2', status: 'stopped' },
      });
      
      expect(vms).toHaveLength(5);
      expect(vms[0].name).toBe('custom-vm-1');
      expect(vms[2].name).toBe('custom-vm-2');
    });
  });
});

// Example: Testing a new tool with minimal setup
describe('Example: Testing New Tool', () => {
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

  it('should test new tool with standard patterns', async () => {
    const vmName = TestDataGenerators.generateVMName('new-tool-test');
    
    // Setup mock response
    prlctlMock.addResponse('new-command', [vmName], {
      stdout: 'Command executed successfully',
    });

    // Call tool
    const result = await harness.callTool('newTool', { vmId: vmName });

    // Assert results
    TestUtils.assertSuccess(result);
    TestAssertions.assertToolCalled(prlctlMock, 'new-command', [vmName]);
  });
});