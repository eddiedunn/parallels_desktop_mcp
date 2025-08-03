/**
 * Example: Using System Mocks in Tests
 * 
 * This file demonstrates how to use the system mocking utilities
 * in unit and integration tests.
 */

import * as os from 'os';
import { 
  setupOsMocks, 
  clearOsMocks,
  SystemMockPresets,
  MockDataGenerators,
  SystemMockHelpers,
  osMocks,
  integrateWithPrlctlMock,
} from '../test-utils/system-mocks';
import { PrlctlMock, MockResponseFactory } from '../test-utils/prlctl-mock';

// Example 1: Basic unit test with system mocks
describe('Username Detection Feature', () => {
  beforeEach(() => {
    SystemMockHelpers.saveEnvironment();
  });

  afterEach(() => {
    clearOsMocks();
    SystemMockHelpers.restoreEnvironment();
  });

  it('should detect Mac username correctly', () => {
    // Setup mock
    setupOsMocks({
      username: 'johndoe',
      homedir: '/Users/johndoe',
    });

    // Your code that uses os.userInfo()
    const detectUsername = () => {
      // In real implementation, this would be os.userInfo()
      // For testing, we use the mock
      return osMocks.userInfo().username;
    };

    const username = detectUsername();
    expect(username).toBe('johndoe');
    expect(osMocks.userInfo).toHaveBeenCalledTimes(1);
  });

  it('should handle different user types', () => {
    // Test admin user
    const adminInfo = MockDataGenerators.generateUserInfo('admin');
    setupOsMocks(adminInfo);

    expect(osMocks.userInfo()).toMatchObject({
      username: 'admin',
      uid: 0,
      shell: '/bin/bash',
    });

    // Clear and test guest user
    clearOsMocks();
    const guestInfo = MockDataGenerators.generateUserInfo('restricted');
    setupOsMocks(guestInfo);

    expect(osMocks.userInfo()).toMatchObject({
      username: 'guest',
      shell: '/usr/bin/false',
    });
  });
});

// Example 2: Integration test with VM configuration
describe('VM User Configuration', () => {
  let prlctlMock: PrlctlMock;

  beforeEach(() => {
    prlctlMock = new PrlctlMock();
    SystemMockHelpers.saveEnvironment();
  });

  afterEach(() => {
    prlctlMock.reset();
    clearOsMocks();
    SystemMockHelpers.restoreEnvironment();
  });

  it('should configure VM with host user settings', async () => {
    // Setup system mocks for Mac environment
    const macUser = SystemMockPresets.standardMacUser();
    setupOsMocks(macUser);

    // Setup prlctl mocks for VM operations
    const vmId = 'test-vm-123';
    
    // Mock user creation in VM
    prlctlMock.addResponse(
      'exec',
      [vmId, 'useradd', '-m', 'johndoe'],
      MockResponseFactory.userCreation('johndoe', vmId)
    );

    // Mock hostname configuration
    prlctlMock.addResponse(
      'exec',
      [vmId, 'hostnamectl', 'set-hostname', 'Johns-MacBook-Pro.local'],
      MockResponseFactory.hostnameSet('Johns-MacBook-Pro.local', vmId)
    );

    // Mock SSH setup
    prlctlMock.addResponse(
      'exec',
      [vmId, 'bash', '-c', `mkdir -p /home/johndoe/.ssh && chmod 700 /home/johndoe/.ssh`],
      MockResponseFactory.success('SSH directory created')
    );

    // Your VM configuration logic here
    const configureVMWithHostUser = async () => {
      const hostUser = osMocks.userInfo();
      const hostname = osMocks.hostname();

      // Create user in VM
      await prlctlMock.execute(['exec', vmId, 'useradd', '-m', hostUser.username]);
      
      // Set hostname
      await prlctlMock.execute(['exec', vmId, 'hostnamectl', 'set-hostname', hostname]);
      
      // Setup SSH
      await prlctlMock.execute([
        'exec', vmId, 'bash', '-c',
        `mkdir -p /home/${hostUser.username}/.ssh && chmod 700 /home/${hostUser.username}/.ssh`
      ]);

      return { username: hostUser.username, hostname };
    };

    const result = await configureVMWithHostUser();
    
    expect(result.username).toBe('johndoe');
    expect(result.hostname).toBe('Johns-MacBook-Pro.local');
    expect(prlctlMock.getCallCount('exec')).toBe(3);
  });

  it('should handle user creation errors', async () => {
    setupOsMocks({ username: 'existinguser' });

    const vmId = 'test-vm-123';
    
    // Mock user already exists error
    prlctlMock.addResponse(
      'exec',
      [vmId, 'useradd', '-m', 'existinguser'],
      MockResponseFactory.userExists('existinguser')
    );

    // Test error handling
    await expect(
      prlctlMock.execute(['exec', vmId, 'useradd', '-m', 'existinguser'])
    ).rejects.toThrow('User already exists');
  });
});

