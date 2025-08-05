/**
 * Common Test Patterns and Helpers
 * 
 * This module provides reusable test patterns and helper functions
 * to reduce duplication and complexity across the test suite.
 */

import { MCPTestHarness, TestUtils } from './mcp-harness';
import { PrlctlMock, MockResponseFactory } from './prlctl-mock';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Common VM operation test scenarios
 */
export class VMTestScenarios {
  /**
   * Test a basic VM lifecycle (create -> start -> stop -> delete)
   */
  static async testBasicLifecycle(
    harness: MCPTestHarness,
    prlctlMock: PrlctlMock,
    vmName: string
  ): Promise<void> {
    const vmId = TestUtils.createUuid();

    // Setup responses
    prlctlMock.addResponse('create', [vmName], {
      stdout: `VM '${vmName}' created with ID: ${vmId}`,
    });

    prlctlMock.addResponse('start', [vmName], {
      stdout: `VM '${vmName}' started successfully`,
    });

    prlctlMock.addResponse('stop', [vmName], {
      stdout: `VM '${vmName}' stopped successfully`,
    });

    prlctlMock.addResponse('delete', [vmName], {
      stdout: `VM '${vmName}' deleted successfully`,
    });

    // Execute lifecycle
    const createResult = await harness.callTool('createVM', { name: vmName });
    TestUtils.assertSuccess(createResult);

    const startResult = await harness.callTool('startVM', { vmId: vmName });
    TestUtils.assertSuccess(startResult);

    const stopResult = await harness.callTool('stopVM', { vmId: vmName });
    TestUtils.assertSuccess(stopResult);

    const deleteResult = await harness.callTool('deleteVM', { vmId: vmName, confirm: true });
    TestUtils.assertSuccess(deleteResult);
  }

  /**
   * Test VM creation with configuration
   */
  static async testVMWithConfiguration(
    harness: MCPTestHarness,
    prlctlMock: PrlctlMock,
    options: {
      vmName: string;
      memory?: number;
      cpus?: number;
      diskSize?: number;
      setHostname?: boolean;
      createUser?: boolean;
      enableSshAuth?: boolean;
    }
  ): Promise<CallToolResult> {
    const vmId = TestUtils.createUuid();
    const { vmName, memory, cpus, diskSize, setHostname, createUser, enableSshAuth } = options;

    // Base VM creation
    prlctlMock.addResponse('create', [vmName], {
      stdout: `VM '${vmName}' created with ID: ${vmId}`,
    });

    // Hardware configuration
    if (memory) {
      prlctlMock.addResponse('set', [vmName, '--memsize', memory.toString()], {
        stdout: `Memory set to ${memory} MB`,
      });
    }

    if (cpus) {
      prlctlMock.addResponse('set', [vmName, '--cpus', cpus.toString()], {
        stdout: `CPUs set to ${cpus}`,
      });
    }

    if (diskSize) {
      prlctlMock.addResponse('set', [vmName, '--device-add', 'hdd', '--size', `${diskSize}G`], {
        stdout: `Disk added with size ${diskSize}GB`,
      });
    }

    // Post-creation configuration
    if (setHostname || createUser || enableSshAuth) {
      // VM status checks
      prlctlMock.addResponse(
        'list',
        ['--all'],
        MockResponseFactory.vmList([{ uuid: vmId, name: vmName, status: 'stopped' }])
      );

      // Start VM
      prlctlMock.addResponse('start', [vmName], {
        stdout: 'VM started',
      });

      // VM running status
      prlctlMock.addResponse(
        'list',
        ['--all'],
        MockResponseFactory.vmList([
          { uuid: vmId, name: vmName, status: 'running', ipAddress: '10.211.55.10' },
        ])
      );

      // Configuration commands
      if (setHostname) {
        prlctlMock.addResponse('exec', [vmName, 'hostnamectl', 'set-hostname', vmName], {
          stdout: '',
        });
        prlctlMock.addResponse('exec', [vmName, 'hostname'], {
          stdout: vmName,
        });
      }

      if (createUser || enableSshAuth) {
        // Default responses for user/SSH setup
        prlctlMock.addDefaultResponse('exec', { stdout: '' });
      }

      // Stop VM
      prlctlMock.addResponse('stop', [vmName], {
        stdout: 'VM stopped',
      });
    }

    return harness.callTool('createVM', {
      name: vmName,
      memory,
      cpus,
      diskSize,
      setHostname,
      createUser,
      enableSshAuth,
    });
  }

