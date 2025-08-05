/**
 * Mock Factory Patterns for Parallels Desktop MCP Tests
 * 
 * Provides comprehensive mock configurations and factory patterns
 * to simplify test setup and reduce duplication across test files.
 */

import { PrlctlResult, executePrlctl } from '../../prlctl-handler';
import { MockResponseFactory } from './prlctl-mock';
import { SystemMockConfig, setupOsMocks } from './system-mocks';
import { promises as fs } from 'fs';
import * as os from 'os';

// Get mocked functions
const mockExecutePrlctl = executePrlctl as jest.MockedFunction<typeof executePrlctl>;
const mockFsAccess = fs.access as jest.MockedFunction<typeof fs.access>;
const mockFsReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockOsUserInfo = os.userInfo as jest.MockedFunction<typeof os.userInfo>;
const mockOsHomedir = os.homedir as jest.MockedFunction<typeof os.homedir>;

export interface VmState {
  uuid: string;
  name: string;
  status: 'running' | 'stopped' | 'suspended' | 'paused';
  accessible: boolean;
  ipAddress?: string;
  hostname?: string;
  users?: string[];
}

export interface MockScenarioConfig {
  vmState: VmState;
  systemConfig?: SystemMockConfig;
  sshKeys?: {
    exists: boolean;
    content?: string;
    path?: string;
  };
  filesystem?: {
    [path: string]: {
      exists: boolean;
      content?: string;
      error?: string;
    };
  };
}

/**
 * Factory for creating comprehensive mock scenarios
 */
export class MockScenarioFactory {
  private static readonly DEFAULT_SSH_KEY = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC... user@example.com';
  private static readonly DEFAULT_USERNAME = 'testuser';
  
  /**
   * VM State Presets
   */
  static vmStates = {
    running: (name: string = 'test-vm', ipAddress: string = '192.168.1.100'): VmState => ({
      uuid: '{550e8400-e29b-41d4-a716-446655440000}',
      name,
      status: 'running',
      accessible: true,
      ipAddress,
      hostname: name,
      users: [this.DEFAULT_USERNAME],
    }),
    
    stopped: (name: string = 'test-vm'): VmState => ({
      uuid: '{550e8400-e29b-41d4-a716-446655440001}',
      name,
      status: 'stopped',
      accessible: false,
      hostname: name,
      users: [],
    }),
    
    suspended: (name: string = 'test-vm'): VmState => ({
      uuid: '{550e8400-e29b-41d4-a716-446655440002}',
      name,
      status: 'suspended',
      accessible: false,
      hostname: name,
      users: [],
    }),
    
    inaccessible: (name: string = 'test-vm'): VmState => ({
      uuid: '{550e8400-e29b-41d4-a716-446655440003}',
      name,
      status: 'running',
      accessible: false,
      hostname: name,
      users: [],
    }),
  };

  /**
   * Create a complete mock scenario
   */
  static createScenario(config: Partial<MockScenarioConfig> = {}): MockScenario {
    const defaultConfig: MockScenarioConfig = {
      vmState: this.vmStates.running(),
      systemConfig: {
        username: this.DEFAULT_USERNAME,
        homedir: `/Users/${this.DEFAULT_USERNAME}`,
      },
      sshKeys: {
        exists: true,
        content: this.DEFAULT_SSH_KEY,
        path: `/Users/${this.DEFAULT_USERNAME}/.ssh/id_rsa.pub`,
      },
      filesystem: {},
    };
    
    const mergedConfig = {
      ...defaultConfig,
      ...config,
      systemConfig: { ...defaultConfig.systemConfig, ...config.systemConfig },
      sshKeys: { ...defaultConfig.sshKeys, ...config.sshKeys },
      filesystem: { ...defaultConfig.filesystem, ...config.filesystem },
    };
    
    return new MockScenario(mergedConfig);
  }

