import { handleSetHostname } from '../../../tools/setHostname';
import { executePrlctl } from '../../../prlctl-handler';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';

// Mock the prlctl-handler module
jest.mock('../../../prlctl-handler', () => ({
  executePrlctl: jest.fn(),
  sanitizeVmIdentifier: jest.requireActual('../../../prlctl-handler').sanitizeVmIdentifier,
}));

describe('setHostname tool', () => {
  const mockExecutePrlctl = executePrlctl as jest.MockedFunction<typeof executePrlctl>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  it('should set hostname successfully', async () => {
    const mockOutput = `hostnamectl not available or failed
=== Hostname Verification ===
Current hostname: test-vm
FQDN: test-vm
/etc/hostname contains: test-vm
Hosts file entries:
127.0.0.1 localhost
127.0.1.1 test-vm`;

    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: mockOutput,
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'setHostname',
        arguments: {
          vmId: 'test-vm-uuid',
          hostname: 'test-vm',
        },
      },
    };

    const result = await handleSetHostname(request);

    expect(mockExecutePrlctl).toHaveBeenCalledWith([
      'exec',
      'test-vm-uuid',
      expect.stringContaining("hostnamectl set-hostname 'test-vm'"),
    ]);
    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const text = result.content[0].text;
    expect(text).toContain('✅ **Success**');
    expect(text).toContain('Target hostname**: test-vm');
    expect(text).toContain('Current hostname**: test-vm');
    expect(text).toContain('hostnamectl set-hostname');
    expect(text).toContain('/etc/hostname file update');
    expect(text).toContain('Runtime hostname command');
    expect(text).toContain('/etc/hosts local resolution entry');
  });

  it('should handle FQDN hostname', async () => {
    const mockOutput = `=== Hostname Verification ===
Current hostname: web.example.com
FQDN: web.example.com
/etc/hostname contains: web.example.com
Hosts file entries:
127.0.1.1 web.example.com`;

    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: mockOutput,
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'setHostname',
        arguments: {
          vmId: 'web-vm',
          hostname: 'web.example.com',
        },
      },
    };

    const result = await handleSetHostname(request);

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('web.example.com');
    expect(text).toContain('For FQDN hostnames, ensure DNS is properly configured');
  });

  it('should handle partial success when hostname command fails', async () => {
    const mockOutput = `=== Hostname Verification ===
Current hostname: old-name
FQDN: old-name
/etc/hostname contains: new-hostname
Hosts file entries:
127.0.1.1 new-hostname`;

    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: mockOutput,
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'setHostname',
        arguments: {
          vmId: 'test-vm',
          hostname: 'new-hostname',
        },
      },
    };

    const result = await handleSetHostname(request);

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('⚠️ **Partial Success**');
    expect(text).toContain('Target hostname**: new-hostname');
    expect(text).toContain('Current hostname**: old-name');
    expect(text).toContain('Some hostname setting methods may have failed');
  });

  it('should validate hostname format - invalid characters', async () => {
    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'setHostname',
        arguments: {
          vmId: 'test-vm',
          hostname: 'invalid@hostname',
        },
      },
    };

    const result = await handleSetHostname(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error setting hostname');
    expect(result.content[0].text).toContain('RFC 1123 format');
  });

  it('should validate hostname format - too long', async () => {
    const longHostname = 'a'.repeat(254);
    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'setHostname',
        arguments: {
          vmId: 'test-vm',
          hostname: longHostname,
        },
      },
    };

    const result = await handleSetHostname(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error setting hostname');
    expect(result.content[0].text).toContain('cannot exceed 253 characters');
  });

  it('should validate hostname format - segment too long', async () => {
    const longSegment = 'a'.repeat(64);
    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'setHostname',
        arguments: {
          vmId: 'test-vm',
          hostname: `${longSegment}.example.com`,
        },
      },
    };

    const result = await handleSetHostname(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error setting hostname');
    expect(result.content[0].text).toContain('segments max 63 chars');
  });

  it('should validate hostname format - leading hyphen', async () => {
    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'setHostname',
        arguments: {
          vmId: 'test-vm',
          hostname: '-invalid.example.com',
        },
      },
    };

    const result = await handleSetHostname(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error setting hostname');
    expect(result.content[0].text).toContain('cannot start/end with hyphens');
  });

  it('should require vmId parameter', async () => {
    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'setHostname',
        arguments: {
          hostname: 'test-hostname',
        },
      },
    };

    const result = await handleSetHostname(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error setting hostname');
    expect(result.content[0].text).toContain('Required');
  });

  it('should require hostname parameter', async () => {
    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'setHostname',
        arguments: {
          vmId: 'test-vm',
        },
      },
    };

    const result = await handleSetHostname(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error setting hostname');
  });

  it('should handle VM not running error', async () => {
    const errorMessage = 'prlctl command failed: VM is not running';
    mockExecutePrlctl.mockRejectedValueOnce(new Error(errorMessage));

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'setHostname',
        arguments: {
          vmId: 'stopped-vm',
          hostname: 'test-hostname',
        },
      },
    };

    const result = await handleSetHostname(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error setting hostname');
    expect(result.content[0].text).toContain('VM must be running to set hostname');
  });

  it('should handle permission errors', async () => {
    const errorMessage = 'prlctl command failed: Permission denied';
    mockExecutePrlctl.mockRejectedValueOnce(new Error(errorMessage));

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'setHostname',
        arguments: {
          vmId: 'test-vm',
          hostname: 'test-hostname',
        },
      },
    };

    const result = await handleSetHostname(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error setting hostname');
    expect(result.content[0].text).toContain('Ensure the VM has proper sudo access');
  });

  it('should sanitize hostname for command injection prevention', async () => {
    const mockOutput = `=== Hostname Verification ===
Current hostname: test-hostname
FQDN: test-hostname
/etc/hostname contains: test-hostname`;

    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: mockOutput,
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'setHostname',
        arguments: {
          vmId: 'test-vm',
          hostname: 'test-hostname; rm -rf /',
        },
      },
    };

    // This should fail validation before reaching sanitization
    const result = await handleSetHostname(request);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('RFC 1123 format');
  });

  it('should handle valid hostname with hyphens', async () => {
    const mockOutput = `# Set hostname using hostnamectl (systemd systems)
# Set hostname in /etc/hostname  
# Set runtime hostname
# Update /etc/hosts for local resolution
# Remove old hostname entries and add new one
# Verify hostname configuration
=== Hostname Verification ===
Current hostname: web-server-01
FQDN: web-server-01
/etc/hostname contains: web-server-01`;

    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: mockOutput,
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'setHostname',
        arguments: {
          vmId: 'test-vm',
          hostname: 'web-server-01',
        },
      },
    };

    const result = await handleSetHostname(request);

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('✅ **Success**');
    expect(text).toContain('web-server-01');
  });

  it('should escape shell characters in hostname', async () => {
    const mockOutput = `=== Hostname Verification ===
Current hostname: test-vm
FQDN: test-vm`;

    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: mockOutput,
      stderr: '',
    });

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'setHostname',
        arguments: {
          vmId: 'test-vm',
          hostname: 'test-vm',
        },
      },
    };

    await handleSetHostname(request);

    // Verify that the hostname is properly escaped in the command
    expect(mockExecutePrlctl).toHaveBeenCalledWith([
      'exec',
      'test-vm',
      expect.stringContaining("'test-vm'"),
    ]);
  });
});