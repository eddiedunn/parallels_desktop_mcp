/**
 * SSH Auth Mock Helpers
 * 
 * Specialized mock configurations for manageSshAuth tests
 */

import { executePrlctl } from '../../prlctl-handler';
import { promises as fs } from 'fs';
import * as os from 'os';

const mockExecutePrlctl = executePrlctl as jest.MockedFunction<typeof executePrlctl>;
const mockFsAccess = fs.access as jest.MockedFunction<typeof fs.access>;
const mockFsReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockOsUserInfo = os.userInfo as jest.MockedFunction<typeof os.userInfo>;
const mockOsHomedir = os.homedir as jest.MockedFunction<typeof os.homedir>;

export interface SshAuthMockConfig {
  vmName?: string;
  vmStatus?: 'running' | 'stopped';
  vmAccessible?: boolean;
  username?: string;
  userExists?: boolean;
  sshKeyExists?: boolean;
  sshKeyContent?: string;
  enablePasswordlessSudo?: boolean;
  vmIpAddress?: string;
  failAtStep?: 'vm-check' | 'accessibility' | 'user-check' | 'ssh-service' | 'ssh-key' | 'ip-discovery';
  errorMessage?: string;
}

export class SshAuthMockHelpers {
  static readonly DEFAULT_SSH_KEY = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC... user@example.com';
  static readonly DEFAULT_USERNAME = 'testuser';
  static readonly DEFAULT_HOMEDIR = '/Users/testuser';
  
  /**
   * Setup mocks for a complete successful SSH auth flow
   */
  static setupSuccessfulFlow(config: SshAuthMockConfig = {}): void {
    const {
      vmName = 'test-vm',
      username = this.DEFAULT_USERNAME,
      vmIpAddress = '192.168.1.100',
      sshKeyContent = this.DEFAULT_SSH_KEY,
    } = config;
    
    // Clear previous mocks
    jest.clearAllMocks();
    
    // Setup OS mocks
    mockOsUserInfo.mockReturnValue({
      username,
      uid: 501,
      gid: 20,
      shell: '/bin/bash',
      homedir: `/Users/${username}`,
    } as any);
    
    mockOsHomedir.mockReturnValue(`/Users/${username}`);
    
    // Setup filesystem mocks
    this.setupFilesystemMocks(config);
    
    // Setup prlctl command sequence
    mockExecutePrlctl
      // 1. VM status check (list --all)
      .mockResolvedValueOnce({
        stdout: `UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              ${vmName}  running      -`,
        stderr: '',
      })
      // 2. VM accessibility check (exec echo test)
      .mockResolvedValueOnce({ stdout: 'test', stderr: '' })
      // 3. User existence check
      .mockResolvedValueOnce({
        stdout: `${username}:x:1000:1000:User:/home/${username}:/bin/bash`,
        stderr: '',
      })
      // 4. SSH service configuration
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // 5. SSH key installation
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // 6. IP address discovery
      .mockResolvedValueOnce({
        stdout: `${vmIpAddress}\n`,
        stderr: '',
      });
    
    // 7. Optional: passwordless sudo configuration
    if (config.enablePasswordlessSudo) {
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' });
    }
  }
  
