/**
 * VM Lifecycle Integration Tests
 *
 * Tests the complete VM lifecycle operations using direct mocking pattern
 */

// Mock modules before imports
jest.mock('os');
jest.mock('../../../prlctl-handler', () => {
  const mockExecutePrlctl = jest.fn();
  return {
    executePrlctl: mockExecutePrlctl,
    parseVmList: jest.requireActual('../../../prlctl-handler').parseVmList,
    parseSnapshotList: jest.requireActual('../../../prlctl-handler').parseSnapshotList,
    sanitizeVmIdentifier: jest.requireActual('../../../prlctl-handler').sanitizeVmIdentifier,
    isValidUuid: jest.requireActual('../../../prlctl-handler').isValidUuid,
  };
});

import { MCPTestClient, TestUtils } from '../../test-utils/mcp-test-client';
import { executePrlctl } from '../../../prlctl-handler';
import * as os from 'os';

describe('VM Lifecycle Integration Tests', () => {
  let client: MCPTestClient;
  const mockExecutePrlctl = executePrlctl as jest.MockedFunction<typeof executePrlctl>;
  const mockOs = {
    userInfo: os.userInfo as jest.Mock,
    hostname: os.hostname as jest.Mock,
    homedir: os.homedir as jest.Mock,
    platform: os.platform as jest.Mock,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Setup OS mocks
    mockOs.userInfo.mockReturnValue({
      username: 'testuser',
      uid: 501,
      gid: 20,
      shell: '/bin/zsh',
      homedir: '/Users/testuser',
    });
    mockOs.hostname.mockReturnValue('test-mac.local');
    mockOs.homedir.mockReturnValue('/Users/testuser');
    mockOs.platform.mockReturnValue('darwin');
    
    client = new MCPTestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
    jest.clearAllMocks();
  });

  describe('Complete VM lifecycle', () => {
    it('should create, start, stop, and delete a VM', async () => {
      const vmName = 'test-lifecycle-vm';
      const vmUuid = TestUtils.createUuid();
      let vmCreated = false;

      // Setup mock implementation that tracks VM state
      mockExecutePrlctl.mockImplementation(async (args) => {
        // Handle list commands
        if (args[0] === 'list' && args[1] === '--all') {
          if (!vmCreated) {
            return { stdout: 'UUID                                     STATUS       IP_ADDR         NAME', stderr: '' };
          } else {
            return {
              stdout: `UUID                                     STATUS       IP_ADDR         NAME
${vmUuid} stopped      -               ${vmName}`,
              stderr: '',
            };
          }
        }

        // Handle create command
        if (args[0] === 'create' && args[1] === vmName) {
          vmCreated = true;
          return {
            stdout: `Creating virtual machine '${vmName}'...
The VM has been successfully created.`,
            stderr: '',
          };
        }

        // Handle set commands for hardware configuration
        if (args[0] === 'set' && args[1] === vmName) {
          if (args[2] === '--memsize') {
            return { stdout: 'Memory size set to 2048 MB', stderr: '' };
          }
          if (args[2] === '--cpus') {
            return { stdout: 'Number of CPUs set to 2', stderr: '' };
          }
        }

        // Handle start command
        if (args[0] === 'start' && args[1] === vmName) {
          return {
            stdout: `Starting the VM...
VM '${vmName}' started successfully.`,
            stderr: '',
          };
        }

        // Handle stop command
        if (args[0] === 'stop' && args[1] === vmName) {
          return {
            stdout: `Stopping the VM...
VM '${vmName}' stopped successfully.`,
            stderr: '',
          };
        }

        // Handle delete command
        if (args[0] === 'delete' && args[1] === vmName) {
          vmCreated = false;
          return {
            stdout: `Removing the VM...
VM '${vmName}' has been successfully removed.`,
            stderr: '',
          };
        }

        // Default response
        console.log('Unexpected prlctl call:', args.join(' '));
        return { stdout: '', stderr: '' };
      });

      // Step 1: Create VM
      const createResult = await client.callTool('createVM', {
        name: vmName,
        memory: 2048,
        cpus: 2,
        setHostname: false,  // Disable post-creation config for this test
        createUser: false,
        enableSshAuth: false,
      });

      TestUtils.assertSuccess(createResult);
      expect(createResult.content[0].text).toContain(vmName);
      expect(createResult.content[0].text).toContain('2048MB');
      expect(createResult.content[0].text).toContain('CPUs: 2');

      // Verify prlctl was called correctly
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['list', '--all']);
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['create', vmName]);
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['set', vmName, '--memsize', '2048']);
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['set', vmName, '--cpus', '2']);

      // Step 2: List VMs to verify creation
      const listResult = await client.callTool('listVMs', {});
      TestUtils.assertSuccess(listResult);
      expect(listResult.content[0].text).toContain(vmName);
      expect(listResult.content[0].text).toContain('stopped');

      // Step 3: Start VM
      const startResult = await client.callTool('startVM', {
        vmId: vmName,
      });

      TestUtils.assertSuccess(startResult);
      expect(startResult.content[0].text).toContain('started successfully');

      // Step 4: Stop VM
      const stopResult = await client.callTool('stopVM', {
        vmId: vmName,
      });

      TestUtils.assertSuccess(stopResult);
      expect(stopResult.content[0].text).toContain('stopped successfully');

      // Step 5: Delete VM
      const deleteResult = await client.callTool('deleteVM', {
        vmId: vmName,
        confirm: true,
      });

      TestUtils.assertSuccess(deleteResult);
      expect(deleteResult.content[0].text).toContain('has been permanently deleted');
    });
  });

  describe('Error handling', () => {
    it('should handle VM not found errors', async () => {
      const nonExistentVm = 'non-existent-vm';

      mockExecutePrlctl.mockImplementation(async (args) => {
        if (args[0] === 'start' && args[1] === nonExistentVm) {
          const error: any = new Error('Command failed');
          error.stdout = '';
          error.stderr = `Failed to get VM '${nonExistentVm}' info: The virtual machine could not be found.`;
          throw error;
        }
        return { stdout: '', stderr: '' };
      });

      const result = await client.callTool('startVM', {
        vmId: nonExistentVm,
      });

      TestUtils.assertError(result);
      // The error handler doesn't include the full stderr in the response
      expect(result.content[0].text).toContain('Failed to start VM');
      expect(result.content[0].text).toContain('Command failed');
    });

    it('should handle permission denied errors', async () => {
      mockExecutePrlctl.mockImplementation(async (args) => {
        if (args[0] === 'list') {
          const error: any = new Error('Command failed');
          error.stdout = '';
          error.stderr = 'prlctl: Permission denied. Try running with sudo.';
          throw error;
        }
        return { stdout: '', stderr: '' };
      });

      const result = await client.callTool('listVMs', {});

      TestUtils.assertError(result);
      // The error handler shows a generic message
      expect(result.content[0].text).toContain('Error listing VMs');
      expect(result.content[0].text).toContain('Command failed');
    });

    it('should validate input parameters', async () => {
      // Test with invalid memory size
      const result = await client.callTool('createVM', {
        name: 'test-vm',
        memory: 100, // Below minimum of 512
      });

      TestUtils.assertError(result);
      expect(result.content[0].text).toContain('Error');
    });
  });

  describe('Snapshot management', () => {
    it('should create and restore snapshots', async () => {
      const vmName = 'snapshot-test-vm';
      const snapshotName = 'test-snapshot';
      const snapshotId = TestUtils.createUuid();

      mockExecutePrlctl.mockImplementation(async (args) => {
        // Handle snapshot creation
        if (args[0] === 'snapshot' && args[1] === vmName && args[2] === '--name') {
          return {
            stdout: `Creating snapshot '${snapshotName}'...
Snapshot has been successfully created.`,
            stderr: '',
          };
        }

        // Handle snapshot list
        if (args[0] === 'snapshot-list' && args[1] === vmName) {
          return {
            stdout: `${snapshotId} * "${snapshotName}" ${new Date().toISOString()}`,
            stderr: '',
          };
        }

        // Handle snapshot restore
        if (args[0] === 'snapshot-switch' && args[1] === vmName && args[2] === '--id') {
          return {
            stdout: `Reverting to snapshot...
Successfully reverted to snapshot '${snapshotName}'.`,
            stderr: '',
          };
        }

        return { stdout: '', stderr: '' };
      });

      // Create snapshot
      const createSnapshotResult = await client.callTool('takeSnapshot', {
        vmId: vmName,
        name: snapshotName,
      });

      TestUtils.assertSuccess(createSnapshotResult);
      expect(createSnapshotResult.content[0].text).toContain('successfully created');

      // List snapshots
      const listSnapshotsResult = await client.callTool('listSnapshots', {
        vmId: vmName,
      });

      TestUtils.assertSuccess(listSnapshotsResult);
      expect(listSnapshotsResult.content[0].text).toContain(snapshotName);

      // Restore snapshot
      const restoreResult = await client.callTool('restoreSnapshot', {
        vmId: vmName,
        snapshotId: snapshotId,
      });

      TestUtils.assertSuccess(restoreResult);
      expect(restoreResult.content[0].text).toContain('has been restored to snapshot');
    });
  });

  describe('Batch operations', () => {
    it('should perform batch operations on multiple VMs', async () => {
      const vms = ['vm1', 'vm2', 'vm3'];

      mockExecutePrlctl.mockImplementation(async (args) => {
        if (args[0] === 'start' && vms.includes(args[1])) {
          return {
            stdout: `VM '${args[1]}' started successfully.`,
            stderr: '',
          };
        }
        return { stdout: '', stderr: '' };
      });

      const result = await client.callTool('batchOperation', {
        targetVMs: vms,
        operation: 'start',
      });

      TestUtils.assertSuccess(result);

      // Verify all VMs were started
      vms.forEach((vm) => {
        expect(result.content[0].text).toContain(`**${vm}**: start completed successfully`);
        expect(mockExecutePrlctl).toHaveBeenCalledWith(['start', vm]);
      });
    });

    it('should handle partial failures in batch operations', async () => {
      const vms = ['vm1', 'vm2', 'vm3'];

      mockExecutePrlctl.mockImplementation(async (args) => {
        if (args[0] === 'stop') {
          if (args[1] === 'vm2') {
            const error: any = new Error('Command failed');
            error.stdout = '';
            error.stderr = `Failed to get VM 'vm2' info: The virtual machine could not be found.`;
            throw error;
          }
          return {
            stdout: `VM '${args[1]}' stopped successfully.`,
            stderr: '',
          };
        }
        return { stdout: '', stderr: '' };
      });

      const result = await client.callTool('batchOperation', {
        targetVMs: vms,
        operation: 'stop',
      });

      // Should not be marked as error if some succeed
      expect(result.isError).toBeFalsy();

      const resultText = result.content[0].text;
      expect(resultText).toContain('**vm1**: stop completed successfully');
      expect(resultText).toContain('**vm2**: Command failed');
      expect(resultText).toContain('**vm3**: stop completed successfully');
      expect(resultText).toContain('**Successful**: 2');
      expect(resultText).toContain('**Failed**: 1');
    });
  });
});