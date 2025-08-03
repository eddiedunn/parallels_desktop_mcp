import { MCPTestClient, TestUtils } from '../../test-utils/mcp-test-client';
import { PrlctlMock, MockResponseFactory } from '../../test-utils/prlctl-mock';

describe('VM Lifecycle Integration Tests', () => {
  let client: MCPTestClient;
  let prlctlMock: PrlctlMock;

  beforeEach(async () => {
    prlctlMock = new PrlctlMock();
    client = new MCPTestClient();
    await client.start({ prlctlMock });
  });

  afterEach(async () => {
    await client.stop();
  });

  describe('Complete VM lifecycle', () => {
    it('should create, start, stop, and delete a VM', async () => {
      const vmName = 'test-lifecycle-vm';
      const vmUuid = TestUtils.createUuid();

      // Step 1: Create VM
      // The args array includes the command as the first element
      prlctlMock.addResponse('create', [vmName], {
        stdout: `Creating virtual machine '${vmName}'...
The VM has been successfully created.`,
      });

      prlctlMock.addResponse('set', [vmName, '--memsize', '2048'], {
        stdout: 'Memory size set to 2048 MB',
      });

      prlctlMock.addResponse('set', [vmName, '--cpus', '2'], {
        stdout: 'Number of CPUs set to 2',
      });

      const createResult = await client.callTool('createVM', {
        name: vmName,
        memory: 2048,
        cpus: 2,
      });

      console.log('Create VM result:', JSON.stringify(createResult, null, 2));
      TestUtils.assertSuccess(createResult);
      expect(createResult.content[0].text).toContain(vmName);
      expect(createResult.content[0].text).toContain('2048MB');
      expect(createResult.content[0].text).toContain('CPUs: 2');

      // Verify prlctl was called correctly
      expect(prlctlMock.wasCalledWith('create', [vmName])).toBe(true);
      expect(prlctlMock.wasCalledWith('set', [vmName, '--memsize', '2048'])).toBe(true);
      expect(prlctlMock.wasCalledWith('set', [vmName, '--cpus', '2'])).toBe(true);

      // Step 2: List VMs to verify creation
      prlctlMock.addResponse(
        'list',
        ['--all'],
        MockResponseFactory.vmList([{ uuid: vmUuid, name: vmName, status: 'stopped' }])
      );

      const listResult = await client.callTool('listVMs', {});
      TestUtils.assertSuccess(listResult);
      expect(listResult.content[0].text).toContain(vmName);
      expect(listResult.content[0].text).toContain('stopped');

      // Step 3: Start VM
      prlctlMock.addResponse('start', [vmName], {
        stdout: `Starting the VM...
VM '${vmName}' started successfully.`,
      });

      const startResult = await client.callTool('startVM', {
        vmId: vmName,
      });

      TestUtils.assertSuccess(startResult);
      expect(startResult.content[0].text).toContain('started successfully');

      // Step 4: Stop VM
      prlctlMock.addResponse('stop', [vmName], {
        stdout: `Stopping the VM...
VM '${vmName}' stopped successfully.`,
      });

      const stopResult = await client.callTool('stopVM', {
        vmId: vmName,
      });

      TestUtils.assertSuccess(stopResult);
      expect(stopResult.content[0].text).toContain('stopped successfully');

      // Step 5: Delete VM
      prlctlMock.addResponse('delete', [vmName], {
        stdout: `Removing the VM...
VM '${vmName}' has been successfully removed.`,
      });

      const deleteResult = await client.callTool('deleteVM', {
        vmId: vmName,
        confirm: true,
      });

      TestUtils.assertSuccess(deleteResult);
      expect(deleteResult.content[0].text).toContain('successfully deleted');
    });
  });

  describe('Error handling', () => {
    it('should handle VM not found errors', async () => {
      const nonExistentVm = 'non-existent-vm';

      prlctlMock.addResponse(
        'start',
        [nonExistentVm],
        MockResponseFactory.vmNotFound(nonExistentVm)
      );

      const result = await client.callTool('startVM', {
        vmId: nonExistentVm,
      });

      TestUtils.assertError(result);
      expect(result.content[0].text).toContain('virtual machine could not be found');
    });

    it('should handle permission denied errors', async () => {
      prlctlMock.addDefaultResponse('list', MockResponseFactory.permissionDenied());

      const result = await client.callTool('listVMs', {});

      TestUtils.assertError(result);
      expect(result.content[0].text).toContain('Permission denied');
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

      // Create snapshot
      prlctlMock.addResponse('snapshot', [vmName, '--name', snapshotName], {
        stdout: `Creating snapshot '${snapshotName}'...
Snapshot has been successfully created.`,
      });

      const createSnapshotResult = await client.callTool('takeSnapshot', {
        vmId: vmName,
        name: snapshotName,
      });

      TestUtils.assertSuccess(createSnapshotResult);
      expect(createSnapshotResult.content[0].text).toContain('successfully created');

      // List snapshots
      prlctlMock.addResponse(
        'snapshot-list',
        [vmName],
        MockResponseFactory.snapshotList([
          {
            id: snapshotId,
            name: snapshotName,
            date: new Date().toISOString(),
            current: true,
          },
        ])
      );

      const listSnapshotsResult = await client.callTool('listSnapshots', {
        vmId: vmName,
      });

      TestUtils.assertSuccess(listSnapshotsResult);
      expect(listSnapshotsResult.content[0].text).toContain(snapshotName);

      // Restore snapshot
      prlctlMock.addResponse('snapshot-switch', [vmName, '--id', snapshotId], {
        stdout: `Reverting to snapshot...
Successfully reverted to snapshot '${snapshotName}'.`,
      });

      const restoreResult = await client.callTool('restoreSnapshot', {
        vmId: vmName,
        snapshotId: snapshotId,
      });

      TestUtils.assertSuccess(restoreResult);
      expect(restoreResult.content[0].text).toContain('successfully restored');
    });
  });

  describe('Batch operations', () => {
    it('should perform batch operations on multiple VMs', async () => {
      const vms = ['vm1', 'vm2', 'vm3'];

      // Mock responses for each VM
      vms.forEach((vm) => {
        prlctlMock.addResponse('start', [vm], {
          stdout: `VM '${vm}' started successfully.`,
        });
      });

      const result = await client.callTool('batchOperation', {
        targetVMs: vms,
        operation: 'start',
      });

      TestUtils.assertSuccess(result);

      // Verify all VMs were started
      vms.forEach((vm) => {
        expect(result.content[0].text).toContain(`${vm}: Success`);
        expect(prlctlMock.wasCalledWith('start', [vm])).toBe(true);
      });
    });

    it('should handle partial failures in batch operations', async () => {
      const vms = ['vm1', 'vm2', 'vm3'];

      // Mock mixed responses
      prlctlMock.addResponse('stop', ['vm1'], {
        stdout: "VM 'vm1' stopped successfully.",
      });

      prlctlMock.addResponse('stop', ['vm2'], MockResponseFactory.vmNotFound('vm2'));

      prlctlMock.addResponse('stop', ['vm3'], {
        stdout: "VM 'vm3' stopped successfully.",
      });

      const result = await client.callTool('batchOperation', {
        targetVMs: vms,
        operation: 'stop',
      });

      // Should not be marked as error if some succeed
      expect(result.isError).toBeFalsy();

      const resultText = result.content[0].text;
      expect(resultText).toContain('vm1: Success');
      expect(resultText).toContain('vm2: Failed');
      expect(resultText).toContain('vm3: Success');
      expect(resultText).toContain('2 succeeded, 1 failed');
    });
  });
});
