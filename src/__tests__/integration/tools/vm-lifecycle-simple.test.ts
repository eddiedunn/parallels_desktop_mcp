import { MCPTestClient, TestUtils } from '../../test-utils/mcp-test-client';

// Mock the prlctl-handler module
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

import { executePrlctl } from '../../../prlctl-handler';

describe('VM Lifecycle Integration Tests (Simplified)', () => {
  let client: MCPTestClient;
  const mockExecutePrlctl = executePrlctl as jest.MockedFunction<typeof executePrlctl>;

  beforeEach(async () => {
    jest.clearAllMocks();
    client = new MCPTestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  describe('Basic VM operations', () => {
    it('should list VMs', async () => {
      // Mock the response
      mockExecutePrlctl.mockResolvedValueOnce({
        stdout: `UUID                                     STATUS       IP_ADDR         NAME
{12345678-1234-1234-1234-123456789012} running      192.168.1.100   test-vm-1
{87654321-4321-4321-4321-210987654321} stopped      -               test-vm-2`,
        stderr: '',
      });

      const result = await client.callTool('listVMs', {});

      TestUtils.assertSuccess(result);
      expect(result.content[0].text).toContain('test-vm-1');
      expect(result.content[0].text).toContain('test-vm-2');
      expect(result.content[0].text).toContain('running');
      expect(result.content[0].text).toContain('stopped');
    });

    it('should create a VM', async () => {
      const vmName = 'test-new-vm';

      // Mock VM existence check (VM doesn't exist)
      mockExecutePrlctl.mockResolvedValueOnce({
        stdout: 'UUID                                    STATUS       IP_ADDR         NAME',
        stderr: '',
      });

      // Mock create command
      mockExecutePrlctl.mockResolvedValueOnce({
        stdout: `Creating virtual machine '${vmName}'...\nThe VM has been successfully created.`,
        stderr: '',
      });

      // Mock set memory command
      mockExecutePrlctl.mockResolvedValueOnce({
        stdout: 'Memory size set to 2048 MB',
        stderr: '',
      });

      // Mock set cpus command
      mockExecutePrlctl.mockResolvedValueOnce({
        stdout: 'Number of CPUs set to 2',
        stderr: '',
      });

      const result = await client.callTool('createVM', {
        name: vmName,
        memory: 2048,
        cpus: 2,
      });

      TestUtils.assertSuccess(result);
      expect(result.content[0].text).toContain('✅ **Success**');
      expect(result.content[0].text).toContain('**VM Created:**');
      expect(result.content[0].text).toContain(vmName);

      // Verify the calls
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['list', '--all']);
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['create', vmName]);
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['set', vmName, '--memsize', '2048']);
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['set', vmName, '--cpus', '2']);
    });

    it('should start a VM', async () => {
      const vmId = 'test-vm';

      mockExecutePrlctl.mockResolvedValueOnce({
        stdout: `Starting VM...\nVM '${vmId}' has been successfully started.`,
        stderr: '',
      });

      const result = await client.callTool('startVM', {
        vmId: vmId,
      });

      TestUtils.assertSuccess(result);
      expect(result.content[0].text).toContain('started successfully');
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['start', vmId]);
    });

    it('should stop a VM', async () => {
      const vmId = 'test-vm';

      mockExecutePrlctl.mockResolvedValueOnce({
        stdout: `Stopping VM...\nVM '${vmId}' has been successfully stopped.`,
        stderr: '',
      });

      const result = await client.callTool('stopVM', {
        vmId: vmId,
      });

      TestUtils.assertSuccess(result);
      expect(result.content[0].text).toContain('stopped successfully');
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['stop', vmId]);
    });

    it('should handle errors gracefully', async () => {
      mockExecutePrlctl.mockRejectedValueOnce(
        new Error('prlctl command failed: The specified virtual machine could not be found.')
      );

      const result = await client.callTool('startVM', {
        vmId: 'non-existent-vm',
      });

      TestUtils.assertError(result);
      expect(result.content[0].text).toContain('Error');
      expect(result.content[0].text).toContain('could not be found');
    });
  });
});