// Example 3: Testing with different environments
describe('Environment-specific Configuration', () => {
  afterEach(() => {
    clearOsMocks();
    SystemMockHelpers.restoreEnvironment();
  });

  it('should configure differently for CI environment', () => {
    const ciPreset = SystemMockPresets.ciEnvironment();
    setupOsMocks(ciPreset);

    expect(osMocks.userInfo().username).toBe('runner');
    expect(process.env.CI).toBe('true');
    expect(process.env.GITHUB_ACTIONS).toBe('true');
  });

  it('should detect Docker environment', () => {
    const dockerPreset = SystemMockPresets.dockerEnvironment();
    setupOsMocks(dockerPreset);

    expect(osMocks.platform()).toBe('linux');
    expect(osMocks.userInfo().username).toBe('root');
    expect(osMocks.homedir()).toBe('/root');
  });
});

// Example 4: Using scoped mocking
describe('Scoped System Mocking', () => {
  it('should automatically cleanup after scope', async () => {
    // Store original state
    const originalEnv = process.env.USER;

    // Use scoped mock
    const result = await SystemMockHelpers.withMockedSystem(
      { username: 'scopeduser', envVars: { USER: 'scopeduser' } },
      async () => {
        expect(osMocks.userInfo().username).toBe('scopeduser');
        expect(process.env.USER).toBe('scopeduser');
        return 'completed';
      }
    );

    // Verify cleanup
    expect(result).toBe('completed');
    expect(process.env.USER).toBe(originalEnv);
  });
});

// Example 5: Testing SSH path generation
describe('SSH Configuration', () => {
  it('should generate correct SSH paths for user', () => {
    const username = 'testuser';
    const sshPaths = MockDataGenerators.generateSshPaths(username);

    expect(sshPaths.sshDir).toBe('/Users/testuser/.ssh');
    expect(sshPaths.publicKey).toBe('/Users/testuser/.ssh/id_rsa.pub');
    expect(sshPaths.authorizedKeys).toBe('/Users/testuser/.ssh/authorized_keys');
  });

  it('should integrate with prlctl for SSH setup', async () => {
    const prlctlMock = new PrlctlMock();
    const vmId = 'test-vm';
    const username = 'johndoe';
    const publicKey = 'ssh-rsa AAAAB3... test@example.com';

    // Use integration helper
    const sshScenario = integrateWithPrlctlMock().createSshScenario(username, publicKey, vmId);
    prlctlMock.addResponse(sshScenario.command, sshScenario.args, sshScenario.response);

    const result = await prlctlMock.execute(sshScenario.args);
    expect(result.stdout).toContain('SSH key added successfully');
  });
});

// Example 6: Testing hostname generation
describe('Hostname Generation', () => {
  beforeEach(() => {
    MockDataGenerators.reset();
  });

  it('should generate appropriate hostnames', () => {
    const personal = MockDataGenerators.generateHostname({ type: 'personal' });
    expect(personal).toMatch(/-MacBook-Pro\.local$/);

    const work = MockDataGenerators.generateHostname({ type: 'work' });
    expect(work).toMatch(/^MAC-[A-Z0-9]+\.corp\.local$/);

    const server = MockDataGenerators.generateHostname({ type: 'server' });
    expect(server).toMatch(/^mac-server-\d+\.local$/);
  });
});

