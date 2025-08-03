import { handleStartVM } from '../../../tools/startVM';
import { executePrlctl } from '../../../prlctl-handler';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';

// Mock the prlctl-handler module
jest.mock('../../../prlctl-handler', () => ({
  executePrlctl: jest.fn(),
  sanitizeVmIdentifier: jest.requireActual('../../../prlctl-handler').sanitizeVmIdentifier,
}));

describe('startVM tool', () => {
  const mockExecutePrlctl = executePrlctl as jest.MockedFunction<typeof executePrlctl>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should start a VM successfully', async () => {
    const vmId = 'test-vm';
    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: `Starting VM...
VM '${vmId}' has been successfully started.`,
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'startVM',
        arguments: { vmId },
      },
    };

    const result = await handleStartVM(request);

    expect(mockExecutePrlctl).toHaveBeenCalledWith(['start', vmId]);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Success');
    expect(result.content[0].text).toContain(`VM '${vmId}' started successfully`);
  });

  it('should start a VM by UUID', async () => {
    const vmUuid = '{12345678-1234-1234-1234-123456789012}';
    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: 'VM started',
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'startVM',
        arguments: { vmId: vmUuid },
      },
    };

    const result = await handleStartVM(request);

    expect(mockExecutePrlctl).toHaveBeenCalledWith(['start', vmUuid]);
    expect(result.isError).toBeFalsy();
  });

  it('should sanitize VM identifier', async () => {
    const maliciousVmId = 'test-vm; rm -rf /';
    const sanitizedVmId = 'test-vmrm-rf';

    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: 'VM started',
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'startVM',
        arguments: { vmId: maliciousVmId },
      },
    };

    const result = await handleStartVM(request);

    expect(mockExecutePrlctl).toHaveBeenCalledWith(['start', sanitizedVmId]);
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
        name: 'startVM',
        arguments: { vmId },
      },
    };

    const result = await handleStartVM(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error starting VM');
    expect(result.content[0].text).toContain(vmId);
    expect(result.content[0].text).toContain('could not be found');
  });

  it('should handle VM already running', async () => {
    const vmId = 'running-vm';
    mockExecutePrlctl.mockRejectedValueOnce(new Error('The VM is already running.'));

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'startVM',
        arguments: { vmId },
      },
    };

    const result = await handleStartVM(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already running');
  });

  it('should validate required vmId parameter', async () => {
    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'startVM',
        arguments: {},
      },
    };

    const result = await handleStartVM(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
    expect(mockExecutePrlctl).not.toHaveBeenCalled();
  });

  it('should reject empty vmId', async () => {
    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'startVM',
        arguments: { vmId: '' },
      },
    };

    const result = await handleStartVM(request);

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
        name: 'startVM',
        arguments: { vmId },
      },
    };

    const result = await handleStartVM(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Permission denied');
  });

  it('should include command output in success message', async () => {
    const vmId = 'test-vm';
    const commandOutput = `Gathering VM information...
Starting VM...
Waiting for VM to boot...
VM '${vmId}' has been successfully started.
IP Address assigned: 192.168.1.100`;

    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: commandOutput,
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'startVM',
        arguments: { vmId },
      },
    };

    const result = await handleStartVM(request);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Output:');
    expect(result.content[0].text).toContain(commandOutput);
  });
});