  /**
   * Test batch operations on multiple VMs
   */
  static async testBatchOperation(
    harness: MCPTestHarness,
    prlctlMock: PrlctlMock,
    vmNames: string[],
    operation: 'start' | 'stop' | 'suspend' | 'resume' | 'restart',
    expectedFailures: string[] = []
  ): Promise<CallToolResult> {
    // Setup responses for each VM
    vmNames.forEach((vm) => {
      if (expectedFailures.includes(vm)) {
        prlctlMock.addResponse(operation, [vm], MockResponseFactory.vmNotFound(vm));
      } else {
        prlctlMock.addResponse(operation, [vm], {
          stdout: `VM '${vm}' ${operation} completed successfully`,
        });
      }
    });

    return harness.callTool('batchOperation', {
      targetVMs: vmNames,
      operation,
    });
  }

  /**
   * Test snapshot workflow (create -> list -> restore)
   */
  static async testSnapshotWorkflow(
    harness: MCPTestHarness,
    prlctlMock: PrlctlMock,
    vmName: string,
    snapshotName: string
  ): Promise<void> {
    const snapshotId = TestUtils.createUuid();

    // Create snapshot
    prlctlMock.addResponse('snapshot', [vmName, '--name', snapshotName], {
      stdout: `Snapshot '${snapshotName}' created with ID: ${snapshotId}`,
    });

    const createResult = await harness.callTool('takeSnapshot', {
      vmId: vmName,
      name: snapshotName,
    });
    TestUtils.assertSuccess(createResult);

    // List snapshots
    prlctlMock.addResponse(
      'snapshot-list',
      [vmName],
      MockResponseFactory.snapshotList([
        { id: snapshotId, name: snapshotName, date: new Date().toISOString(), current: true },
      ])
    );

    const listResult = await harness.callTool('listSnapshots', { vmId: vmName });
    TestUtils.assertSuccess(listResult);
    expect(listResult.content[0].text).toContain(snapshotName);

    // Restore snapshot
    prlctlMock.addResponse('snapshot-switch', [vmName, '--id', snapshotId], {
      stdout: 'Successfully restored to snapshot',
    });

    const restoreResult = await harness.callTool('restoreSnapshot', {
      vmId: vmName,
      snapshotId,
    });
    TestUtils.assertSuccess(restoreResult);
  }
}

/**
 * Common error scenario helpers
 */
export class ErrorScenarios {
  /**
   * Test permission denied error
   */
  static async testPermissionDenied(
    harness: MCPTestHarness,
    prlctlMock: PrlctlMock,
    toolName: string,
    args: any,
    command: string,
    commandArgs: string[]
  ): Promise<void> {
    prlctlMock.addResponse(command, commandArgs, MockResponseFactory.permissionDenied());
    const result = await harness.callTool(toolName, args);
    TestUtils.assertError(result, 'Permission denied');
  }

  /**
   * Test VM not found error
   */
  static async testVMNotFound(
    harness: MCPTestHarness,
    prlctlMock: PrlctlMock,
    toolName: string,
    vmId: string
  ): Promise<void> {
    prlctlMock.addResponse('list', ['--info', vmId], MockResponseFactory.vmNotFound(vmId));
    const result = await harness.callTool(toolName, { vmId });
    TestUtils.assertError(result, 'could not be found');
  }

  /**
   * Test invalid input validation
   */
  static async testInvalidInput(
    harness: MCPTestHarness,
    toolName: string,
    invalidArgs: any,
    expectedError: string
  ): Promise<void> {
    const result = await harness.callTool(toolName, invalidArgs);
    TestUtils.assertError(result, expectedError);
  }
}

/**
 * Common assertion helpers
 */
export class TestAssertions {
  /**
   * Assert VM list contains expected VMs
   */
  static assertVMList(result: CallToolResult, expectedVMs: string[]): void {
    TestUtils.assertSuccess(result);
    const responseText = result.content[0].text;
    expectedVMs.forEach((vm) => {
      expect(responseText).toContain(vm);
    });
  }

  /**
   * Assert batch operation results
   */
  static assertBatchResults(
    result: CallToolResult,
    totalVMs: number,
    successCount: number
  ): void {
    const responseText = result.content[0].text;
    expect(responseText).toContain(`Successful: ${successCount}`);
    expect(responseText).toContain(`Failed: ${totalVMs - successCount}`);
  }

  /**
   * Assert configuration summary
   */
  static assertConfigurationSummary(
    result: CallToolResult,
    totalSteps: number,
    completedSteps: number
  ): void {
    const responseText = result.content[0].text;
    expect(responseText).toContain(
      `Configuration Summary: ${completedSteps}/${totalSteps} steps completed`
    );
  }

  /**
   * Assert tool was called with expected arguments
   */
  static assertToolCalled(
    prlctlMock: PrlctlMock,
    command: string,
    args: string[],
    times: number = 1
  ): void {
    const calls = prlctlMock.getCallHistory().filter(
      (call) => call.command === command && JSON.stringify(call.args) === JSON.stringify(args)
    );
    expect(calls).toHaveLength(times);
  }
}

/**
 * Test data generators for consistent test data
 */
