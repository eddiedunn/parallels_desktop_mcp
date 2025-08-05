/**
 * System Call Mocking Utilities
 *
 * Provides comprehensive mocking for OS-level functions used in
 * Mac username detection and hostname management features.
 *
 * Usage:
 * - Call setupOsMocks() in beforeEach() to configure mocks
 * - Use clearOsMocks() in afterEach() to reset mock call history
 * - Use SystemMockHelpers.saveEnvironment() and restoreEnvironment() for env vars
 * - See system-mocks-usage.example.ts for detailed examples
 */

import * as os from 'os';

export interface SystemMockConfig {
  username?: string;
  hostname?: string;
  homedir?: string;
  uid?: number;
  gid?: number;
  shell?: string;
  platform?: NodeJS.Platform;
  envVars?: Record<string, string>;
}

export interface MockUserInfo {
  username: string;
  uid: number;
  gid: number;
  shell: string;
  homedir: string;
}

/**
 * Get OS mocks from the mocked module
 */
export const osMocks = {
  userInfo: os.userInfo as jest.Mock,
  hostname: os.hostname as jest.Mock,
  homedir: os.homedir as jest.Mock,
  platform: os.platform as jest.Mock,
};

/**
 * Setup OS mocks for testing
 * Call this in beforeEach() or at the start of tests
 */
export function setupOsMocks(config: SystemMockConfig = {}): void {
  const defaults = getDefaultConfig();
  const mergedConfig = { ...defaults, ...config };

  // Setup mocks
  osMocks.userInfo.mockReturnValue({
    username: mergedConfig.username,
    uid: mergedConfig.uid,
    gid: mergedConfig.gid,
    shell: mergedConfig.shell,
    homedir: mergedConfig.homedir,
  });

  osMocks.hostname.mockReturnValue(mergedConfig.hostname);
  osMocks.homedir.mockReturnValue(mergedConfig.homedir);
  osMocks.platform.mockReturnValue(mergedConfig.platform);

  // Apply environment variables
  if (config.envVars) {
    Object.entries(config.envVars).forEach(([key, value]) => {
      process.env[key] = value;
    });
  }
}

/**
 * Clear all OS mocks
 */
export function clearOsMocks(): void {
  osMocks.userInfo.mockClear();
  osMocks.hostname.mockClear();
  osMocks.homedir.mockClear();
  osMocks.platform.mockClear();
}

/**
 * Reset all OS mocks
 */
export function resetOsMocks(): void {
  osMocks.userInfo.mockReset();
  osMocks.hostname.mockReset();
  osMocks.homedir.mockReset();
  osMocks.platform.mockReset();
}

/**
 * Get default configuration for Mac environment
 */
function getDefaultConfig(): SystemMockConfig {
  return {
    username: 'testuser',
    hostname: 'test-mac.local',
    homedir: '/Users/testuser',
    uid: 501,
    gid: 20,
    shell: '/bin/zsh',
    platform: 'darwin',
    envVars: {
      USER: 'testuser',
      HOME: '/Users/testuser',
      SHELL: '/bin/zsh',
    },
  };
}

/**
 * Mock Data Generators
 */
export class MockDataGenerators {
  private static userCounter = 0;
  private static hostCounter = 0;

  /**
   * Generate realistic Mac usernames
   */
  static generateUsername(options: { type?: 'standard' | 'admin' | 'guest' } = {}): string {
    const { type = 'standard' } = options;
    const baseNames = {
      standard: ['jdoe', 'msmith', 'kjohnson', 'twilliams', 'abrown'],
      admin: ['admin', 'administrator', 'sysadmin', 'root'],
      guest: ['guest', 'visitor', 'temp_user'],
    };

    const names = baseNames[type];
    const index = this.userCounter++ % names.length;
    return names[index];
  }

  /**
   * Generate realistic Mac hostnames
   */
  static generateHostname(options: { type?: 'personal' | 'work' | 'server' } = {}): string {
    const { type = 'personal' } = options;
    const patterns = {
      personal: () => `${this.getRandomName()}-MacBook-Pro.local`,
      work: () => `MAC-${this.getRandomId()}.corp.local`,
      server: () => `mac-server-${this.hostCounter++}.local`,
    };

    return patterns[type]();
  }