  /**
   * Preset scenarios for common test cases
   */
  static presets = {
    /**
     * VM is running and ready for SSH configuration
     */
    runningVmWithSsh: () => this.createScenario({
      vmState: this.vmStates.running(),
      sshKeys: {
        exists: true,
        content: this.DEFAULT_SSH_KEY,
      },
    }),
    
    /**
     * VM is stopped - cannot perform operations
     */
    stoppedVm: () => this.createScenario({
      vmState: this.vmStates.stopped(),
    }),
    
    /**
     * VM is running but SSH keys are missing
     */
    runningVmNoSshKeys: () => this.createScenario({
      vmState: this.vmStates.running(),
      sshKeys: {
        exists: false,
      },
    }),
    
    /**
     * VM is running but not accessible (network issues)
     */
    inaccessibleVm: () => this.createScenario({
      vmState: this.vmStates.inaccessible(),
    }),
    
    /**
     * New user setup scenario
     */
    newUserSetup: (username: string = 'newuser') => this.createScenario({
      vmState: {
        ...this.vmStates.running(),
        users: [], // No users yet
      },
      systemConfig: {
        username,
        homedir: `/Users/${username}`,
      },
    }),
    
    /**
     * CI/CD environment
     */
    ciEnvironment: () => this.createScenario({
      vmState: this.vmStates.running('ci-vm', '10.0.0.100'),
      systemConfig: {
        username: 'runner',
        homedir: '/home/runner',
        envVars: {
          CI: 'true',
          GITHUB_ACTIONS: 'true',
        },
      },
    }),
  };
}

/**
 * Mock Scenario class that applies all necessary mocks
 */
export class MockScenario {
  private callSequence: Array<PrlctlResult | Error> = [];
  private currentCallIndex = 0;
  
  constructor(private config: MockScenarioConfig) {}
  
  /**
   * Apply all mocks based on the scenario configuration
   */
  async apply(): Promise<void> {
    // Setup system mocks
    this.setupSystemMocks();
    
    // Setup filesystem mocks
    this.setupFilesystemMocks();
    
    // Setup prlctl execution mocks
    this.setupPrlctlMocks();
  }
  
  /**
   * Get the mock function for assertions
   */
  getMockExecutePrlctl(): jest.MockedFunction<typeof executePrlctl> {
    return mockExecutePrlctl;
  }
  
  /**
   * Setup system mocks based on configuration
   */
  private setupSystemMocks(): void {
    const { systemConfig } = this.config;
    const username = systemConfig?.username || 'testuser';
    const homedir = systemConfig?.homedir || `/Users/${username}`;
    
    mockOsUserInfo.mockReturnValue({
      username,
      uid: systemConfig?.uid || 501,
      gid: systemConfig?.gid || 20,
      shell: systemConfig?.shell || '/bin/bash',
      homedir,
    } as any);
    
    mockOsHomedir.mockReturnValue(homedir);
  }
  
  /**
   * Setup filesystem mocks based on configuration
   */
  private setupFilesystemMocks(): void {
    // Mock SSH key access
    if (this.config.sshKeys) {
      const sshKeyPaths = [
        this.config.sshKeys.path || `/Users/${this.config.systemConfig?.username || 'testuser'}/.ssh/id_rsa.pub`,
        `/Users/${this.config.systemConfig?.username || 'testuser'}/.ssh/id_ed25519.pub`,
        `/Users/${this.config.systemConfig?.username || 'testuser'}/.ssh/id_ecdsa.pub`,
      ];
      
      mockFsAccess.mockImplementation(async (path) => {
        const pathStr = path.toString();
        
        // Check SSH key paths
        if (sshKeyPaths.includes(pathStr)) {
          if (this.config.sshKeys!.exists && pathStr === sshKeyPaths[0]) {
            return undefined;
          }
          throw new Error('ENOENT');
        }
        
        // Check custom filesystem entries
        if (this.config.filesystem && this.config.filesystem[pathStr]) {
          const entry = this.config.filesystem[pathStr];
          if (entry.exists) {
            return undefined;
          }
          throw new Error(entry.error || 'ENOENT');
        }
        
        throw new Error('ENOENT');
      });
      
      mockFsReadFile.mockImplementation(async (path) => {
        const pathStr = path.toString();
        
        // Read SSH key
        if (pathStr === sshKeyPaths[0] && this.config.sshKeys!.exists) {
          return this.config.sshKeys!.content || '';
        }
        
        // Read custom filesystem entries
        if (this.config.filesystem && this.config.filesystem[pathStr]) {
          const entry = this.config.filesystem[pathStr];
          if (entry.exists && entry.content !== undefined) {
            return entry.content;
          }
        }
        
        throw new Error('ENOENT');
      });
    }
  }
  