export class TestDataGenerators {
  private static vmCounter = 0;
  private static snapshotCounter = 0;

  /**
   * Generate unique VM name
   */
  static generateVMName(prefix: string = 'test-vm'): string {
    return `${prefix}-${++this.vmCounter}-${Date.now()}`;
  }

  /**
   * Generate unique snapshot name
   */
  static generateSnapshotName(prefix: string = 'snapshot'): string {
    return `${prefix}-${++this.snapshotCounter}-${Date.now()}`;
  }

  /**
   * Generate VM list for testing
   */
  static generateVMList(count: number, overrides: { [index: number]: Partial<any> } = {}): any[] {
    return Array.from({ length: count }, (_, i) => {
      const defaultVM = {
        uuid: TestUtils.createUuid(),
        name: this.generateVMName(`vm-${i}`),
        status: ['running', 'stopped', 'suspended'][i % 3],
        ipAddress: i % 3 === 0 ? `10.211.55.${10 + i}` : undefined,
      };
      
      return overrides[i] ? { ...defaultVM, ...overrides[i] } : defaultVM;
    });
  }

  /**
   * Reset counters (use in afterEach)
   */
  static reset(): void {
    this.vmCounter = 0;
    this.snapshotCounter = 0;
  }
}

/**
 * Performance test helpers
 */
export class PerformanceHelpers {
  /**
   * Measure operation duration
   */
  static async measureDuration<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const startTime = Date.now();
    const result = await operation();
    const duration = Date.now() - startTime;
    return { result, duration };
  }

  /**
   * Assert operation completes within time limit
   */
  static async assertPerformance<T>(
    operation: () => Promise<T>,
    maxDurationMs: number,
    _description: string
  ): Promise<T> {
    const { result, duration } = await this.measureDuration(operation);
    expect(duration).toBeLessThan(maxDurationMs);
    return result;
  }
}

/**
 * Concurrent operation helpers
 */
export class ConcurrencyHelpers {
  /**
   * Run multiple operations concurrently and validate results
   */
  static async runConcurrent<T>(
    operations: Array<() => Promise<T>>,
    validateResult: (result: T, index: number) => void
  ): Promise<T[]> {
    const results = await Promise.all(operations.map((op) => op()));
    results.forEach((result, index) => validateResult(result, index));
    return results;
  }

  /**
   * Test concurrent VM operations
   */
  static async testConcurrentVMOperations(
    harness: MCPTestHarness,
    prlctlMock: PrlctlMock,
    vmNames: string[],
    operation: string,
    args: (vmName: string) => any
  ): Promise<CallToolResult[]> {
    // Setup mock responses for all VMs
    vmNames.forEach((vm) => {
      prlctlMock.addResponse(operation, [vm], {
        stdout: `${operation} completed for ${vm}`,
        delay: 50, // Simulate processing time
      });
    });

    // Execute operations concurrently
    const operations = vmNames.map((vm) => () => harness.callTool(operation, args(vm)));
    
    return this.runConcurrent(operations, (result) => {
      TestUtils.assertSuccess(result);
    });
  }
}

/**
 * Integration test scenario builder
 */
export class ScenarioBuilder {
  private steps: Array<() => Promise<void>> = [];
  private harness: MCPTestHarness;
  private prlctlMock: PrlctlMock;

  constructor(harness: MCPTestHarness, prlctlMock: PrlctlMock) {
    this.harness = harness;
    this.prlctlMock = prlctlMock;
  }

  /**
   * Add a step to the scenario
   */
  addStep(description: string, step: () => Promise<void>): ScenarioBuilder {
    this.steps.push(async () => {
      console.log(`  Step: ${description}`);
      await step();
    });
    return this;
  }

  /**
   * Execute all steps in sequence
   */
  async execute(): Promise<void> {
    for (const step of this.steps) {
      await step();
    }
  }

  /**
   * Get harness for use in steps
   */
  getHarness(): MCPTestHarness {
    return this.harness;
  }

  /**
   * Get prlctl mock for use in steps
   */
  getPrlctlMock(): PrlctlMock {
    return this.prlctlMock;
  }

  /**
   * Common scenario: Create and configure VM
   */
  static createAndConfigureVM(
    harness: MCPTestHarness,
    prlctlMock: PrlctlMock,
    vmName: string
  ): ScenarioBuilder {
    const builder = new ScenarioBuilder(harness, prlctlMock);
    return builder
      .addStep('Create VM', async () => {
        const result = await VMTestScenarios.testVMWithConfiguration(
          harness, 
          prlctlMock, 
          {
            vmName,
            memory: 2048,
            cpus: 2,
            setHostname: true,
            createUser: true,
            enableSshAuth: true,
          }
        );
        TestUtils.assertSuccess(result);
      })
      .addStep('Verify configuration', async () => {
        // Add verification logic
      });
  }
}