// Example 7: Complex integration scenario
describe('Complete VM Setup Flow', () => {
  let prlctlMock: PrlctlMock;

  beforeEach(() => {
    prlctlMock = new PrlctlMock();
    SystemMockHelpers.saveEnvironment();
  });

  afterEach(() => {
    prlctlMock.reset();
    clearOsMocks();
    SystemMockHelpers.restoreEnvironment();
  });

  it('should complete full VM configuration with host mirroring', async () => {
    // Setup host environment
    setupOsMocks(SystemMockPresets.standardMacUser());

    const vmId = '{11111111-1111-1111-1111-111111111111}';
    const hostInfo = osMocks.userInfo();
    const hostname = osMocks.hostname();

    // Setup all required mocks
    prlctlMock.addResponse(
      'exec',
      [vmId, 'useradd', '-m', '-s', hostInfo.shell, hostInfo.username],
      MockResponseFactory.userCreation(hostInfo.username, vmId)
    );

    prlctlMock.addResponse(
      'exec',
      [vmId, 'usermod', '-aG', 'sudo', hostInfo.username],
      MockResponseFactory.groupAdded(hostInfo.username, 'sudo')
    );

    prlctlMock.addResponse(
      'exec',
      [vmId, 'hostnamectl', 'set-hostname', hostname],
      MockResponseFactory.hostnameSet(hostname, vmId)
    );

    prlctlMock.addResponse(
      'exec',
      [vmId, 'bash', '-c', `echo '${hostInfo.username} ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/${hostInfo.username}`],
      MockResponseFactory.sudoersUpdated(hostInfo.username)
    );

    // Execute configuration
    const configureVM = async () => {
      // Create user
      await prlctlMock.execute(['exec', vmId, 'useradd', '-m', '-s', hostInfo.shell, hostInfo.username]);
      
      // Add to sudo group
      await prlctlMock.execute(['exec', vmId, 'usermod', '-aG', 'sudo', hostInfo.username]);
      
      // Set hostname
      await prlctlMock.execute(['exec', vmId, 'hostnamectl', 'set-hostname', hostname]);
      
      // Configure sudo
      await prlctlMock.execute([
        'exec', vmId, 'bash', '-c',
        `echo '${hostInfo.username} ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/${hostInfo.username}`
      ]);

      return MockResponseFactory.vmConfigured({
        vmId,
        hostname,
        username: hostInfo.username,
        sshEnabled: true,
      }).stdout;
    };

    const result = await configureVM();
    
    expect(result).toContain('VM configuration complete');
    expect(result).toContain(`Hostname set to: ${hostname}`);
    expect(result).toContain(`User created: ${hostInfo.username}`);
    expect(prlctlMock.wasCalledWith('exec', [vmId, 'useradd', '-m', '-s', hostInfo.shell, hostInfo.username])).toBe(true);
  });
});

// Example 8: Testing error scenarios
describe('Error Handling', () => {
  let prlctlMock: PrlctlMock;

  beforeEach(() => {
    prlctlMock = new PrlctlMock();
  });

  afterEach(() => {
    prlctlMock.reset();
  });

  it('should handle various error scenarios', async () => {
    const vmId = 'test-vm';

    // Invalid username
    prlctlMock.addResponse(
      'exec',
      [vmId, 'useradd', '-m', 'invalid@user'],
      MockResponseFactory.userCreationFailed('invalid@user', 'Invalid characters in username')
    );

    await expect(
      prlctlMock.execute(['exec', vmId, 'useradd', '-m', 'invalid@user'])
    ).rejects.toThrow('Failed to create user');

    // Invalid hostname
    prlctlMock.addResponse(
      'exec',
      [vmId, 'hostnamectl', 'set-hostname', 'invalid hostname'],
      MockResponseFactory.hostnameFailed('Hostname contains invalid characters')
    );

    await expect(
      prlctlMock.execute(['exec', vmId, 'hostnamectl', 'set-hostname', 'invalid hostname'])
    ).rejects.toThrow('Failed to set hostname');

    // SSH setup failure
    prlctlMock.addResponse(
      'exec',
      [vmId, 'mkdir', '-p', '/home/user/.ssh'],
      MockResponseFactory.sshSetupFailed('Permission denied: cannot create directory')
    );

    await expect(
      prlctlMock.execute(['exec', vmId, 'mkdir', '-p', '/home/user/.ssh'])
    ).rejects.toThrow('Failed to setup SSH');
  });
});