  /**
   * Generate user info for different scenarios
   */
  static generateUserInfo(
    scenario: 'default' | 'admin' | 'restricted' | 'custom' = 'default'
  ): MockUserInfo {
    const scenarios = {
      default: {
        username: 'johndoe',
        uid: 501,
        gid: 20,
        shell: '/bin/zsh',
        homedir: '/Users/johndoe',
      },
      admin: {
        username: 'admin',
        uid: 0,
        gid: 0,
        shell: '/bin/bash',
        homedir: '/var/root',
      },
      restricted: {
        username: 'guest',
        uid: 201,
        gid: 201,
        shell: '/usr/bin/false',
        homedir: '/Users/Guest',
      },
      custom: {
        username: `user${Date.now()}`,
        uid: 500 + Math.floor(Math.random() * 1000),
        gid: 20,
        shell: '/bin/zsh',
        homedir: `/Users/user${Date.now()}`,
      },
    };

    return scenarios[scenario];
  }

  /**
   * Generate SSH key paths for different users
   */
  static generateSshPaths(username: string) {
    const homedir = `/Users/${username}`;
    return {
      sshDir: `${homedir}/.ssh`,
      publicKey: `${homedir}/.ssh/id_rsa.pub`,
      privateKey: `${homedir}/.ssh/id_rsa`,
      authorizedKeys: `${homedir}/.ssh/authorized_keys`,
      knownHosts: `${homedir}/.ssh/known_hosts`,
      config: `${homedir}/.ssh/config`,
    };
  }

  /**
   * Generate environment variables for different scenarios
   */
  static generateEnvVars(
    scenario: 'minimal' | 'standard' | 'development' = 'standard'
  ): Record<string, string> {
    const base = {
      USER: 'testuser',
      HOME: '/Users/testuser',
      SHELL: '/bin/zsh',
      PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    };

    const scenarios = {
      minimal: base,
      standard: {
        ...base,
        LANG: 'en_US.UTF-8',
        TERM: 'xterm-256color',
        TMPDIR: '/var/folders/xx/xxxxxxxxxx/T/',
        __CF_USER_TEXT_ENCODING: '0x1F5:0x0:0x0',
      },
      development: {
        ...base,
        LANG: 'en_US.UTF-8',
        TERM: 'xterm-256color',
        TMPDIR: '/var/folders/xx/xxxxxxxxxx/T/',
        __CF_USER_TEXT_ENCODING: '0x1F5:0x0:0x0',
        NODE_ENV: 'test',
        EDITOR: 'vim',
        VISUAL: 'code',
        HOMEBREW_PREFIX: '/opt/homebrew',
      },
    };

    return scenarios[scenario];
  }

  private static getRandomName(): string {
    const names = ['John', 'Jane', 'Mike', 'Sarah', 'Alex', 'Emma', 'Chris', 'Lisa'];
    return names[Math.floor(Math.random() * names.length)];
  }

  private static getRandomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /**
   * Reset counters for consistent test runs
   */
  static reset(): void {
    this.userCounter = 0;
    this.hostCounter = 0;
  }
}

/**
 * Mock Scenario Presets
 */
export class SystemMockPresets {
  /**
   * Standard Mac user environment
   */
  static standardMacUser(): SystemMockConfig {
    return {
      username: 'johndoe',
      hostname: 'Johns-MacBook-Pro.local',
      homedir: '/Users/johndoe',
      uid: 501,
      gid: 20,
      shell: '/bin/zsh',
      platform: 'darwin',
      envVars: MockDataGenerators.generateEnvVars('standard'),
    };
  }

  /**
   * Mac admin user environment
   */
  static macAdminUser(): SystemMockConfig {
    return {
      username: 'admin',
      hostname: 'admin-mac.local',
      homedir: '/Users/admin',
      uid: 501,
      gid: 80, // admin group
      shell: '/bin/bash',
      platform: 'darwin',
      envVars: {
        ...MockDataGenerators.generateEnvVars('standard'),
        USER: 'admin',
        HOME: '/Users/admin',
      },
    };
  }

  /**
   * CI/CD environment (GitHub Actions on Mac)
   */
  static ciEnvironment(): SystemMockConfig {
    return {
      username: 'runner',
      hostname: 'Mac-1234567890.local',
      homedir: '/Users/runner',
      uid: 501,
      gid: 20,
      shell: '/bin/bash',
      platform: 'darwin',
      envVars: {
        ...MockDataGenerators.generateEnvVars('minimal'),
        CI: 'true',
        GITHUB_ACTIONS: 'true',
        RUNNER_OS: 'macOS',
        USER: 'runner',
        HOME: '/Users/runner',
      },
    };
  }

