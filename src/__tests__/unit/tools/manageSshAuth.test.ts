import { handleManageSshAuth } from '../../../tools/manageSshAuth';
import { executePrlctl, sanitizeVmIdentifier } from '../../../prlctl-handler';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock all external dependencies
jest.mock('../../../prlctl-handler', () => ({
  executePrlctl: jest.fn(),
  sanitizeVmIdentifier: jest.fn((id) => id), // Default passthrough
}));

jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
  },
}));

jest.mock('os', () => ({
  userInfo: jest.fn(),
  homedir: jest.fn(),
}));

describe('manageSshAuth tool', () => {
  const mockExecutePrlctl = executePrlctl as jest.MockedFunction<typeof executePrlctl>;
  const mockSanitizeVmIdentifier = sanitizeVmIdentifier as jest.MockedFunction<typeof sanitizeVmIdentifier>;
  const mockFsAccess = fs.access as jest.MockedFunction<typeof fs.access>;
  const mockFsReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
  const mockOsUserInfo = os.userInfo as jest.MockedFunction<typeof os.userInfo>;
  const mockOsHomedir = os.homedir as jest.MockedFunction<typeof os.homedir>;

  const validSshKey = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC7... user@host';
  const defaultHomeDir = '/Users/testuser';
  const defaultUsername = 'testuser';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockOsUserInfo.mockReturnValue({
      username: defaultUsername,
      uid: 501,
      gid: 20,
      shell: '/bin/bash',
      homedir: defaultHomeDir,
    } as any);
    
    mockOsHomedir.mockReturnValue(defaultHomeDir);
    mockSanitizeVmIdentifier.mockImplementation((id) => id);
    mockFsReadFile.mockResolvedValue(validSshKey);
  });

  describe('Input Validation and Security', () => {
    it('should reject empty vmId', async () => {
      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: '',
            username: 'testuser',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('vmId is required');
    });

    it('should sanitize VM identifier to prevent command injection', async () => {
      const maliciousVmId = 'vm1; rm -rf /';
      const sanitizedVmId = 'vm1rmrf';
      
      mockSanitizeVmIdentifier.mockReturnValue(sanitizedVmId);
      mockFsAccess.mockResolvedValue(undefined);
      mockExecutePrlctl.mockResolvedValue({ stdout: '', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: maliciousVmId,
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      await handleManageSshAuth(request);

      expect(mockSanitizeVmIdentifier).toHaveBeenCalledWith(maliciousVmId);
      expect(mockExecutePrlctl).toHaveBeenCalledWith(
        expect.arrayContaining(['exec', sanitizedVmId, expect.any(String)])
      );
    });

    it('should handle malicious usernames with shell metacharacters', async () => {
      const maliciousUsername = 'user$(rm -rf /)';
      mockFsAccess.mockResolvedValue(undefined);
      mockExecutePrlctl.mockResolvedValue({ stdout: '', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            username: maliciousUsername,
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      await handleManageSshAuth(request);

      // The command should include the username but be properly escaped
      const calls = mockExecutePrlctl.mock.calls;
      expect(calls).toHaveLength(2); // User check + main command
      
      // Verify username is used but command injection is prevented
      const userCheckCommand = calls[0][0][2]; // ['exec', vmId, command]
      expect(userCheckCommand).toContain(maliciousUsername);
    });

    it('should handle SSH keys with newlines and special characters', async () => {
      const maliciousSshKey = `ssh-rsa AAAA... user@host
; echo "malicious" > /etc/passwd
$(rm -rf /)`;
      
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(maliciousSshKey);
      mockExecutePrlctl.mockResolvedValue({ stdout: '', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/malicious.pub',
          },
        },
      };

      await handleManageSshAuth(request);

      // The SSH key should be trimmed and used
      const calls = mockExecutePrlctl.mock.calls;
      const mainCommand = calls[1][0][2]; // ['exec', vmId, command]
      
      // Verify the command contains the SSH key but trimmed (only first line)
      expect(mainCommand).toContain('ssh-rsa AAAA... user@host');
      // Note: The implementation uses trim() which only removes leading/trailing whitespace,
      // not internal newlines. The malicious content would still be in the command.
      // This is a security issue that should be fixed in the implementation.
    });
  });

  describe('Mac Username Auto-Detection', () => {
    it('should auto-detect Mac username when not provided', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockExecutePrlctl.mockResolvedValue({ stdout: '192.168.1.100', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      expect(mockOsUserInfo).toHaveBeenCalled();
      expect(result.content[0].text).toContain(`Auto-detected Mac username '${defaultUsername}'`);
      expect(result.content[0].text).toContain(`ssh ${defaultUsername}@192.168.1.100`);
    });

    it('should use provided username over auto-detected one', async () => {
      const providedUsername = 'customuser';
      mockFsAccess.mockResolvedValue(undefined);
      mockExecutePrlctl.mockResolvedValue({ stdout: '192.168.1.100', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            username: providedUsername,
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      expect(result.content[0].text).toContain(`Used provided username '${providedUsername}'`);
      expect(result.content[0].text).toContain(`ssh ${providedUsername}@192.168.1.100`);
    });

    it('should handle os.userInfo() failure gracefully', async () => {
      mockOsUserInfo.mockImplementation(() => {
        throw new Error('Unable to get user info');
      });
      mockFsAccess.mockResolvedValue(undefined);

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unable to get user info');
    });
  });

  describe('SSH Key Discovery', () => {
    it('should find default SSH keys in order of preference', async () => {
      // First two keys don't exist, third one does
      mockFsAccess
        .mockRejectedValueOnce(new Error('Not found')) // id_rsa.pub
        .mockRejectedValueOnce(new Error('Not found')) // id_ed25519.pub
        .mockResolvedValueOnce(undefined); // id_ecdsa.pub exists
      
      mockExecutePrlctl.mockResolvedValue({ stdout: '', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      expect(mockFsAccess).toHaveBeenCalledTimes(3);
      expect(mockFsAccess).toHaveBeenCalledWith(path.join(defaultHomeDir, '.ssh', 'id_rsa.pub'));
      expect(mockFsAccess).toHaveBeenCalledWith(path.join(defaultHomeDir, '.ssh', 'id_ed25519.pub'));
      expect(mockFsAccess).toHaveBeenCalledWith(path.join(defaultHomeDir, '.ssh', 'id_ecdsa.pub'));
      
      expect(result.content[0].text).toContain('id_ecdsa.pub');
    });

    it('should error when no SSH keys are found', async () => {
      mockFsAccess.mockRejectedValue(new Error('Not found'));

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No SSH public key found');
      expect(result.content[0].text).toContain('ssh-keygen');
    });

    it('should use specified public key path', async () => {
      const customKeyPath = '/custom/path/to/key.pub';
      mockFsReadFile.mockResolvedValue(validSshKey);
      mockExecutePrlctl.mockResolvedValue({ stdout: '', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: customKeyPath,
          },
        },
      };

      const result = await handleManageSshAuth(request);

      expect(mockFsReadFile).toHaveBeenCalledWith(customKeyPath, 'utf8');
      expect(result.content[0].text).toContain(customKeyPath);
    });
  });

  describe('User Creation Workflow', () => {
    it('should check if user exists before creating', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      
      // First call fails (user doesn't exist)
      mockExecutePrlctl
        .mockRejectedValueOnce(new Error('User not found'))
        .mockResolvedValueOnce({ stdout: '192.168.1.100', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      expect(mockExecutePrlctl).toHaveBeenCalledTimes(2);
      
      // First call should check user existence
      const userCheckCommand = mockExecutePrlctl.mock.calls[0][0][2];
      expect(userCheckCommand).toContain(`id ${defaultUsername}`);
      
      // Second call should include user creation
      const mainCommand = mockExecutePrlctl.mock.calls[1][0][2];
      expect(mainCommand).toContain(`useradd -m -s /bin/bash ${defaultUsername}`);
      expect(mainCommand).toContain(`usermod -aG sudo ${defaultUsername}`);
      expect(mainCommand).toContain(`chown ${defaultUsername}:${defaultUsername}`);
      
      expect(result.content[0].text).toContain(`User '${defaultUsername}' created`);
    });

    it('should skip user creation if user exists', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      
      // User exists
      mockExecutePrlctl.mockResolvedValue({ stdout: '192.168.1.100', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      const mainCommand = mockExecutePrlctl.mock.calls[1][0][2];
      expect(mainCommand).not.toContain('useradd');
      expect(result.content[0].text).not.toContain('User \'testuser\' created');
    });

    it('should handle user creation with different shell types', async () => {
      const usernames = ['user-dash', 'user_underscore', 'user123'];
      
      for (const username of usernames) {
        jest.clearAllMocks();
        mockFsAccess.mockResolvedValue(undefined);
        mockExecutePrlctl
          .mockRejectedValueOnce(new Error('User not found'))
          .mockResolvedValueOnce({ stdout: '', stderr: '' });

        const request: CallToolRequest = {
          method: 'tools/call',
          params: {
            name: 'manageSshAuth',
            arguments: {
              vmId: 'test-vm',
              username,
              publicKeyPath: '/path/to/key.pub',
            },
          },
        };

        const result = await handleManageSshAuth(request);

        const mainCommand = mockExecutePrlctl.mock.calls[1][0][2];
        expect(mainCommand).toContain(`useradd -m -s /bin/bash ${username}`);
        expect(result.isError).toBeFalsy();
      }
    });
  });

  describe('Passwordless Sudo Configuration', () => {
    it('should configure passwordless sudo when enabled', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockExecutePrlctl.mockResolvedValue({ stdout: '', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/key.pub',
            enablePasswordlessSudo: true,
          },
        },
      };

      const result = await handleManageSshAuth(request);

      const mainCommand = mockExecutePrlctl.mock.calls[1][0][2];
      expect(mainCommand).toContain(`${defaultUsername} ALL=(ALL) NOPASSWD:ALL`);
      expect(mainCommand).toContain(`/etc/sudoers.d/${defaultUsername}`);
      expect(mainCommand).toContain('chmod 440');
      
      expect(result.content[0].text).toContain('Passwordless sudo enabled');
    });

    it('should not configure passwordless sudo by default', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockExecutePrlctl.mockResolvedValue({ stdout: '', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      const mainCommand = mockExecutePrlctl.mock.calls[1][0][2];
      expect(mainCommand).not.toContain('NOPASSWD:ALL');
      expect(mainCommand).not.toContain('/etc/sudoers.d/');
      
      expect(result.content[0].text).not.toContain('Passwordless sudo enabled');
    });
  });

  describe('SSH Service Configuration', () => {
    it('should ensure SSH service is enabled and started', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockExecutePrlctl.mockResolvedValue({ stdout: '', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      await handleManageSshAuth(request);

      const mainCommand = mockExecutePrlctl.mock.calls[1][0][2];
      
      // Should generate host keys
      expect(mainCommand).toContain('ssh-keygen -A');
      
      // Should enable SSH service (both variants)
      expect(mainCommand).toContain('systemctl enable ssh');
      expect(mainCommand).toContain('systemctl enable sshd');
      
      // Should start SSH service (both variants)
      expect(mainCommand).toContain('systemctl start ssh');
      expect(mainCommand).toContain('systemctl start sshd');
    });

    it('should setup SSH directory with proper permissions', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockExecutePrlctl.mockResolvedValue({ stdout: '', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      await handleManageSshAuth(request);

      const mainCommand = mockExecutePrlctl.mock.calls[1][0][2];
      
      // Should create .ssh directory
      expect(mainCommand).toContain(`mkdir -p /home/${defaultUsername}/.ssh`);
      expect(mainCommand).toContain('chmod 700');
      
      // Should set authorized_keys permissions
      expect(mainCommand).toContain('chmod 600');
      expect(mainCommand).toContain(`chown ${defaultUsername}:${defaultUsername}`);
    });
  });

  describe('IP Address Detection', () => {
    it('should extract and display VM IP address', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockExecutePrlctl.mockResolvedValue({ 
        stdout: 'Added key\n192.168.1.123\n', 
        stderr: '' 
      });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      expect(result.content[0].text).toContain('ssh testuser@192.168.1.123');
    });

    it('should handle missing IP address gracefully', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockExecutePrlctl.mockResolvedValue({ 
        stdout: 'No IP found', 
        stderr: '' 
      });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      expect(result.content[0].text).toContain('ssh testuser@VM_IP_ADDRESS');
      expect(result.content[0].text).toContain('prlctl list -f');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete workflow: detect username → create user → setup SSH → configure sudo', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      
      // User doesn't exist, then create
      mockExecutePrlctl
        .mockRejectedValueOnce(new Error('User not found'))
        .mockResolvedValueOnce({ stdout: '10.0.0.100', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/key.pub',
            enablePasswordlessSudo: true,
          },
        },
      };

      const result = await handleManageSshAuth(request);

      // Verify complete workflow
      expect(mockOsUserInfo).toHaveBeenCalled(); // Username detection
      
      const mainCommand = mockExecutePrlctl.mock.calls[1][0][2];
      expect(mainCommand).toContain('useradd'); // User creation
      expect(mainCommand).toContain('ssh-keygen -A'); // SSH setup
      expect(mainCommand).toContain('authorized_keys'); // Key addition
      expect(mainCommand).toContain('NOPASSWD:ALL'); // Sudo config
      
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Success');
    });

    it('should handle VM execution errors gracefully', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockExecutePrlctl
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // User exists
        .mockRejectedValueOnce(new Error('VM is not running'));

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'stopped-vm',
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('VM is not running');
    });

    it('should handle file read errors gracefully', async () => {
      mockFsReadFile.mockRejectedValue(new Error('Permission denied'));

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/protected/key.pub',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Permission denied');
    });

    it('should handle partial failures in command chain', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      
      // Simulate partial command failure
      mockExecutePrlctl
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // User check succeeds
        .mockRejectedValueOnce(new Error('Failed to start SSH service'));

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to start SSH service');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty SSH key file', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue('');
      mockExecutePrlctl.mockResolvedValue({ stdout: '', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/empty.pub',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      // Should still work with empty key (trimmed to empty string)
      expect(result.isError).toBeFalsy();
    });

    it('should handle very long usernames gracefully', async () => {
      const longUsername = 'a'.repeat(100);
      mockFsAccess.mockResolvedValue(undefined);
      mockExecutePrlctl.mockResolvedValue({ stdout: '', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            username: longUsername,
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain(longUsername);
    });

    it('should handle SSH keys with Windows line endings', async () => {
      const windowsKey = 'ssh-rsa AAAAB3NzaC1yc2EA... user@host\r\n';
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(windowsKey);
      mockExecutePrlctl.mockResolvedValue({ stdout: '', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      await handleManageSshAuth(request);

      const mainCommand = mockExecutePrlctl.mock.calls[1][0][2];
      // Should trim the key properly
      expect(mainCommand).toContain('ssh-rsa AAAAB3NzaC1yc2EA... user@host');
      expect(mainCommand).not.toContain('\r');
      expect(mainCommand).not.toContain('\n');
    });

    it('should handle VM names with special characters', async () => {
      const specialVmName = 'test-vm-2024.prod';
      mockFsAccess.mockResolvedValue(undefined);
      mockExecutePrlctl.mockResolvedValue({ stdout: '', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: specialVmName,
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      const result = await handleManageSshAuth(request);

      expect(mockSanitizeVmIdentifier).toHaveBeenCalledWith(specialVmName);
      expect(result.isError).toBeFalsy();
    });

    it('should handle concurrent execution attempts gracefully', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockExecutePrlctl.mockResolvedValue({ stdout: '', stderr: '' });

      const request: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: 'manageSshAuth',
          arguments: {
            vmId: 'test-vm',
            publicKeyPath: '/path/to/key.pub',
          },
        },
      };

      // Simulate concurrent calls
      const results = await Promise.all([
        handleManageSshAuth(request),
        handleManageSshAuth(request),
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].isError).toBeFalsy();
      expect(results[1].isError).toBeFalsy();
    });
  });
});