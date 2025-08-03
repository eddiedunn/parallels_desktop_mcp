import { handleListVMs } from '../../../tools/listVMs';
import { executePrlctl } from '../../../prlctl-handler';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';

// Mock the prlctl-handler module
jest.mock('../../../prlctl-handler', () => ({
  executePrlctl: jest.fn(),
  parseVmList: jest.requireActual('../../../prlctl-handler').parseVmList,
}));

describe('listVMs tool', () => {
  const mockExecutePrlctl = executePrlctl as jest.MockedFunction<typeof executePrlctl>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should list all VMs successfully', async () => {
    const mockOutput = `UUID                                     STATUS       IP_ADDR         NAME
{11111111-1111-1111-1111-111111111111} running      192.168.1.100   Ubuntu-22.04
{22222222-2222-2222-2222-222222222222} stopped      -               Windows-11
{33333333-3333-3333-3333-333333333333} suspended    192.168.1.101   macOS-Ventura`;

    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: mockOutput,
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'listVMs',
        arguments: {},
      },
    };

    const result = await handleListVMs(request);

    expect(mockExecutePrlctl).toHaveBeenCalledWith(['list', '--all']);
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;
    expect(text).toContain('Found 3 virtual machine(s)');
    expect(text).toContain('Ubuntu-22.04');
    expect(text).toContain('Windows-11');
    expect(text).toContain('macOS-Ventura');
    expect(text).toContain('running');
    expect(text).toContain('stopped');
    expect(text).toContain('suspended');
    expect(text).toContain('192.168.1.100');
  });

  it('should handle empty VM list', async () => {
    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'listVMs',
        arguments: {},
      },
    };

    const result = await handleListVMs(request);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('No virtual machines found');
  });

  it('should handle prlctl errors', async () => {
    const errorMessage = 'Permission denied';
    mockExecutePrlctl.mockRejectedValueOnce(new Error(errorMessage));

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'listVMs',
        arguments: {},
      },
    };

    const result = await handleListVMs(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error listing VMs');
    expect(result.content[0].text).toContain(errorMessage);
  });

  it('should handle malformed output gracefully', async () => {
    const malformedOutput = `UUID STATUS
{11111111-1111-1111-1111-111111111111} running
malformed line here
{22222222-2222-2222-2222-222222222222} stopped      -               Test-VM`;

    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: malformedOutput,
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'listVMs',
        arguments: {},
      },
    };

    const result = await handleListVMs(request);

    expect(result.isError).toBeFalsy();
    // Should still parse the valid line
    expect(result.content[0].text).toContain('Test-VM');
  });

  it('should validate input parameters', async () => {
    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'listVMs',
        arguments: { unexpected: 'parameter' },
      },
    };

    // Should ignore unexpected parameters and still work
    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
    });

    const result = await handleListVMs(request);

    expect(result.isError).toBeFalsy();
    expect(mockExecutePrlctl).toHaveBeenCalledWith(['list', '--all']);
  });

  it('should format VM list with proper markdown', async () => {
    const mockOutput = `UUID                                     STATUS       IP_ADDR         NAME
{11111111-1111-1111-1111-111111111111} running      192.168.1.100   Test VM`;

    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: mockOutput,
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'listVMs',
        arguments: {},
      },
    };

    const result = await handleListVMs(request);
    const text = result.content[0].text;

    // Check markdown formatting
    expect(text).toContain('## Virtual Machines');
    expect(text).toContain('### 1. Test VM');
    expect(text).toContain('- **UUID**:');
    expect(text).toContain('- **Status**:');
    expect(text).toContain('- **IP Address**:');
  });
});
