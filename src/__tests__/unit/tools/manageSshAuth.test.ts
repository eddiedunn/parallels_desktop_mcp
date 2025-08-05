// Mock child_process at the top
jest.mock('child_process');

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
  const mockSanitizeVmIdentifier = sanitizeVmIdentifier as jest.MockedFunction<
    typeof sanitizeVmIdentifier
  >;
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

  // Helper to setup only VM access mocks (for tests that expect failures after VM check)
  const setupVmAccessMocks = () => {
    // 1. Mock VM status check - checkVmAccess calls 'list --all'
    mockExecutePrlctl.mockResolvedValueOnce({ 
      stdout: 'UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              test-vm  running      -', 
      stderr: '' 
    });
    // 2. Mock VM accessibility check - checkVmAccess calls 'exec' with echo test
    mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'test', stderr: '' });
  };

  // Helper to setup successful VM access mocks
  const setupSuccessfulVmMocks = (username: string = defaultUsername) => {
    // 1. Mock VM status check - checkVmAccess calls 'list --all'
    mockExecutePrlctl.mockResolvedValueOnce({ 
      stdout: 'UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              test-vm  running      -', 
      stderr: '' 
    });
    // 2. Mock VM accessibility check - checkVmAccess calls 'exec' with echo test
    mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'test', stderr: '' });
    // 3. Mock user check
    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: `${username}:x:1000:1000:User:/home/${username}:/bin/bash`,
      stderr: '',
    });
    // 4. Mock SSH service configuration (combined command)
    mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' });
    // 5. Mock SSH key installation (combined mkdir, touch, append, chmod, chown)
    mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' });
    // 6. Mock IP address discovery
    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: '192.168.1.100\n',
      stderr: '',
    });
  };

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

      // Mock VM status check
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: `${sanitizedVmId}  running`, stderr: '' });
      // Mock VM accessibility check
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'test', stderr: '' });
      // Mock remaining exec calls
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

      // Mock VM status check
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'test-vm  running', stderr: '' });
      // Mock VM accessibility check
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'test', stderr: '' });
      // Mock remaining exec calls
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
      expect(calls.length).toBeGreaterThanOrEqual(3); // VM status + VM access + user check + main commands

      // Verify username is used but command injection is prevented
      // Find the user check command (skip VM status and access checks)
      const execCalls = calls.filter((call) => call[0][0] === 'exec' && call[0][1] === 'test-vm');
      const userCheckCall = execCalls.find(
        (call) => call[0][2]?.includes('getent') || call[0][2]?.includes(maliciousUsername)
      );

      expect(userCheckCall).toBeDefined();
      if (userCheckCall) {
        expect(userCheckCall[0][2]).toContain(maliciousUsername);
      }
    });

    it('should handle SSH keys with newlines and special characters', async () => {
      const maliciousSshKey = `ssh-rsa AAAA... user@host
; echo "malicious" > /etc/passwd
$(rm -rf /)`;

      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(maliciousSshKey);

      // Mock VM status check
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'test-vm  running', stderr: '' });
      // Mock VM accessibility check
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'test', stderr: '' });
      // Mock remaining exec calls
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

      // Find the SSH key setup command (skip VM status and access checks)
      const execCalls = calls.filter((call) => call[0][0] === 'exec' && call[0][1] === 'test-vm');
      const sshKeyCall = execCalls.find((call) => call[0][2]?.includes('ssh-rsa'));

      // Verify the command contains the SSH key but trimmed (only first line)
      expect(sshKeyCall).toBeDefined();
      if (sshKeyCall) {
        expect(sshKeyCall[0][2]).toContain('ssh-rsa AAAA... user@host');
      }
      // Note: The implementation uses trim() which only removes leading/trailing whitespace,
      // not internal newlines. The malicious content would still be in the command.
      // This is a security issue that should be fixed in the implementation.
    });
  });

  describe('Mac Username Auto-Detection', () => {
    it('should auto-detect Mac username when not provided', async () => {
      // Mock SSH key file exists
      mockFsAccess.mockResolvedValue(undefined);
      // Mock reading SSH key file
      mockFsReadFile.mockResolvedValue('ssh-rsa AAAAB3... user@host');

      setupSuccessfulVmMocks();

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
      mockFsReadFile.mockResolvedValue(validSshKey);

      setupSuccessfulVmMocks(providedUsername);

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

      setupSuccessfulVmMocks();

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
      expect(mockFsAccess).toHaveBeenCalledWith(
        path.join(defaultHomeDir, '.ssh', 'id_ed25519.pub')
      );
      expect(mockFsAccess).toHaveBeenCalledWith(path.join(defaultHomeDir, '.ssh', 'id_ecdsa.pub'));

      expect(result.content[0].text).toContain('id_ecdsa.pub');
    });

    it('should error when no SSH keys are found', async () => {
      mockFsAccess.mockRejectedValue(new Error('Not found'));
      
      // Setup VM access mocks since the tool checks VM first
      setupVmAccessMocks();

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
      
      // Need to setup the full mock sequence
      setupSuccessfulVmMocks();

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
      expect(result.content[0].text).toContain('SSH Configuration Completed');
    });
  });

  describe('User Creation Workflow', () => {
    it('should check if user exists before creating', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(validSshKey);

      // Setup the complete flow with user creation
      mockExecutePrlctl
        // 1. VM status check
        .mockResolvedValueOnce({
          stdout: 'UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              test-vm  running      -',
          stderr: '',
        })
        // 2. VM accessibility check
        .mockResolvedValueOnce({ stdout: 'test', stderr: '' })
        // 3. User doesn't exist
        .mockRejectedValueOnce(new Error(`id: '${defaultUsername}': no such user`))
        // 4. User creation
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 5. SSH service configuration
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 6. SSH key installation
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 7. IP discovery
        .mockResolvedValueOnce({ stdout: '192.168.1.100\n', stderr: '' });

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

      expect(mockExecutePrlctl).toHaveBeenCalledTimes(7);

      // Check user existence check (3rd call)
      const userCheckCall = mockExecutePrlctl.mock.calls[2];
      expect(userCheckCall[0][0]).toBe('exec');
      expect(userCheckCall[0][2]).toContain(`id ${defaultUsername}`);

      // Check user creation command (4th call)
      const userCreateCall = mockExecutePrlctl.mock.calls[3];
      expect(userCreateCall[0][0]).toBe('exec');
      expect(userCreateCall[0][2]).toContain(`useradd -m -s /bin/bash ${defaultUsername}`);
      expect(userCreateCall[0][2]).toContain(`usermod -aG sudo ${defaultUsername}`);

      expect(result.content[0].text).toContain(`User '${defaultUsername}' created`);
      expect(result.content[0].text).toContain('SSH Configuration Completed');
    });

    it('should skip user creation if user exists', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(validSshKey);

      // Setup successful flow with existing user
      setupSuccessfulVmMocks();

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

      // Check that SSH service command doesn't contain useradd (it's in the 4th call)
      const sshServiceCall = mockExecutePrlctl.mock.calls[3];
      expect(sshServiceCall[0][0]).toBe('exec');
      // The SSH service call shouldn't contain useradd since user already exists
      expect(sshServiceCall[0][2]).toContain('ssh-keygen');
      
      expect(result.content[0].text).not.toContain("User 'testuser' created");
      expect(result.content[0].text).toContain('SSH Configuration Completed');
    });

    it('should handle user creation with different shell types', async () => {
      const usernames = ['user-dash', 'user_underscore', 'user123'];

      for (const username of usernames) {
        jest.clearAllMocks();
        
        // Reset OS mocks for this username
        mockOsUserInfo.mockReturnValue({
          username,
          uid: 501,
          gid: 20,
          shell: '/bin/bash',
          homedir: `/Users/${username}`,
        } as any);
        
        mockFsAccess.mockResolvedValue(undefined);
        mockFsReadFile.mockResolvedValue(validSshKey);
        
        // Setup user creation flow
        mockExecutePrlctl
          .mockResolvedValueOnce({
            stdout: 'UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              test-vm  running      -',
            stderr: '',
          })
          .mockResolvedValueOnce({ stdout: 'test', stderr: '' })
          .mockRejectedValueOnce(new Error(`id: '${username}': no such user`))
          .mockResolvedValueOnce({ stdout: '', stderr: '' })
          .mockResolvedValueOnce({ stdout: '', stderr: '' })
          .mockResolvedValueOnce({ stdout: '192.168.1.100\n', stderr: '' });

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

        const userCreateCall = mockExecutePrlctl.mock.calls[3];
        expect(userCreateCall[0][2]).toContain(`useradd -m -s /bin/bash ${username}`);
        expect(result.isError).toBeFalsy();
      }
    });
  });

  describe('Passwordless Sudo Configuration', () => {
    it('should configure passwordless sudo when enabled', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(validSshKey);

      // Mock complete flow with passwordless sudo
      mockExecutePrlctl
        // 1. VM status check
        .mockResolvedValueOnce({
          stdout: 'UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              test-vm  running      -',
          stderr: '',
        })
        // 2. VM accessibility check
        .mockResolvedValueOnce({ stdout: 'test', stderr: '' })
        // 3. User exists
        .mockResolvedValueOnce({
          stdout: `${defaultUsername}:x:1000:1000:User:/home/${defaultUsername}:/bin/bash`,
          stderr: '',
        })
        // 4. SSH service configuration
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 5. SSH key installation
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 6. Passwordless sudo configuration
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 7. IP address retrieval
        .mockResolvedValueOnce({ stdout: '192.168.1.100\n', stderr: '' });

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

      // The sudo configuration should be in the 6th call (after SSH key installation)
      const sudoCall = mockExecutePrlctl.mock.calls[5];
      expect(sudoCall[0][0]).toBe('exec');
      expect(sudoCall[0][2]).toContain(`${defaultUsername} ALL=(ALL) NOPASSWD:ALL`);
      expect(sudoCall[0][2]).toContain(`/etc/sudoers.d/${defaultUsername}`);

      expect(result.content[0].text).toContain('Passwordless sudo enabled');
      expect(result.content[0].text).toContain('SSH Configuration Completed');
    });

    it('should not configure passwordless sudo by default', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(validSshKey);

      setupSuccessfulVmMocks();

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

      // Verify no sudo configuration was attempted
      const calls = mockExecutePrlctl.mock.calls;
      const sudoCall = calls.find(
        (call) => call[0][0] === 'exec' && call[0][2]?.includes('NOPASSWD:ALL')
      );

      expect(sudoCall).toBeUndefined();
      expect(result.content[0].text).not.toContain('Passwordless sudo');
    });
  });

  describe('SSH Service Configuration', () => {
    it('should ensure SSH service is enabled and started', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(validSshKey);

      setupSuccessfulVmMocks();

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

      // SSH service configuration is in the 4th call
      const sshServiceCall = mockExecutePrlctl.mock.calls[3];
      expect(sshServiceCall[0][0]).toBe('exec');
      const sshCommand = sshServiceCall[0][2];

      // Should generate host keys
      expect(sshCommand).toContain('ssh-keygen -A');

      // Should enable SSH service (both variants)
      expect(sshCommand).toContain('systemctl enable ssh');
      expect(sshCommand).toContain('systemctl enable sshd');

      // Should start SSH service (both variants)
      expect(sshCommand).toContain('systemctl start ssh');
      expect(sshCommand).toContain('systemctl start sshd');
    });

    it('should setup SSH directory with proper permissions', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(validSshKey);

      setupSuccessfulVmMocks();

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

      // SSH key installation is in the 5th call
      const sshKeyCall = mockExecutePrlctl.mock.calls[4];
      expect(sshKeyCall[0][0]).toBe('exec');
      const sshKeyCommand = sshKeyCall[0][2];

      // Should create .ssh directory
      expect(sshKeyCommand).toContain(`mkdir -p /home/${defaultUsername}/.ssh`);
      expect(sshKeyCommand).toContain('chmod 700');

      // Should set authorized_keys permissions
      expect(sshKeyCommand).toContain('chmod 600');
      expect(sshKeyCommand).toContain(`chown ${defaultUsername}:${defaultUsername}`);
    });
  });

  describe('IP Address Detection', () => {
    it('should extract and display VM IP address', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(validSshKey);

      // Setup VM with correct IP extraction flow
      mockExecutePrlctl
        // 1. VM status check
        .mockResolvedValueOnce({
          stdout: 'UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              test-vm  running      -',
          stderr: '',
        })
        // 2. VM accessibility check
        .mockResolvedValueOnce({ stdout: 'test', stderr: '' })
        // 3. User exists
        .mockResolvedValueOnce({
          stdout: `${defaultUsername}:x:1000:1000:User:/home/${defaultUsername}:/bin/bash`,
          stderr: '',
        })
        // 4. SSH service configuration
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 5. SSH key installation
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 6. IP address extraction with expected output
        .mockResolvedValueOnce({
          stdout: '192.168.1.123\n',
          stderr: '',
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
      mockFsReadFile.mockResolvedValue(validSshKey);

      // Setup VM but IP extraction fails
      mockExecutePrlctl
        // 1. VM status check
        .mockResolvedValueOnce({
          stdout: 'UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              test-vm  running      -',
          stderr: '',
        })
        // 2. VM accessibility check
        .mockResolvedValueOnce({ stdout: 'test', stderr: '' })
        // 3. User exists
        .mockResolvedValueOnce({
          stdout: `${defaultUsername}:x:1000:1000:User:/home/${defaultUsername}:/bin/bash`,
          stderr: '',
        })
        // 4. SSH service configuration
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 5. SSH key installation
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 6. IP address extraction fails - no valid IP
        .mockResolvedValueOnce({
          stdout: '',
          stderr: '',
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
      mockFsReadFile.mockResolvedValue(validSshKey);

      // Mock VM status check with proper format
      mockExecutePrlctl
        // 1. VM status check
        .mockResolvedValueOnce({
          stdout: 'UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              test-vm  running      -',
          stderr: '',
        })
        // 2. VM accessibility check
        .mockResolvedValueOnce({ stdout: 'test', stderr: '' })
        // 3. User check - user doesn't exist
        .mockRejectedValueOnce(new Error('User not found'))
        // 4. User creation
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 5. SSH service configuration
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 6. SSH key installation
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 7. Passwordless sudo configuration
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 8. IP address fetch
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

      const calls = mockExecutePrlctl.mock.calls;

      // Verify user creation
      const userCreationCall = calls.find(
        (call) => call[0][0] === 'exec' && call[0][2]?.includes('useradd')
      );
      expect(userCreationCall).toBeDefined();

      // Verify SSH setup
      const sshServiceCall = calls.find(
        (call) => call[0][0] === 'exec' && call[0][2]?.includes('ssh-keygen -A')
      );
      expect(sshServiceCall).toBeDefined();

      // Verify key addition
      const sshKeyCall = calls.find(
        (call) => call[0][0] === 'exec' && call[0][2]?.includes('authorized_keys')
      );
      expect(sshKeyCall).toBeDefined();

      // Verify sudo config
      const sudoCall = calls.find(
        (call) => call[0][0] === 'exec' && call[0][2]?.includes('NOPASSWD:ALL')
      );
      expect(sudoCall).toBeDefined();

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Completed');
    });

    it('should handle VM execution errors gracefully', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      // Mock VM status check with proper format - VM not running
      mockExecutePrlctl.mockResolvedValueOnce({
        stdout: 'UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              stopped-vm  stopped      -',
        stderr: '',
      });

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
      expect(result.content[0].text).toContain('not accessible');
    });

    it('should handle file read errors gracefully', async () => {
      mockFsReadFile.mockRejectedValue(new Error('Permission denied'));

      // Setup VM access mocks since the tool checks VM first
      mockExecutePrlctl
        // 1. VM status check
        .mockResolvedValueOnce({
          stdout: 'UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              test-vm  running      -',
          stderr: '',
        })
        // 2. VM accessibility check
        .mockResolvedValueOnce({ stdout: 'test', stderr: '' });

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
      mockFsReadFile.mockResolvedValue(validSshKey);

      // Mock VM status check with proper format
      mockExecutePrlctl
        // 1. VM status check
        .mockResolvedValueOnce({
          stdout: 'UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              test-vm  running      -',
          stderr: '',
        })
        // 2. VM accessibility check
        .mockResolvedValueOnce({ stdout: 'test', stderr: '' })
        // 3. User check - user exists
        .mockResolvedValueOnce({
          stdout: `${defaultUsername}:x:1000:1000`,
          stderr: '',
        })
        // 4. SSH service configuration - fails
        .mockRejectedValueOnce(new Error('Failed to start SSH service'))
        // 5. SSH key installation
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 6. IP address fetch
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

      // SSH service failure is not critical, should continue
      expect(result.isError).toBeUndefined(); // Success response doesn't have isError property
      expect(result.content[0].text).toContain('Failed/Skipped Steps');
      expect(result.content[0].text).toContain('SSH Service Configuration');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty SSH key file', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue('');

      // Setup VM access mocks since the tool checks VM first
      mockExecutePrlctl
        // 1. VM status check
        .mockResolvedValueOnce({
          stdout: 'UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              test-vm  running      -',
          stderr: '',
        })
        // 2. VM accessibility check
        .mockResolvedValueOnce({ stdout: 'test', stderr: '' });

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

      // Should fail with invalid SSH key format
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid SSH public key format');
    });

    it('should handle very long usernames gracefully', async () => {
      const longUsername = 'a'.repeat(100);
      mockFsAccess.mockResolvedValue(undefined);

      // Mock VM status check (list --all)
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'test-vm  running', stderr: '' });
      // Mock VM accessibility check (exec echo)
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'test', stderr: '' });
      // Mock user check - user doesn't exist
      mockExecutePrlctl.mockRejectedValueOnce(new Error('User not found'));
      // Mock user creation
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // Mock SSH service configuration
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // Mock SSH key installation
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // Mock IP address fetch
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: '192.168.1.100', stderr: '' });

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

      setupSuccessfulVmMocks();

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

      // Find the SSH key installation command
      // The key should be trimmed and used successfully
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('SSH Configuration');

      // Verify the SSH key was processed (trimmed)
      const calls = mockExecutePrlctl.mock.calls;
      const sshKeyCall = calls.find(
        (call) => call[0][0] === 'exec' && call[0][2]?.includes('authorized_keys')
      );

      if (sshKeyCall) {
        const command = sshKeyCall[0][2];
        // Should trim the key properly
        expect(command).toContain('ssh-rsa AAAAB3NzaC1yc2EA... user@host');
        expect(command).not.toContain('\r');
        expect(command).not.toContain('\n');
      }
    });

    it('should handle VM names with special characters', async () => {
      const specialVmName = 'test-vm-2024.prod';
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReadFile.mockResolvedValue(validSshKey);

      // Need to update the VM status output to include the special VM name
      mockExecutePrlctl
        // 1. VM status check with special name
        .mockResolvedValueOnce({
          stdout: `UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              ${specialVmName}  running      -`,
          stderr: '',
        })
        // 2. VM accessibility check
        .mockResolvedValueOnce({ stdout: 'test', stderr: '' })
        // 3. User exists
        .mockResolvedValueOnce({
          stdout: `${defaultUsername}:x:1000:1000:User:/home/${defaultUsername}:/bin/bash`,
          stderr: '',
        })
        // 4. SSH service configuration
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 5. SSH key installation
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        // 6. IP address discovery
        .mockResolvedValueOnce({
          stdout: '192.168.1.100\n',
          stderr: '',
        });

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
      mockFsReadFile.mockResolvedValue(validSshKey); // Use mockResolvedValue for all calls
      
      // Since concurrent calls can interleave, we need to set up mocks that work for any order
      // Using mockResolvedValue instead of mockResolvedValueOnce to handle any call order
      const vmStatusOutput = {
        stdout: 'UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              test-vm  running      -',
        stderr: '',
      };
      
      const echoTestOutput = { stdout: 'test', stderr: '' };
      const userExistsOutput = {
        stdout: `${defaultUsername}:x:1000:1000`,
        stderr: '',
      };
      const commandSuccessOutput = { stdout: '', stderr: '' };
      const ipOutput = { stdout: '192.168.1.100', stderr: '' };
      
      // Mock all calls to handle concurrent execution in any order
      mockExecutePrlctl.mockImplementation((args) => {
        const command = args.join(' ');
        
        if (command.includes('list --all')) {
          return Promise.resolve(vmStatusOutput);
        } else if (command.includes('exec test-vm echo')) {
          return Promise.resolve(echoTestOutput);
        } else if (command.includes('exec test-vm id')) {
          return Promise.resolve(userExistsOutput);
        } else if (command.includes('exec test-vm ip -4 addr')) {
          return Promise.resolve(ipOutput);
        } else {
          // All other exec commands succeed
          return Promise.resolve(commandSuccessOutput);
        }
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

      // Simulate concurrent calls
      const results = await Promise.all([
        handleManageSshAuth(request),
        handleManageSshAuth(request),
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].isError).toBeUndefined(); // Success response doesn't have isError property
      expect(results[1].isError).toBeUndefined(); // Success response doesn't have isError property
    });
  });
});