  /**
   * Setup prlctl command mocks based on VM state
   */
  private setupPrlctlMocks(): void {
    // Build the call sequence based on scenario
    this.buildCallSequence();
    
    // Setup the main mock to return responses in sequence
    mockExecutePrlctl.mockImplementation(async () => {
      if (this.currentCallIndex >= this.callSequence.length) {
        throw new Error('No more mock responses available');
      }
      
      const response = this.callSequence[this.currentCallIndex++];
      if (response instanceof Error) {
        throw response;
      }
      return response;
    });
  }
  
  /**
   * Build the complete call sequence for the scenario
   */
  private buildCallSequence(): void {
    const { vmState, sshKeys } = this.config;
    const username = this.config.systemConfig?.username || 'testuser';
    
    // For manageSshAuth workflow
    if (this.isManageSshAuthScenario()) {
      // 1. VM status check (list --all)
      this.addVmListResponse();
      
      // 2. VM accessibility check (exec echo test)
      if (vmState.status === 'running' && vmState.accessible) {
        this.callSequence.push({ stdout: 'test', stderr: '' });
        
        // 3. User existence check
        if (vmState.users?.includes(username)) {
          this.callSequence.push({ 
            stdout: `${username}:x:1000:1000:User:/home/${username}:/bin/bash`, 
            stderr: '' 
          });
        } else {
          this.callSequence.push(new Error(`id: '${username}': no such user`));
        }
        
        // 4. SSH service configuration
        this.callSequence.push({ stdout: '', stderr: '' });
        
        // 5. SSH key installation
        if (sshKeys?.exists) {
          this.callSequence.push({ stdout: '', stderr: '' });
        }
        
        // 6. IP address discovery
        if (vmState.ipAddress) {
          this.callSequence.push({ stdout: `${vmState.ipAddress}\n`, stderr: '' });
        } else {
          this.callSequence.push({ stdout: '', stderr: '' });
        }
      } else {
        this.callSequence.push(new Error(`VM '${vmState.name}' is not accessible: VM is not running`));
      }
    }
  }
  
  /**
   * Check if this is a manageSshAuth scenario
   */
  private isManageSshAuthScenario(): boolean {
    // This is a simplified check - in practice, you might want to make this configurable
    return true;
  }
  
  /**
   * Add VM list response
   */
  private addVmListResponse(): void {
    const { vmState } = this.config;
    const stdout = `UUID                                     NAME     STATUS       IP_ADDR\n${vmState.uuid}                              ${vmState.name}  ${vmState.status}      ${vmState.ipAddress || '-'}`;
    this.callSequence.push({ stdout, stderr: '' });
  }
  
  /**
   * Add a custom response to the sequence
   */
  addResponse(response: PrlctlResult | Error): void {
    this.callSequence.push(response);
  }
  
  /**
   * Get the current call count
   */
  getCallCount(): number {
    return this.currentCallIndex;
  }
  
  /**
   * Reset all mocks
   */
  reset(): void {
    mockFsAccess.mockReset();
    mockFsReadFile.mockReset();
    mockExecutePrlctl.mockReset();
    mockOsUserInfo.mockReset();
    mockOsHomedir.mockReset();
    this.callSequence = [];
    this.currentCallIndex = 0;
  }
}

/**
 * Helper function to quickly setup a scenario in tests
 */
export function withMockScenario<T>(
  scenarioOrConfig: MockScenario | Partial<MockScenarioConfig> | (() => MockScenario),
  callback: (scenario: MockScenario) => T | Promise<T>
): Promise<T> {
  let scenario: MockScenario;
  
  if (typeof scenarioOrConfig === 'function') {
    scenario = scenarioOrConfig();
  } else if (scenarioOrConfig instanceof MockScenario) {
    scenario = scenarioOrConfig;
  } else {
    scenario = MockScenarioFactory.createScenario(scenarioOrConfig);
  }
  
  return (async () => {
    await scenario.apply();
    try {
      return await callback(scenario);
    } finally {
      scenario.reset();
    }
  })();
}