  /**
   * Docker container on Mac
   */
  static dockerEnvironment(): SystemMockConfig {
    return {
      username: 'root',
      hostname: 'docker-desktop',
      homedir: '/root',
      uid: 0,
      gid: 0,
      shell: '/bin/sh',
      platform: 'linux', // Docker runs Linux
      envVars: {
        USER: 'root',
        HOME: '/root',
        HOSTNAME: 'docker-desktop',
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      },
    };
  }

  /**
   * Restricted/Guest user
   */
  static restrictedUser(): SystemMockConfig {
    return {
      username: 'guest',
      hostname: 'guest-mac.local',
      homedir: '/Users/Guest',
      uid: 201,
      gid: 201,
      shell: '/usr/bin/false',
      platform: 'darwin',
      envVars: {
        USER: 'guest',
        HOME: '/Users/Guest',
        SHELL: '/usr/bin/false',
        PATH: '/usr/bin:/bin',
      },
    };
  }
}

/**
 * Test Helpers
 */
export class SystemMockHelpers {
  private static originalEnv: NodeJS.ProcessEnv;

  /**
   * Save current environment
   */
  static saveEnvironment(): void {
    this.originalEnv = { ...process.env };
  }

  /**
   * Restore saved environment
   */
  static restoreEnvironment(): void {
    if (this.originalEnv) {
      process.env = { ...this.originalEnv };
    }
  }

  /**
   * Assert system configuration matches expected values
   */
  static assertSystemConfig(expected: Partial<SystemMockConfig>): void {
    if (expected.username !== undefined) {
      expect(osMocks.userInfo).toHaveBeenCalled();
      const result = osMocks.userInfo.mock.results[0]?.value;
      expect(result?.username).toBe(expected.username);
    }
    if (expected.hostname !== undefined) {
      expect(osMocks.hostname).toHaveBeenCalled();
      expect(osMocks.hostname).toHaveReturnedWith(expected.hostname);
    }
    if (expected.homedir !== undefined) {
      expect(osMocks.homedir).toHaveBeenCalled();
      expect(osMocks.homedir).toHaveReturnedWith(expected.homedir);
    }
    if (expected.platform !== undefined) {
      expect(osMocks.platform).toHaveBeenCalled();
      expect(osMocks.platform).toHaveReturnedWith(expected.platform);
    }
    if (expected.envVars) {
      Object.entries(expected.envVars).forEach(([key, value]) => {
        expect(process.env[key]).toBe(value);
      });
    }
  }

  /**
   * Create a scoped mock that automatically cleans up
   */
  static async withMockedSystem<T>(
    config: SystemMockConfig,
    callback: () => T | Promise<T>
  ): Promise<T> {
    this.saveEnvironment();
    setupOsMocks(config);

    try {
      return await callback();
    } finally {
      clearOsMocks();
      this.restoreEnvironment();
    }
  }

  /**
   * Helper to mock a specific OS function in a test
   */
  static mockOsFunction<K extends keyof typeof os>(
    functionName: K,
    implementation: (...args: any[]) => any
  ): jest.Mock {
    const mock = jest.fn(implementation);
    (os as any)[functionName] = mock;
    return mock;
  }
}

/**
 * Integration helper for use with existing test infrastructure
 */
export function integrateWithPrlctlMock() {
  return {
    // Helper to create user creation scenarios
    createUserScenario: (username: string, vmId: string) => ({
      command: 'exec',
      args: [vmId, 'useradd', '-m', username],
      response: {
        stdout: `User '${username}' created successfully`,
      },
    }),

    // Helper to create hostname scenarios
    createHostnameScenario: (hostname: string, vmId: string) => ({
      command: 'exec',
      args: [vmId, 'hostnamectl', 'set-hostname', hostname],
      response: {
        stdout: `Hostname set to '${hostname}'`,
      },
    }),

    // Helper to create SSH setup scenarios
    createSshScenario: (username: string, publicKey: string, vmId: string) => ({
      command: 'exec',
      args: [vmId, 'bash', '-c', `echo '${publicKey}' >> /home/${username}/.ssh/authorized_keys`],
      response: {
        stdout: 'SSH key added successfully',
      },
    }),
  };
}
