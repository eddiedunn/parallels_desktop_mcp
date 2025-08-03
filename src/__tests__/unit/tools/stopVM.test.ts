import { handleStopVM } from '../../../tools/stopVM';
import { executePrlctl } from '../../../prlctl-handler';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';

// Mock the prlctl-handler module
jest.mock('../../../prlctl-handler', () => ({
  executePrlctl: jest.fn(),
  sanitizeVmIdentifier: jest.requireActual('../../../prlctl-handler').sanitizeVmIdentifier,
}));

describe('stopVM tool', () => {
  const mockExecutePrlctl = executePrlctl as jest.MockedFunction<typeof executePrlctl>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should stop a VM gracefully', async () => {
    const vmId = 'test-vm';
    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: `Stopping VM...
VM '${vmId}' has been successfully stopped.`,
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'stopVM',
        arguments: { vmId },
      },
    };

    const result = await handleStopVM(request);

    expect(mockExecutePrlctl).toHaveBeenCalledWith(['stop', vmId]);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Success');
    expect(result.content[0].text).toContain(`VM '${vmId}' stopped successfully`);
    expect(result.content[0].text).not.toContain('forcefully');
  });

  it('should force stop a VM when force is true', async () => {
    const vmId = 'test-vm';
    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: `Killing VM process...
VM '${vmId}' has been forcefully stopped.`,
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'stopVM',
        arguments: { vmId, force: true },
      },
    };

    const result = await handleStopVM(request);

    expect(mockExecutePrlctl).toHaveBeenCalledWith(['stop', vmId, '--kill']);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('forcefully stopped');
  });

  it('should stop a VM by UUID', async () => {
    const vmUuid = '{12345678-1234-1234-1234-123456789012}';
    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: 'VM stopped',
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'stopVM',
        arguments: { vmId: vmUuid },
      },
    };

    const result = await handleStopVM(request);

    expect(mockExecutePrlctl).toHaveBeenCalledWith(['stop', vmUuid]);
    expect(result.isError).toBeFalsy();
  });

  it('should default force to false', async () => {
    const vmId = 'test-vm';
    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: 'VM stopped',
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'stopVM',
        arguments: { vmId, force: false },
      },
    };

    await handleStopVM(request);

    // Should not include --kill flag when force is false
    expect(mockExecutePrlctl).toHaveBeenCalledWith(['stop', vmId]);
    expect(mockExecutePrlctl).not.toHaveBeenCalledWith(['stop', vmId, '--kill']);
  });

  it('should sanitize VM identifier', async () => {
    const maliciousVmId = 'test-vm && shutdown -h now';
    const sanitizedVmId = 'test-vmshutdown-hnow';

    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: 'VM stopped',
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'stopVM',
        arguments: { vmId: maliciousVmId },
      },
    };

    const result = await handleStopVM(request);

    expect(mockExecutePrlctl).toHaveBeenCalledWith(['stop', sanitizedVmId]);
    expect(result.isError).toBeFalsy();
    // Original name should be shown in the success message
    expect(result.content[0].text).toContain(maliciousVmId);
  });

  it('should handle VM not found error', async () => {
    const vmId = 'nonexistent-vm';
    mockExecutePrlctl.mockRejectedValueOnce(
      new Error('The specified virtual machine could not be found.')
    );

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'stopVM',
        arguments: { vmId },
      },
    };

    const result = await handleStopVM(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error stopping VM');
    expect(result.content[0].text).toContain(vmId);
    expect(result.content[0].text).toContain('could not be found');
  });

  it('should handle VM already stopped', async () => {
    const vmId = 'stopped-vm';
    mockExecutePrlctl.mockRejectedValueOnce(new Error('The VM is already stopped.'));

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'stopVM',
        arguments: { vmId },
      },
    };

    const result = await handleStopVM(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already stopped');
  });

  it('should validate required vmId parameter', async () => {
    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'stopVM',
        arguments: {},
      },
    };

    const result = await handleStopVM(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
    expect(mockExecutePrlctl).not.toHaveBeenCalled();
  });

  it('should reject empty vmId', async () => {
    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'stopVM',
        arguments: { vmId: '' },
      },
    };

    const result = await handleStopVM(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
    expect(mockExecutePrlctl).not.toHaveBeenCalled();
  });

  it('should handle permission denied error', async () => {
    const vmId = 'test-vm';
    mockExecutePrlctl.mockRejectedValueOnce(new Error('Permission denied'));

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'stopVM',
        arguments: { vmId },
      },
    };

    const result = await handleStopVM(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Permission denied');
  });

  it('should handle timeout during graceful shutdown', async () => {
    const vmId = 'test-vm';
    mockExecutePrlctl.mockRejectedValueOnce(
      new Error('Timeout waiting for VM to stop. Consider using force option.')
    );

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'stopVM',
        arguments: { vmId },
      },
    };

    const result = await handleStopVM(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Timeout');
    expect(result.content[0].text).toContain('force option');
  });

  it('should validate force parameter type', async () => {
    const vmId = 'test-vm';
    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'stopVM',
        arguments: { vmId, force: 'yes' as any }, // Invalid type
      },
    };

    const result = await handleStopVM(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
    expect(mockExecutePrlctl).not.toHaveBeenCalled();
  });
});