  /**
   * Setup mocks for VM access checks only (for tests that expect failures after)
   */
  static setupVmAccessOnly(config: SshAuthMockConfig = {}): void {
    const {
      vmName = 'test-vm',
      vmStatus = 'running',
      vmAccessible = true,
    } = config;
    
    // 1. VM status check
    mockExecutePrlctl.mockResolvedValueOnce({
      stdout: `UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              ${vmName}  ${vmStatus}      -`,
      stderr: '',
    });
    
    // 2. VM accessibility check (only if running)
    if (vmStatus === 'running' && vmAccessible) {
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'test', stderr: '' });
    } else if (vmStatus === 'running' && !vmAccessible) {
      mockExecutePrlctl.mockRejectedValueOnce(
        new Error(`VM '${vmName}' is not accessible: VM is not running`)
      );
    }
  }
  
  /**
   * Setup mocks for specific failure scenarios
   */
  static setupFailureAt(step: SshAuthMockConfig['failAtStep'], config: SshAuthMockConfig = {}): void {
    const {
      vmName = 'test-vm',
      username = this.DEFAULT_USERNAME,
      errorMessage,
    } = config;
    
    jest.clearAllMocks();
    
    // Setup OS and filesystem mocks
    this.setupBasicMocks(config);
    
    switch (step) {
      case 'vm-check':
        mockExecutePrlctl.mockRejectedValueOnce(
          new Error(errorMessage || `Failed to get VM '${vmName}' info: The virtual machine could not be found.`)
        );
        break;
        
      case 'accessibility':
        // VM exists but not accessible
        mockExecutePrlctl
          .mockResolvedValueOnce({
            stdout: `UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              ${vmName}  running      -`,
            stderr: '',
          })
          .mockRejectedValueOnce(
            new Error(errorMessage || `VM '${vmName}' is not accessible: VM is not running`)
          );
        break;
        
      case 'user-check':
        mockExecutePrlctl
          .mockResolvedValueOnce({
            stdout: `UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              ${vmName}  running      -`,
            stderr: '',
          })
          .mockResolvedValueOnce({ stdout: 'test', stderr: '' })
          .mockRejectedValueOnce(
            new Error(errorMessage || `id: '${username}': no such user`)
          );
        break;
        
      case 'ssh-service':
        this.setupUpToUserCheck(config);
        mockExecutePrlctl.mockRejectedValueOnce(
          new Error(errorMessage || 'Failed to configure SSH service')
        );
        break;
        
      case 'ssh-key':
        this.setupUpToSshService(config);
        mockExecutePrlctl.mockRejectedValueOnce(
          new Error(errorMessage || 'Failed to install SSH key')
        );
        break;
        
      case 'ip-discovery':
        this.setupUpToSshKey(config);
        mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' });
        break;
    }
  }
  
  /**
   * Setup filesystem mocks
   */
  private static setupFilesystemMocks(config: SshAuthMockConfig): void {
    const {
      username = this.DEFAULT_USERNAME,
      sshKeyExists = true,
      sshKeyContent = this.DEFAULT_SSH_KEY,
    } = config;
    
    mockFsAccess.mockImplementation(async (path) => {
      const pathStr = path.toString();
      if (
        pathStr.includes('.ssh/id_rsa.pub') ||
        pathStr.includes('.ssh/id_ed25519.pub') ||
        pathStr.includes('.ssh/id_ecdsa.pub')
      ) {
        if (sshKeyExists && pathStr.includes('id_rsa.pub')) {
          return undefined; // File exists
        }
        throw new Error('ENOENT');
      }
      throw new Error('ENOENT');
    });
    
    mockFsReadFile.mockImplementation(async (path) => {
      const pathStr = path.toString();
      if (sshKeyExists && pathStr.includes('.ssh/id_rsa.pub')) {
        return sshKeyContent;
      }
      throw new Error('ENOENT');
    });
  }
  
  /**
   * Setup basic OS and filesystem mocks
   */
  private static setupBasicMocks(config: SshAuthMockConfig): void {
    const { username = this.DEFAULT_USERNAME } = config;
    
    mockOsUserInfo.mockReturnValue({
      username,
      uid: 501,
      gid: 20,
      shell: '/bin/bash',
      homedir: `/Users/${username}`,
    } as any);
    
    mockOsHomedir.mockReturnValue(`/Users/${username}`);
    
    this.setupFilesystemMocks(config);
  }
  
  /**
   * Setup mocks up to user check (for partial flow tests)
   */
  private static setupUpToUserCheck(config: SshAuthMockConfig): void {
    const {
      vmName = 'test-vm',
      username = this.DEFAULT_USERNAME,
      userExists = true,
    } = config;
    
    mockExecutePrlctl
      .mockResolvedValueOnce({
        stdout: `UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              ${vmName}  running      -`,
        stderr: '',
      })
      .mockResolvedValueOnce({ stdout: 'test', stderr: '' });
    
    if (userExists) {
      mockExecutePrlctl.mockResolvedValueOnce({
        stdout: `${username}:x:1000:1000:User:/home/${username}:/bin/bash`,
        stderr: '',
      });
    } else {
      mockExecutePrlctl.mockRejectedValueOnce(
        new Error(`id: '${username}': no such user`)
      );
    }
  }
  
  /**
   * Setup mocks up to SSH service configuration
   */
  private static setupUpToSshService(config: SshAuthMockConfig): void {
    this.setupUpToUserCheck(config);
    mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' });
  }
  
  /**
   * Setup mocks up to SSH key installation
   */
  private static setupUpToSshKey(config: SshAuthMockConfig): void {
    this.setupUpToSshService(config);
    mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' });
  }
  
  /**
   * Create a mock sequence for user creation flow
   */
  static setupUserCreationFlow(config: SshAuthMockConfig = {}): void {
    const {
      vmName = 'test-vm',
      username = this.DEFAULT_USERNAME,
      vmIpAddress = '192.168.1.100',
    } = config;
    
    jest.clearAllMocks();
    this.setupBasicMocks(config);
    
    mockExecutePrlctl
      // 1. VM status check
      .mockResolvedValueOnce({
        stdout: `UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              ${vmName}  running      -`,
        stderr: '',
      })
      // 2. VM accessibility check
      .mockResolvedValueOnce({ stdout: 'test', stderr: '' })
      // 3. User doesn't exist
      .mockRejectedValueOnce(new Error(`id: '${username}': no such user`))
      // 4. User creation and setup commands (combined)
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // 5. SSH key installation
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      // 6. IP discovery
      .mockResolvedValueOnce({ stdout: `${vmIpAddress}\n`, stderr: '' });
  }
  
  /**
   * Helper to assert the correct number of prlctl calls
   */
  static assertCallCount(expected: number): void {
    expect(mockExecutePrlctl).toHaveBeenCalledTimes(expected);
  }
  
  /**
   * Helper to get specific call arguments
   */
  static getCall(index: number): any[] {
    return mockExecutePrlctl.mock.calls[index];
  }
  
  /**
   * Clear all mocks
   */
  static clearMocks(): void {
    jest.clearAllMocks();
  }
}