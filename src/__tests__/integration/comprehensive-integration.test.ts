import { MCPTestHarness, TestUtils } from '../test-utils/mcp-harness';
import { PrlctlMock, MockResponseFactory } from '../test-utils/prlctl-mock';

/**
 * Comprehensive Integration Test Suite for MCP Parallels Desktop Server
 *
 * This test suite validates all 12 tools with:
 * - Complete request/response flows
 * - Success and failure scenarios
 * - Error handling and edge cases
 * - Concurrent operations
 * - Real-world usage patterns
 */

describe('MCP Parallels Desktop Comprehensive Integration Tests', () => {
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

  describe('1. listVMs Tool Integration', () => {
    describe('Success Scenarios', () => {
      it('should list all VMs with complete information', async () => {
        // Arrange
        const testVMs = [
          {
            uuid: TestUtils.createUuid(),
            name: 'ubuntu-dev',
            status: 'running',
            ipAddress: '10.211.55.10',
          },
          { uuid: TestUtils.createUuid(), name: 'windows-test', status: 'stopped' },
          { uuid: TestUtils.createUuid(), name: 'macos-build', status: 'suspended' },
        ];

        prlctlMock.addResponse('list', ['--all'], MockResponseFactory.vmList(testVMs));

        // Act
        const result = await harness.callTool('listVMs', {});

        // Assert
        TestUtils.assertSuccess(result);
        const responseText = result.content[0].text;
        expect(responseText).toContain('ubuntu-dev');
        expect(responseText).toContain('running');
        expect(responseText).toContain('10.211.55.10');
        expect(responseText).toContain('windows-test');
        expect(responseText).toContain('stopped');
        expect(responseText).toContain('macos-build');
        expect(responseText).toContain('suspended');
        expect(prlctlMock.wasCalledWith('list', ['--all'])).toBe(true);
      });

      it('should handle empty VM list gracefully', async () => {
        // Arrange
        prlctlMock.addResponse('list', ['--all'], MockResponseFactory.vmList([]));

        // Act
        const result = await harness.callTool('listVMs', {});

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain('No virtual machines found');
      });

      it('should parse VMs with special characters in names', async () => {
        // Arrange
        const specialVMs = [
          { uuid: TestUtils.createUuid(), name: 'VM with spaces', status: 'running' },
          { uuid: TestUtils.createUuid(), name: 'VM-with-dashes', status: 'stopped' },
          { uuid: TestUtils.createUuid(), name: 'VM_with_underscores', status: 'running' },
        ];

        prlctlMock.addResponse('list', ['--all'], MockResponseFactory.vmList(specialVMs));

        // Act
        const result = await harness.callTool('listVMs', {});

        // Assert
        TestUtils.assertSuccess(result);
        const responseText = result.content[0].text;
        expect(responseText).toContain('VM with spaces');
        expect(responseText).toContain('VM-with-dashes');
        expect(responseText).toContain('VM_with_underscores');
      });
    });

    describe('Failure Scenarios', () => {
      it('should handle permission denied errors', async () => {
        // Arrange
        prlctlMock.addResponse('list', ['--all'], MockResponseFactory.permissionDenied());

        // Act
        const result = await harness.callTool('listVMs', {});

        // Assert
        TestUtils.assertError(result, 'Permission denied');
      });

      it('should handle malformed prlctl output', async () => {
        // Arrange
        prlctlMock.addResponse('list', ['--all'], {
          stdout: 'CORRUPTED OUTPUT @#$%^&*',
        });

        // Act
        const result = await harness.callTool('listVMs', {});

        // Assert
        // Should degrade gracefully
        expect(result.content[0].text).toBeDefined();
      });
    });
  });

  describe('2. createVM Tool Integration', () => {
    describe('Success Scenarios', () => {
      it('should create VM with default settings', async () => {
        // Arrange
        const vmName = 'test-default-vm';
        prlctlMock.addResponse('create', [vmName], {
          stdout: `Creating virtual machine '${vmName}'...\nThe VM has been successfully created.`,
        });

        // Act
        const result = await harness.callTool('createVM', { name: vmName });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain('successfully created');
        expect(result.content[0].text).toContain(vmName);
      });

      it('should create VM with custom resources', async () => {
        // Arrange
        const vmName = 'test-custom-vm';
        const memory = 4096;
        const cpus = 4;
        const diskSize = 100;

        prlctlMock.addResponse('create', [vmName], {
          stdout: `Creating virtual machine '${vmName}'...\nThe VM has been successfully created.`,
        });
        prlctlMock.addResponse('set', [vmName, '--memsize', memory.toString()], {
          stdout: `Memory size set to ${memory} MB`,
        });
        prlctlMock.addResponse('set', [vmName, '--cpus', cpus.toString()], {
          stdout: `Number of CPUs set to ${cpus}`,
        });
        prlctlMock.addResponse('set', [vmName, '--device-add', 'hdd', '--size', `${diskSize}G`], {
          stdout: `Hard disk added with size ${diskSize}GB`,
        });

        // Act
        const result = await harness.callTool('createVM', {
          name: vmName,
          memory: memory,
          cpus: cpus,
          diskSize: diskSize,
        });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain(`${memory}MB`);
        expect(result.content[0].text).toContain(`CPUs: ${cpus}`);
        expect(result.content[0].text).toContain(`${diskSize}GB`);
      });

      it('should clone VM from template', async () => {
        // Arrange
        const vmName = 'cloned-vm';
        const templateName = 'ubuntu-template';

        prlctlMock.addResponse('clone', [templateName, '--name', vmName], {
          stdout: `Cloning '${templateName}' to '${vmName}'...\nClone has been successfully created.`,
        });

        // Act
        const result = await harness.callTool('createVM', {
          name: vmName,
          fromTemplate: templateName,
        });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain('successfully created');
        expect(result.content[0].text).toContain('cloned from');
        expect(result.content[0].text).toContain(templateName);
      });
    });

    describe('Failure Scenarios', () => {
      it('should reject invalid memory size', async () => {
        // Act
        const result = await harness.callTool('createVM', {
          name: 'test-vm',
          memory: 100, // Below minimum
        });

        // Assert
        TestUtils.assertError(result);
        expect(result.content[0].text).toContain('Memory must be at least 512 MB');
      });

      it('should handle duplicate VM name', async () => {
        // Arrange
        const vmName = 'existing-vm';
        prlctlMock.addResponse('create', [vmName], {
          shouldFail: true,
          error: 'VM already exists',
          stderr: `Failed to create VM '${vmName}': A virtual machine with this name already exists.`,
        });

        // Act
        const result = await harness.callTool('createVM', { name: vmName });

        // Assert
        TestUtils.assertError(result, 'already exists');
      });

      it('should handle template not found', async () => {
        // Arrange
        const vmName = 'test-vm';
        const templateName = 'non-existent-template';

        prlctlMock.addResponse('clone', [templateName, '--name', vmName], {
          shouldFail: true,
          error: 'Template not found',
          stderr: `Failed to clone: The virtual machine '${templateName}' could not be found.`,
        });

        // Act
        const result = await harness.callTool('createVM', {
          name: vmName,
          fromTemplate: templateName,
        });

        // Assert
        TestUtils.assertError(result, 'could not be found');
      });
    });
  });

  describe('3. startVM Tool Integration', () => {
    describe('Success Scenarios', () => {
      it('should start stopped VM', async () => {
        // Arrange
        const vmId = 'test-vm';
        prlctlMock.addResponse('start', [vmId], {
          stdout: `Starting the VM...\nVM '${vmId}' has been successfully started.`,
        });

        // Act
        const result = await harness.callTool('startVM', { vmId });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain('successfully started');
      });

      it('should handle already running VM', async () => {
        // Arrange
        const vmId = 'running-vm';
        prlctlMock.addResponse('start', [vmId], {
          stderr: 'The VM is already running.',
        });

        // Act
        const result = await harness.callTool('startVM', { vmId });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain('successfully started');
      });

      it('should start VM by UUID', async () => {
        // Arrange
        const vmUuid = TestUtils.createUuid();
        prlctlMock.addResponse('start', [vmUuid], {
          stdout: `VM '${vmUuid}' has been successfully started.`,
        });

        // Act
        const result = await harness.callTool('startVM', { vmId: vmUuid });

        // Assert
        TestUtils.assertSuccess(result);
        expect(prlctlMock.wasCalledWith('start', [vmUuid])).toBe(true);
      });
    });

    describe('Failure Scenarios', () => {
      it('should handle VM not found', async () => {
        // Arrange
        const vmId = 'non-existent';
        prlctlMock.addResponse('start', [vmId], MockResponseFactory.vmNotFound(vmId));

        // Act
        const result = await harness.callTool('startVM', { vmId });

        // Assert
        TestUtils.assertError(result, 'could not be found');
      });

      it('should handle insufficient resources', async () => {
        // Arrange
        const vmId = 'memory-hungry-vm';
        prlctlMock.addResponse('start', [vmId], {
          shouldFail: true,
          error: 'Not enough memory',
          stderr: 'Failed to start VM: Not enough physical memory available on the host.',
        });

        // Act
        const result = await harness.callTool('startVM', { vmId });

        // Assert
        TestUtils.assertError(result, 'Not enough');
      });
    });
  });

  describe('4. stopVM Tool Integration', () => {
    describe('Success Scenarios', () => {
      it('should gracefully stop running VM', async () => {
        // Arrange
        const vmId = 'running-vm';
        prlctlMock.addResponse('stop', [vmId], {
          stdout: `Stopping the VM...\nVM '${vmId}' has been successfully stopped.`,
        });

        // Act
        const result = await harness.callTool('stopVM', { vmId });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain('successfully stopped');
        expect(prlctlMock.wasCalledWith('stop', [vmId])).toBe(true);
      });

      it('should force stop VM when requested', async () => {
        // Arrange
        const vmId = 'hung-vm';
        prlctlMock.addResponse('stop', [vmId, '--kill'], {
          stdout: `VM '${vmId}' has been forcefully stopped.`,
        });

        // Act
        const result = await harness.callTool('stopVM', { vmId, force: true });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain('successfully stopped');
        expect(prlctlMock.wasCalledWith('stop', [vmId, '--kill'])).toBe(true);
      });
    });
  });

  describe('5. deleteVM Tool Integration', () => {
    describe('Success Scenarios', () => {
      it('should delete VM with confirmation', async () => {
        // Arrange
        const vmId = 'vm-to-delete';
        prlctlMock.addResponse('delete', [vmId], {
          stdout: `Removing the VM...\nVM '${vmId}' has been successfully removed.`,
        });

        // Act
        const result = await harness.callTool('deleteVM', { vmId, confirm: true });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain('successfully deleted');
      });

      it('should reject deletion without confirmation', async () => {
        // Act
        const result = await harness.callTool('deleteVM', { vmId: 'test-vm', confirm: false });

        // Assert
        TestUtils.assertError(result);
        expect(result.content[0].text).toContain('Deletion cancelled');
        expect(prlctlMock.getCallHistory()).toHaveLength(0);
      });
    });
  });

  describe('6. takeSnapshot Tool Integration', () => {
    describe('Success Scenarios', () => {
      it('should create snapshot with name and description', async () => {
        // Arrange
        const vmId = 'snapshot-test-vm';
        const snapshotName = 'backup-before-update';
        const description = 'System state before major update';

        prlctlMock.addResponse(
          'snapshot',
          [vmId, '--name', snapshotName, '--description', description],
          {
            stdout: `Creating snapshot '${snapshotName}'...\nSnapshot has been successfully created.`,
          }
        );

        // Act
        const result = await harness.callTool('takeSnapshot', {
          vmId,
          name: snapshotName,
          description,
        });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain('successfully created');
        expect(result.content[0].text).toContain(snapshotName);
      });

      it('should create snapshot of running VM', async () => {
        // Arrange
        const vmId = 'running-vm';
        const snapshotName = 'live-snapshot';

        prlctlMock.addResponse('snapshot', [vmId, '--name', snapshotName], {
          stdout: 'Creating live snapshot...\nSnapshot created successfully.',
        });

        // Act
        const result = await harness.callTool('takeSnapshot', {
          vmId,
          name: snapshotName,
        });

        // Assert
        TestUtils.assertSuccess(result);
      });
    });
  });

  describe('7. restoreSnapshot Tool Integration', () => {
    describe('Success Scenarios', () => {
      it('should restore VM to snapshot by ID', async () => {
        // Arrange
        const vmId = 'vm-with-snapshots';
        const snapshotId = TestUtils.createUuid();

        prlctlMock.addResponse('snapshot-switch', [vmId, '--id', snapshotId], {
          stdout: 'Reverting to snapshot...\nSuccessfully reverted to snapshot.',
        });

        // Act
        const result = await harness.callTool('restoreSnapshot', {
          vmId,
          snapshotId,
        });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain('successfully restored');
      });

      it('should restore VM to snapshot by name', async () => {
        // Arrange
        const vmId = 'vm-with-snapshots';
        const snapshotName = 'clean-state';

        // First, mock listing snapshots to find ID
        const snapshotId = TestUtils.createUuid();
        prlctlMock.addResponse(
          'snapshot-list',
          [vmId],
          MockResponseFactory.snapshotList([
            { id: snapshotId, name: snapshotName, date: '2024-01-01', current: false },
          ])
        );

        prlctlMock.addResponse('snapshot-switch', [vmId, '--id', snapshotId], {
          stdout: 'Successfully reverted to snapshot.',
        });

        // Act
        const result = await harness.callTool('restoreSnapshot', {
          vmId,
          snapshotId: snapshotName,
        });

        // Assert
        TestUtils.assertSuccess(result);
      });
    });

    describe('Failure Scenarios', () => {
      it('should handle snapshot not found', async () => {
        // Arrange
        const vmId = 'test-vm';
        const snapshotId = 'non-existent-snapshot';

        prlctlMock.addResponse('snapshot-list', [vmId], MockResponseFactory.snapshotList([]));

        // Act
        const result = await harness.callTool('restoreSnapshot', {
          vmId,
          snapshotId,
        });

        // Assert
        TestUtils.assertError(result, 'Snapshot not found');
      });
    });
  });

  describe('8. listSnapshots Tool Integration', () => {
    describe('Success Scenarios', () => {
      it('should list all snapshots with current marked', async () => {
        // Arrange
        const vmId = 'vm-with-snapshots';
        const snapshots = [
          {
            id: TestUtils.createUuid(),
            name: 'initial-state',
            date: '2024-01-01 10:00:00',
            current: false,
          },
          {
            id: TestUtils.createUuid(),
            name: 'after-config',
            date: '2024-01-02 11:00:00',
            current: true,
          },
          {
            id: TestUtils.createUuid(),
            name: 'before-update',
            date: '2024-01-03 12:00:00',
            current: false,
          },
        ];

        prlctlMock.addResponse(
          'snapshot-list',
          [vmId],
          MockResponseFactory.snapshotList(snapshots)
        );

        // Act
        const result = await harness.callTool('listSnapshots', { vmId });

        // Assert
        TestUtils.assertSuccess(result);
        const responseText = result.content[0].text;
        expect(responseText).toContain('initial-state');
        expect(responseText).toContain('after-config');
        expect(responseText).toContain('Current');
        expect(responseText).toContain('before-update');
      });

      it('should handle VM without snapshots', async () => {
        // Arrange
        const vmId = 'vm-no-snapshots';
        prlctlMock.addResponse('snapshot-list', [vmId], { stdout: '' });

        // Act
        const result = await harness.callTool('listSnapshots', { vmId });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain('No snapshots found');
      });
    });
  });

  describe('9. takeScreenshot Tool Integration', () => {
    describe('Success Scenarios', () => {
      it('should capture screenshot with default path', async () => {
        // Arrange
        const vmId = 'running-vm';
        const expectedPath = `/tmp/parallels-screenshot-${vmId}-`;

        prlctlMock.addResponse('capture', [vmId, '--file', expect.stringContaining(expectedPath)], {
          stdout: 'Screenshot captured successfully.',
        });

        // Act
        const result = await harness.callTool('takeScreenshot', { vmId });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain('Screenshot saved to');
        expect(result.content[0].text).toMatch(/\.png$/);
      });

      it('should save screenshot to custom path', async () => {
        // Arrange
        const vmId = 'running-vm';
        const customPath = '/Users/test/screenshots/vm-state.png';

        prlctlMock.addResponse('capture', [vmId, '--file', customPath], {
          stdout: 'Screenshot captured successfully.',
        });

        // Act
        const result = await harness.callTool('takeScreenshot', {
          vmId,
          outputPath: customPath,
        });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain(customPath);
      });
    });

    describe('Failure Scenarios', () => {
      it('should handle VM not running', async () => {
        // Arrange
        const vmId = 'stopped-vm';
        prlctlMock.addResponse('capture', [vmId, '--file', expect.any(String)], {
          shouldFail: true,
          error: 'VM is not running',
          stderr: 'Cannot capture screenshot: The virtual machine is not running.',
        });

        // Act
        const result = await harness.callTool('takeScreenshot', { vmId });

        // Assert
        TestUtils.assertError(result, 'not running');
      });
    });
  });

  describe('10. createTerminalSession Tool Integration', () => {
    describe('Success Scenarios', () => {
      it('should generate SSH instructions for running VM', async () => {
        // Arrange
        const vmId = 'ssh-enabled-vm';
        const ipAddress = '10.211.55.20';
        const vmInfo = { uuid: TestUtils.createUuid(), name: vmId, status: 'running', ipAddress };

        prlctlMock.addResponse('list', ['--info', vmId], MockResponseFactory.vmList([vmInfo]));

        // Act
        const result = await harness.callTool('createTerminalSession', { vmId });

        // Assert
        TestUtils.assertSuccess(result);
        const responseText = result.content[0].text;
        expect(responseText).toContain(`ssh user@${ipAddress}`);
        expect(responseText).toContain('Terminal Session Instructions');
      });

      it('should include custom username in SSH command', async () => {
        // Arrange
        const vmId = 'test-vm';
        const username = 'developer';
        const ipAddress = '10.211.55.30';

        prlctlMock.addResponse(
          'list',
          ['--info', vmId],
          MockResponseFactory.vmList([
            { uuid: TestUtils.createUuid(), name: vmId, status: 'running', ipAddress },
          ])
        );

        // Act
        const result = await harness.callTool('createTerminalSession', {
          vmId,
          user: username,
        });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain(`ssh ${username}@${ipAddress}`);
      });
    });

    describe('Failure Scenarios', () => {
      it('should handle VM without IP address', async () => {
        // Arrange
        const vmId = 'no-network-vm';
        prlctlMock.addResponse(
          'list',
          ['--info', vmId],
          MockResponseFactory.vmList([
            { uuid: TestUtils.createUuid(), name: vmId, status: 'running' },
          ])
        );

        // Act
        const result = await harness.callTool('createTerminalSession', { vmId });

        // Assert
        TestUtils.assertError(result, 'No IP address found');
      });
    });
  });

  describe('11. manageSshAuth Tool Integration', () => {
    describe('Success Scenarios', () => {
      it('should configure SSH key authentication', async () => {
        // Arrange
        const vmId = 'test-vm';
        const username = 'developer';
        const publicKeyPath = '~/.ssh/id_rsa.pub';

        // Mock reading public key
        prlctlMock.addResponse('exec', [vmId, 'mkdir', '-p', `/home/${username}/.ssh`], {
          stdout: '',
        });

        prlctlMock.addResponse(
          'exec',
          [vmId, 'bash', '-c', expect.stringContaining('authorized_keys')],
          {
            stdout: 'Key added successfully',
          }
        );

        // Act
        const result = await harness.callTool('manageSshAuth', {
          vmId,
          username,
          publicKeyPath,
        });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain('SSH authentication configured');
      });

      it('should enable passwordless sudo', async () => {
        // Arrange
        const vmId = 'test-vm';
        const username = 'developer';

        prlctlMock.addResponse('exec', [vmId, 'bash', '-c', expect.stringContaining('sudoers.d')], {
          stdout: 'Sudo configured',
        });

        // Act
        const result = await harness.callTool('manageSshAuth', {
          vmId,
          username,
          enablePasswordlessSudo: true,
        });

        // Assert
        TestUtils.assertSuccess(result);
        expect(result.content[0].text).toContain('Passwordless sudo enabled');
      });
    });
  });

  describe('12. batchOperation Tool Integration', () => {
    describe('Success Scenarios', () => {
      it('should start multiple VMs concurrently', async () => {
        // Arrange
        const targetVMs = ['vm1', 'vm2', 'vm3'];
        targetVMs.forEach((vm) => {
          prlctlMock.addResponse('start', [vm], {
            stdout: `VM '${vm}' started successfully.`,
          });
        });

        // Act
        const result = await harness.callTool('batchOperation', {
          targetVMs,
          operation: 'start',
        });

        // Assert
        TestUtils.assertSuccess(result);
        const responseText = result.content[0].text;
        expect(responseText).toContain('Successful: 3');
        expect(responseText).toContain('Failed: 0');
        targetVMs.forEach((vm) => {
          expect(responseText).toContain(`✅ **${vm}**: start completed successfully`);
        });
      });

      it('should handle partial failures gracefully', async () => {
        // Arrange
        const targetVMs = ['vm1', 'vm2', 'vm3'];

        prlctlMock.addResponse('stop', ['vm1'], {
          stdout: "VM 'vm1' stopped successfully.",
        });
        prlctlMock.addResponse('stop', ['vm2'], MockResponseFactory.vmNotFound('vm2'));
        prlctlMock.addResponse('stop', ['vm3'], {
          stdout: "VM 'vm3' stopped successfully.",
        });

        // Act
        const result = await harness.callTool('batchOperation', {
          targetVMs,
          operation: 'stop',
        });

        // Assert
        expect(result.isError).toBeFalsy(); // Not an error if some succeed
        const responseText = result.content[0].text;
        expect(responseText).toContain('Successful: 2');
        expect(responseText).toContain('Failed: 1');
        expect(responseText).toContain('✅ **vm1**');
        expect(responseText).toContain('❌ **vm2**');
        expect(responseText).toContain('✅ **vm3**');
      });

      it('should apply force flag to all operations', async () => {
        // Arrange
        const targetVMs = ['vm1', 'vm2'];
        targetVMs.forEach((vm) => {
          prlctlMock.addResponse('stop', [vm, '--kill'], {
            stdout: `VM '${vm}' forcefully stopped.`,
          });
        });

        // Act
        const result = await harness.callTool('batchOperation', {
          targetVMs,
          operation: 'stop',
          force: true,
        });

        // Assert
        TestUtils.assertSuccess(result);
        targetVMs.forEach((vm) => {
          expect(prlctlMock.wasCalledWith('stop', [vm, '--kill'])).toBe(true);
        });
      });
    });

    describe('Failure Scenarios', () => {
      it('should error when all operations fail', async () => {
        // Arrange
        const targetVMs = ['vm1', 'vm2'];
        targetVMs.forEach((vm) => {
          prlctlMock.addResponse('start', [vm], MockResponseFactory.vmNotFound(vm));
        });

        // Act
        const result = await harness.callTool('batchOperation', {
          targetVMs,
          operation: 'start',
        });

        // Assert
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Failed: 2');
      });

      it('should validate empty target list', async () => {
        // Act
        const result = await harness.callTool('batchOperation', {
          targetVMs: [],
          operation: 'start',
        });

        // Assert
        TestUtils.assertError(result);
        expect(result.content[0].text).toContain('At least one VM must be specified');
      });
    });
  });

  describe('Real-World Workflow Tests', () => {
    describe('Complete VM Lifecycle Workflow', () => {
      it('should handle full VM lifecycle from creation to deletion', async () => {
        const vmName = 'lifecycle-test-vm';
        const snapshotName = 'initial-state';

        // Step 1: Create VM
        prlctlMock.addResponse('create', [vmName], {
          stdout: `Creating virtual machine '${vmName}'...\nThe VM has been successfully created.`,
        });

        const createResult = await harness.callTool('createVM', { name: vmName });
        TestUtils.assertSuccess(createResult);

        // Step 2: Start VM
        prlctlMock.addResponse('start', [vmName], {
          stdout: `VM '${vmName}' started successfully.`,
        });

        const startResult = await harness.callTool('startVM', { vmId: vmName });
        TestUtils.assertSuccess(startResult);

        // Step 3: Take snapshot
        prlctlMock.addResponse('snapshot', [vmName, '--name', snapshotName], {
          stdout: 'Snapshot created successfully.',
        });

        const snapshotResult = await harness.callTool('takeSnapshot', {
          vmId: vmName,
          name: snapshotName,
        });
        TestUtils.assertSuccess(snapshotResult);

        // Step 4: Stop VM
        prlctlMock.addResponse('stop', [vmName], {
          stdout: `VM '${vmName}' stopped successfully.`,
        });

        const stopResult = await harness.callTool('stopVM', { vmId: vmName });
        TestUtils.assertSuccess(stopResult);

        // Step 5: Delete VM
        prlctlMock.addResponse('delete', [vmName], {
          stdout: `VM '${vmName}' has been successfully removed.`,
        });

        const deleteResult = await harness.callTool('deleteVM', {
          vmId: vmName,
          confirm: true,
        });
        TestUtils.assertSuccess(deleteResult);
      });
    });

    describe('Disaster Recovery Workflow', () => {
      it('should recover VM from snapshot after failure', async () => {
        const vmId = 'production-vm';
        const snapshotId = TestUtils.createUuid();
        const snapshotName = 'last-known-good';

        // Step 1: Detect VM issue (simulated by listing snapshots)
        prlctlMock.addResponse(
          'snapshot-list',
          [vmId],
          MockResponseFactory.snapshotList([
            { id: snapshotId, name: snapshotName, date: '2024-01-01', current: false },
            {
              id: TestUtils.createUuid(),
              name: 'corrupted-state',
              date: '2024-01-02',
              current: true,
            },
          ])
        );

        const listResult = await harness.callTool('listSnapshots', { vmId });
        TestUtils.assertSuccess(listResult);

        // Step 2: Restore to last known good
        prlctlMock.addResponse('snapshot-switch', [vmId, '--id', snapshotId], {
          stdout: 'Successfully reverted to snapshot.',
        });

        const restoreResult = await harness.callTool('restoreSnapshot', {
          vmId,
          snapshotId,
        });
        TestUtils.assertSuccess(restoreResult);

        // Step 3: Start recovered VM
        prlctlMock.addResponse('start', [vmId], {
          stdout: `VM '${vmId}' started successfully.`,
        });

        const startResult = await harness.callTool('startVM', { vmId });
        TestUtils.assertSuccess(startResult);

        // Step 4: Take new recovery snapshot
        const recoverySnapshot = 'post-recovery';
        prlctlMock.addResponse('snapshot', [vmId, '--name', recoverySnapshot], {
          stdout: 'Snapshot created successfully.',
        });

        const snapshotResult = await harness.callTool('takeSnapshot', {
          vmId,
          name: recoverySnapshot,
          description: 'State after successful recovery',
        });
        TestUtils.assertSuccess(snapshotResult);
      });
    });

    describe('Batch Management Workflow', () => {
      it('should manage development environment VMs as a group', async () => {
        const devVMs = ['dev-frontend', 'dev-backend', 'dev-database'];

        // Step 1: Start all development VMs
        devVMs.forEach((vm) => {
          prlctlMock.addResponse('start', [vm], {
            stdout: `VM '${vm}' started successfully.`,
          });
        });

        const startResult = await harness.callTool('batchOperation', {
          targetVMs: devVMs,
          operation: 'start',
        });
        TestUtils.assertSuccess(startResult);

        // Step 2: Take snapshots of all VMs
        for (const vm of devVMs) {
          prlctlMock.addResponse('snapshot', [vm, '--name', 'daily-backup'], {
            stdout: 'Snapshot created successfully.',
          });

          const snapshotResult = await harness.callTool('takeSnapshot', {
            vmId: vm,
            name: 'daily-backup',
          });
          TestUtils.assertSuccess(snapshotResult);
        }

        // Step 3: Stop all VMs at end of day
        devVMs.forEach((vm) => {
          prlctlMock.addResponse('stop', [vm], {
            stdout: `VM '${vm}' stopped successfully.`,
          });
        });

        const stopResult = await harness.callTool('batchOperation', {
          targetVMs: devVMs,
          operation: 'stop',
        });
        TestUtils.assertSuccess(stopResult);
      });
    });
  });

  describe('Concurrent Operations Testing', () => {
    it('should handle concurrent VM operations without conflicts', async () => {
      const vms = ['concurrent-vm1', 'concurrent-vm2', 'concurrent-vm3'];

      // Mock all operations to succeed
      vms.forEach((vm) => {
        prlctlMock.addResponse('start', [vm], {
          stdout: `VM '${vm}' started successfully.`,
          delay: 100, // Simulate some processing time
        });
      });

      // Execute concurrent operations
      const operations = vms.map((vm) => harness.callTool('startVM', { vmId: vm }));

      // Wait for all to complete
      const results = await Promise.all(operations);

      // Verify all succeeded
      results.forEach((result) => {
        TestUtils.assertSuccess(result);
      });

      // Verify all VMs were called
      vms.forEach((vm) => {
        expect(prlctlMock.wasCalledWith('start', [vm])).toBe(true);
      });
    });

    it('should handle concurrent snapshots safely', async () => {
      const vms = ['snap-vm1', 'snap-vm2'];
      const timestamp = Date.now();

      // Mock snapshot operations
      vms.forEach((vm, index) => {
        const snapshotName = `concurrent-snap-${timestamp}-${index}`;
        prlctlMock.addResponse('snapshot', [vm, '--name', snapshotName], {
          stdout: 'Snapshot created successfully.',
          delay: 200,
        });
      });

      // Execute concurrent snapshots
      const operations = vms.map((vm, index) =>
        harness.callTool('takeSnapshot', {
          vmId: vm,
          name: `concurrent-snap-${timestamp}-${index}`,
        })
      );

      const results = await Promise.all(operations);

      // Verify all succeeded
      results.forEach((result) => {
        TestUtils.assertSuccess(result);
      });
    });
  });

  describe('Security and Input Validation', () => {
    it('should sanitize VM names with special characters', async () => {
      const maliciousName = 'vm; rm -rf /';
      const sanitizedName = 'vmrmrf';

      prlctlMock.addResponse('start', [sanitizedName], {
        stdout: 'VM started successfully.',
      });

      await harness.callTool('startVM', { vmId: maliciousName });

      // Should sanitize the input
      expect(prlctlMock.wasCalledWith('start', [sanitizedName])).toBe(true);
    });

    it('should validate resource boundaries', async () => {
      // Test various invalid inputs
      const invalidInputs = [
        { memory: -1, expectedError: 'Memory must be at least 512 MB' },
        { memory: 999999999, expectedError: 'Memory cannot exceed' },
        { cpus: 0, expectedError: 'Number of CPUs must be at least 1' },
        { cpus: 1000, expectedError: 'Number of CPUs cannot exceed' },
        { diskSize: -10, expectedError: 'Disk size must be at least 1 GB' },
      ];

      for (const { memory, cpus, diskSize, expectedError } of invalidInputs) {
        const result = await harness.callTool('createVM', {
          name: 'test-vm',
          memory,
          cpus,
          diskSize,
        });

        TestUtils.assertError(result, expectedError);
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle listing 50+ VMs efficiently', async () => {
      // Create 50 test VMs
      const largeVmList = Array.from({ length: 50 }, (_, i) => ({
        uuid: TestUtils.createUuid(),
        name: `vm-${i}`,
        status: i % 3 === 0 ? 'running' : i % 3 === 1 ? 'stopped' : 'suspended',
        ipAddress: i % 3 === 0 ? `10.211.55.${i + 10}` : undefined,
      }));

      prlctlMock.addResponse('list', ['--all'], MockResponseFactory.vmList(largeVmList));

      const startTime = Date.now();
      const result = await harness.callTool('listVMs', {});
      const duration = Date.now() - startTime;

      TestUtils.assertSuccess(result);
      expect(result.content[0].text).toContain('50 VMs total');
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should batch process large VM groups efficiently', async () => {
      const largeVmGroup = Array.from({ length: 20 }, (_, i) => `batch-vm-${i}`);

      // Mock responses for all VMs
      largeVmGroup.forEach((vm) => {
        prlctlMock.addResponse('suspend', [vm], {
          stdout: `VM '${vm}' suspended.`,
          delay: 50, // Simulate some processing
        });
      });

      const startTime = Date.now();
      const result = await harness.callTool('batchOperation', {
        targetVMs: largeVmGroup,
        operation: 'suspend',
      });
      const duration = Date.now() - startTime;

      TestUtils.assertSuccess(result);
      expect(result.content[0].text).toContain('Successful: 20');
      // Should be faster than sequential (20 * 50ms = 1000ms)
      expect(duration).toBeLessThan(500);
    });
  });
});
