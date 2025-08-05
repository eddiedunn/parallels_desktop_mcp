/**
 * Cleanup functionality tests
 * 
 * Verifies that test VMs are properly tracked and cleaned up
 */

jest.mock('child_process');
jest.mock('os');

import { MCPTestHarness } from '../../test-utils/mcp-harness';
import { PrlctlMock } from '../../test-utils/prlctl-mock';
import { setupOsMocks, clearOsMocks, SystemMockPresets } from '../../test-utils/system-mocks';
import { setupTestSuite } from '../../test-utils/test-setup';

describe('Test Cleanup Functionality', () => {
  setupTestSuite();
  
  let harness: MCPTestHarness;
  let prlctlMock: PrlctlMock;

  beforeEach(async () => {
    try {
      prlctlMock = new PrlctlMock();
      harness = new MCPTestHarness();
      setupOsMocks(SystemMockPresets.standardMacUser());
    } catch (error) {
      console.error('Error in beforeEach:', error);
      throw error;
    }
  });

  afterEach(async () => {
    if (harness) {
      await harness.stop();
    }
    clearOsMocks();
  });

  describe('VM tracking', () => {
    it('should track VMs created with create command', async () => {
      await harness.start({ prlctlMock });

      const vmName = 'test-tracking-create';
      const vmId = '{12345678-1234-1234-1234-123456789012}';

      prlctlMock.addResponse('create', [vmName], {
        stdout: `Creating VM '${vmName}'...\nVM ID: ${vmId}`,
      });

      // Add default responses for VM creation flow
      prlctlMock.addDefaultResponse('list', {
        stdout: 'UUID                                     STATUS       IP_ADDR         NAME',
      });

      await harness.callTool('createVM', {
        name: vmName,
      });

      const createdVMs = harness.getCreatedVMs();
      expect(createdVMs).toContain(vmName);
    });

    it('should track VMs created with clone command', async () => {
      await harness.start({ prlctlMock });

      const vmName = 'test-tracking-clone';
      const templateName = 'ubuntu-template';
      const vmId = '{87654321-4321-4321-4321-210987654321}';

      prlctlMock.addResponse('clone', [templateName, '--name', vmName], {
        stdout: `Cloning VM from '${templateName}'...\nVM ID: ${vmId}`,
      });

      // Add default responses for VM creation flow
      prlctlMock.addDefaultResponse('list', {
        stdout: 'UUID                                     STATUS       IP_ADDR         NAME',
      });

      await harness.callTool('createVM', {
        name: vmName,
        fromTemplate: templateName,
      });

      const createdVMs = harness.getCreatedVMs();
      expect(createdVMs).toContain(vmName);
    });

    it('should track multiple VMs created in same test', async () => {
      await harness.start({ prlctlMock });

      const vms = ['vm1', 'vm2', 'vm3'];

      // Add default list response
      prlctlMock.addDefaultResponse('list', {
        stdout: 'UUID                                     STATUS       IP_ADDR         NAME',
      });

      for (const vmName of vms) {
        prlctlMock.addResponse('create', [vmName], {
          stdout: `Created VM: ${vmName}`,
        });

        await harness.callTool('createVM', {
          name: vmName,
        });
      }

      const createdVMs = harness.getCreatedVMs();
      expect(createdVMs).toHaveLength(3);
      vms.forEach(vm => expect(createdVMs).toContain(vm));
    });
  });

  describe('Cleanup on stop', () => {
    it('should clear tracked VMs when using mock', async () => {
      await harness.start({ prlctlMock });

      const vmName = 'test-cleanup-mock';
      prlctlMock.addResponse('create', [vmName], {
        stdout: `Created VM: ${vmName}`,
      });

      // Add default list response
      prlctlMock.addDefaultResponse('list', {
        stdout: 'UUID                                     STATUS       IP_ADDR         NAME',
      });

      await harness.callTool('createVM', {
        name: vmName,
      });

      expect(harness.getCreatedVMs()).toContain(vmName);

      await harness.stop();

      // After stop, a new harness should have no tracked VMs
      const newHarness = new MCPTestHarness();
      await newHarness.start({ prlctlMock: new PrlctlMock() });
      expect(newHarness.getCreatedVMs()).toHaveLength(0);
      await newHarness.stop();
    });
  });

  describe('Error scenarios', () => {
    it('should handle cleanup when no VMs created', async () => {
      await harness.start({ prlctlMock });
      
      // No VMs created
      expect(harness.getCreatedVMs()).toHaveLength(0);
      
      // Should not throw
      await expect(harness.stop()).resolves.toBeUndefined();
    });

    it('should continue tracking even if VM creation fails', async () => {
      await harness.start({ prlctlMock });

      const successVM = 'success-vm';
      const failVM = 'fail-vm';

      // Add default list response
      prlctlMock.addDefaultResponse('list', {
        stdout: 'UUID                                     STATUS       IP_ADDR         NAME',
      });

      prlctlMock.addResponse('create', [successVM], {
        stdout: `Created VM: ${successVM}`,
      });

      prlctlMock.addResponse('create', [failVM], {
        stderr: 'Failed to create VM',
        shouldFail: true,
      });

      await harness.callTool('createVM', { name: successVM });
      
      await harness.callTool('createVM', { name: failVM });

      // Both VMs should be tracked (in case partial creation occurred)
      const createdVMs = harness.getCreatedVMs();
      expect(createdVMs).toContain(successVM);
      expect(createdVMs).toContain(failVM);
    });
  });
});