/**
 * VM Setup Workflow Integration Tests
 * 
 * Comprehensive integration tests for the complete VM setup workflow
 * testing end-to-end functionality of VM creation with automatic
 * hostname setting and user creation features.
 */

// Mock os module before any imports
jest.mock('os');
jest.mock('child_process');

import { MCPTestHarness, TestUtils } from '../../test-utils/mcp-harness';
import { PrlctlMock, MockResponseFactory } from '../../test-utils/prlctl-mock';
import { 
  setupOsMocks, 
  clearOsMocks,
  SystemMockPresets,
  SystemMockHelpers,
  MockDataGenerators
} from '../../test-utils/system-mocks';

// Set timeout for integration tests
jest.setTimeout(30000);

describe('VM Setup Workflow Integration', () => {
  let harness: MCPTestHarness;
  let prlctlMock: PrlctlMock;

  beforeEach(async () => {
    // Save current environment
    SystemMockHelpers.saveEnvironment();
    
    // Initialize test infrastructure
    prlctlMock = new PrlctlMock();
    harness = new MCPTestHarness();
    
    // Setup default Mac user environment
    setupOsMocks(SystemMockPresets.standardMacUser());
    
    await harness.start({ prlctlMock });
  });

  afterEach(async () => {
    await harness.stop();
    clearOsMocks();
    SystemMockHelpers.restoreEnvironment();
    MockDataGenerators.reset();
  });

  describe('Complete Workflow Tests', () => {
    describe('createVM with integrated features', () => {
      it('should create VM with hostname and user setup from scratch', async () => {
        const vmName = 'dev-environment';
        const vmId = TestUtils.createUuid();
        const macUsername = 'johndoe'; // From SystemMockPresets.standardMacUser()
        
        // Setup mock responses for complete workflow
        // VM creation
        prlctlMock.addResponse('create', [vmName], {
          stdout: `Creating VM '${vmName}'...\nVM ID: ${vmId}\nThe VM has been successfully created.`,
        });

        // Check VM status (initial)
        prlctlMock.addResponse('list', ['--all'], 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'stopped' }
          ])
        );

        // Start VM for configuration
        prlctlMock.addResponse('start', [vmName], {
          stdout: `Starting VM...\nVM '${vmName}' started successfully`,
        });

        // Check VM status (after start)
        prlctlMock.addResponse('list', ['--all'], 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'running', ipAddress: '10.211.55.2' }
          ])
        );

        // Set hostname
        prlctlMock.addResponse('exec', [vmName, 'hostnamectl', 'set-hostname', vmName], {
          stdout: '',
        });

        // Verify hostname
        prlctlMock.addResponse('exec', [vmName, 'hostname'], {
          stdout: vmName,
        });

        // Check if user exists
        prlctlMock.addResponse('exec', [vmName, 'id', macUsername], {
          stderr: `id: '${macUsername}': no such user`,
          shouldFail: true,
        });

        // Create user
        prlctlMock.addResponse('exec', [vmName, 'useradd', '-m', '-s', '/bin/bash', macUsername], {
          stdout: '',
        });

        // Setup SSH directory
        prlctlMock.addResponse('exec', [vmName, 'mkdir', '-p', `/home/${macUsername}/.ssh`], {
          stdout: '',
        });

        prlctlMock.addResponse('exec', [vmName, 'chmod', '700', `/home/${macUsername}/.ssh`], {
          stdout: '',
        });

        // Add SSH key (using default response since the exact command varies)
        prlctlMock.addDefaultResponse('exec', {
          stdout: '',
        });

        // Stop VM after configuration
        prlctlMock.addResponse('stop', [vmName], {
          stdout: `Stopping VM...\nVM '${vmName}' stopped successfully`,
        });

        // Execute createVM with all features enabled
        const result = await harness.callTool('createVM', {
          name: vmName,
          os: 'ubuntu',
          setHostname: true,
          createUser: true,
          enableSshAuth: true,
        });

        // Verify successful completion
        expect(result.isError).toBeFalsy();
        const responseText = result.content[0].text;
        
        // Verify all workflow steps completed
        expect(responseText).toContain('Success');
        expect(responseText).toContain(`VM Created`);
        expect(responseText).toContain(`Name: ${vmName}`);
        expect(responseText).toContain('Post-Creation Configuration');
        expect(responseText).toContain(`Hostname set to: ${vmName}`);
        expect(responseText).toContain(`User '${macUsername}' created with passwordless sudo and SSH access`);
        expect(responseText).toContain('Configuration Summary: 5/5 steps completed');
        
        // Verify mock was called correctly
        // Verify VM creation
        expect(prlctlMock.wasCalledWith('create', [vmName])).toBe(true);
        
        // Verify hostname was set
        expect(prlctlMock.wasCalledWith('exec', [vmName, 'hostnamectl', 'set-hostname', vmName])).toBe(true);
        
        // Verify user was created
        expect(prlctlMock.wasCalledWith('exec', [vmName, 'useradd', '-m', '-s', '/bin/bash', macUsername])).toBe(true);
        
        // Verify VM was returned to stopped state
        expect(prlctlMock.wasCalledWith('stop', [vmName])).toBe(true);
      });

      it('should create VM from template with integrated features', async () => {
        const templateName = 'ubuntu-22.04-template';
        const vmName = 'web-server';
        const vmId = TestUtils.createUuid();
        const macUsername = 'johndoe';
        
        // Clone from template
        prlctlMock.addResponse('clone', [templateName, '--name', vmName], {
          stdout: `Cloning VM from '${templateName}'...\nVM ID: ${vmId}\nThe VM has been successfully cloned.`,
        });

        // VM already running (template was running)
        prlctlMock.addDefaultResponse('list', 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'running', ipAddress: '10.211.55.3' }
          ])
        );

        // Hostname operations
        prlctlMock.addResponse('exec', [vmName, 'hostnamectl', 'set-hostname', vmName], {
          stdout: '',
        });

        prlctlMock.addResponse('exec', [vmName, 'hostname'], {
          stdout: vmName,
        });

        // User already exists in template
        prlctlMock.addResponse('exec', [vmName, 'id', macUsername], {
          stdout: `uid=1000(${macUsername}) gid=1000(${macUsername}) groups=1000(${macUsername})`,
        });

        // SSH setup (user exists, just add key) - use default for all SSH operations
        prlctlMock.addDefaultResponse('exec', {
          stdout: '',
        });

        // Execute createVM from template
        const result = await harness.callTool('createVM', {
          name: vmName,
          fromTemplate: templateName,
          setHostname: true,
          createUser: true,
          enableSshAuth: true,
        });

        // Verify success
        expect(result.isError).toBeFalsy();
        const responseText = result.content[0].text;
        
        expect(responseText).toContain('Success');
        expect(responseText).toContain(`Cloning VM from template '${templateName}'`);
        expect(responseText).toContain(`Hostname set to: ${vmName}`);
        expect(responseText).toContain(`User '${macUsername}' created with passwordless sudo and SSH access`);
        
        // Verify VM remained running since it was already running
        const stopCalls = prlctlMock.getCallHistory().filter(c => c.command === 'stop');
        expect(stopCalls).toHaveLength(0);
      });

      it('should handle partial feature enablement correctly', async () => {
        const vmName = 'test-partial';
        const vmId = TestUtils.createUuid();
        
        // Test with only hostname setting enabled
        prlctlMock.addResponse('create', [vmName], {
          stdout: `Creating VM '${vmName}'...\nVM ID: ${vmId}`,
        });

        prlctlMock.addResponse('list', ['--all'], 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'stopped' }
          ])
        );

        prlctlMock.addResponse('start', [vmName], {
          stdout: 'VM started',
        });

        prlctlMock.addResponse('list', ['--all'], 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'running', ipAddress: '10.211.55.4' }
          ])
        );

        prlctlMock.addResponse('exec', [vmName, 'hostnamectl', 'set-hostname', vmName], {
          stdout: '',
        });

        prlctlMock.addResponse('exec', [vmName, 'hostname'], {
          stdout: vmName,
        });

        prlctlMock.addResponse('stop', [vmName], {
          stdout: 'VM stopped',
        });

        const result = await harness.callTool('createVM', {
          name: vmName,
          setHostname: true,
          createUser: false,
          enableSshAuth: false,
        });

        expect(result.isError).toBeFalsy();
        const responseText = result.content[0].text;
        
        expect(responseText).toContain('Success');
        expect(responseText).toContain(`Hostname set to: ${vmName}`);
        expect(responseText).not.toContain('User');
        expect(responseText).not.toContain('SSH');
      });
    });

    describe('Cross-tool integration', () => {
      it('should integrate createVM with manageSshAuth seamlessly', async () => {
        const vmName = 'ssh-test-vm';
        const vmId = TestUtils.createUuid();
        const customUser = 'developer';
        
        // Create VM without user setup
        prlctlMock.addResponse('create', [vmName], {
          stdout: `VM '${vmName}' created with ID: ${vmId}`,
        });

        prlctlMock.addResponse('list', ['--all'], 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'stopped' }
          ])
        );

        const createResult = await harness.callTool('createVM', {
          name: vmName,
          setHostname: false,
          createUser: false,
          enableSshAuth: false,
        });

        expect(createResult.isError).toBeFalsy();

        // Now setup SSH separately
        prlctlMock.addResponse('list', ['--all'], 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'stopped' }
          ])
        );

        prlctlMock.addResponse('start', [vmName], {
          stdout: 'VM started',
        });

        prlctlMock.addResponse('exec', [vmName, 'echo', 'VM is accessible'], {
          stdout: 'VM is accessible',
        });

        prlctlMock.addResponse('exec', [vmName, 'id', customUser], {
          stderr: `id: '${customUser}': no such user`,
          shouldFail: true,
        });

        prlctlMock.addResponse('exec', [vmName, 'useradd', '-m', '-s', '/bin/bash', customUser], {
          stdout: '',
        });

        // Use default response for all remaining SSH setup commands
        prlctlMock.addDefaultResponse('exec', {
          stdout: '',
        });

        prlctlMock.addResponse('stop', [vmName], {
          stdout: 'VM stopped',
        });

        const sshResult = await harness.callTool('manageSshAuth', {
          vmId: vmName,
          username: customUser,
          enablePasswordlessSudo: true,
        });

        expect(sshResult.isError).toBeFalsy();
        expect(sshResult.content[0].text).toContain('SSH authentication configured successfully');
        expect(sshResult.content[0].text).toContain(`User: ${customUser}`);
      });

      it('should integrate createVM with setHostname independently', async () => {
        const vmName = 'hostname-test';
        const newHostname = 'production-server';
        const vmId = TestUtils.createUuid();

        // Create VM without hostname setting
        prlctlMock.addResponse('create', [vmName], {
          stdout: `VM created: ${vmId}`,
        });

        const createResult = await harness.callTool('createVM', {
          name: vmName,
          setHostname: false,
        });

        expect(createResult.isError).toBeFalsy();

        // Set hostname separately
        prlctlMock.addResponse('list', ['--all'], 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'running', ipAddress: '10.211.55.5' }
          ])
        );

        prlctlMock.addResponse('exec', [vmName, 'hostnamectl', 'set-hostname', newHostname], {
          stdout: '',
        });

        prlctlMock.addResponse('exec', [vmName, 'hostname'], {
          stdout: newHostname,
        });

        const hostnameResult = await harness.callTool('setHostname', {
          vmId: vmName,
          hostname: newHostname,
        });

        expect(hostnameResult.isError).toBeFalsy();
        expect(hostnameResult.content[0].text).toContain('Hostname successfully set');
        expect(hostnameResult.content[0].text).toContain(newHostname);
      });
    });

    describe('Real-world scenarios', () => {
      it('should setup complete development environment with custom Mac username', async () => {
        // Setup custom Mac user
        clearOsMocks();
        setupOsMocks({
          username: 'alice.developer',
          hostname: 'Alices-MacBook-Pro.local',
          homedir: '/Users/alice.developer',
          uid: 502,
          gid: 20,
          shell: '/bin/zsh',
          platform: 'darwin',
        });

        const vmName = 'alice-dev-env';
        const vmId = TestUtils.createUuid();

        // Create VM with specifications
        prlctlMock.addResponse('create', [vmName, '--ostype', 'ubuntu'], {
          stdout: `Creating Ubuntu VM: ${vmId}`,
        });

        // Set hardware specs
        prlctlMock.addResponse('set', [vmName, '--memsize', '4096'], {
          stdout: 'Memory set to 4096 MB',
        });

        prlctlMock.addResponse('set', [vmName, '--cpus', '2'], {
          stdout: 'CPUs set to 2',
        });

        // Start and configure
        prlctlMock.addResponse('list', ['--all'], 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'stopped' }
          ])
        );

        prlctlMock.addResponse('start', [vmName], {
          stdout: 'VM started',
        });

        prlctlMock.addResponse('list', ['--all'], 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'running', ipAddress: '10.211.55.10' }
          ])
        );

        // Hostname setup
        prlctlMock.addResponse('exec', [vmName, 'hostnamectl', 'set-hostname', vmName], {
          stdout: '',
        });

        prlctlMock.addResponse('exec', [vmName, 'hostname'], {
          stdout: vmName,
        });

        // User creation for alice.developer
        prlctlMock.addResponse('exec', [vmName, 'id', 'alice.developer'], {
          stderr: `id: 'alice.developer': no such user`,
          shouldFail: true,
        });

        prlctlMock.addResponse('exec', [vmName, 'useradd', '-m', '-s', '/bin/bash', 'alice.developer'], {
          stdout: '',
        });

        // SSH setup - use default for all remaining operations
        prlctlMock.addDefaultResponse('exec', {
          stdout: '',
        });

        prlctlMock.addResponse('stop', [vmName], {
          stdout: 'VM stopped',
        });

        const result = await harness.callTool('createVM', {
          name: vmName,
          os: 'ubuntu',
          memory: 4096,
          cpus: 2,
          setHostname: true,
          createUser: true,
          enableSshAuth: true,
        });

        expect(result.isError).toBeFalsy();
        const responseText = result.content[0].text;
        
        expect(responseText).toContain('Success');
        expect(responseText).toContain('Memory: 4096MB');
        expect(responseText).toContain('CPUs: 2');
        expect(responseText).toContain(`User 'alice.developer' created`);
        expect(responseText).toContain('Configuration Summary: 5/5 steps completed');
      });
    });

    describe('Error handling and resilience', () => {
      it('should handle VM creation failure gracefully', async () => {
        const vmName = 'fail-create';

        prlctlMock.addResponse('create', [vmName], {
          stderr: 'Failed to create VM: Insufficient disk space',
          shouldFail: true,
        });

        const result = await harness.callTool('createVM', {
          name: vmName,
          setHostname: true,
          createUser: true,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Error creating VM');
        expect(result.content[0].text).toContain('Insufficient disk space');
      });

      it('should handle partial configuration failure', async () => {
        const vmName = 'partial-fail';
        const vmId = TestUtils.createUuid();

        // VM creation succeeds
        prlctlMock.addResponse('create', [vmName], {
          stdout: `VM created: ${vmId}`,
        });

        prlctlMock.addResponse('list', ['--all'], 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'stopped' }
          ])
        );

        prlctlMock.addResponse('start', [vmName], {
          stdout: 'Started',
        });

        prlctlMock.addResponse('list', ['--all'], 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'running', ipAddress: '10.211.55.12' }
          ])
        );

        // Hostname succeeds
        prlctlMock.addResponse('exec', [vmName, 'hostnamectl', 'set-hostname', vmName], {
          stdout: '',
        });

        prlctlMock.addResponse('exec', [vmName, 'hostname'], {
          stdout: vmName,
        });

        // User creation fails
        prlctlMock.addResponse('exec', [vmName, 'id', 'johndoe'], {
          stderr: 'Connection refused',
          shouldFail: true,
        });

        prlctlMock.addResponse('stop', [vmName], {
          stdout: 'Stopped',
        });

        const result = await harness.callTool('createVM', {
          name: vmName,
          setHostname: true,
          createUser: true,
          enableSshAuth: true,
        });

        // Should not be a complete failure
        expect(result.isError).toBeFalsy();
        const responseText = result.content[0].text;
        
        // VM was created
        expect(responseText).toContain('Success');
        expect(responseText).toContain('VM Created');
        
        // Hostname was set
        expect(responseText).toContain(`Hostname set to: ${vmName}`);
        
        // User creation failed
        expect(responseText).toContain('User/SSH setup failed');
        expect(responseText).toContain('Configuration Summary: 3/5 steps completed');
        expect(responseText).toContain('Failed Steps');
        expect(responseText).toContain('Manual Completion');
      });

      it('should handle VM start failure for configuration', async () => {
        const vmName = 'no-start-vm';
        const vmId = TestUtils.createUuid();

        prlctlMock.addResponse('create', [vmName], {
          stdout: `VM created: ${vmId}`,
        });

        prlctlMock.addResponse('list', ['--all'], 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'stopped' }
          ])
        );

        // Start fails
        prlctlMock.addResponse('start', [vmName], {
          stderr: 'Failed to start VM: Network initialization failed',
          shouldFail: true,
        });

        const result = await harness.callTool('createVM', {
          name: vmName,
          setHostname: true,
          createUser: true,
        });

        expect(result.isError).toBeFalsy();
        const responseText = result.content[0].text;
        
        // VM was created but configuration skipped
        expect(responseText).toContain('Success');
        expect(responseText).toContain('VM Created');
        expect(responseText).toContain('VM could not be started for configuration');
        expect(responseText).toContain('Skipping hostname and user setup');
      });
    });

    describe('State management', () => {
      it('should preserve VM running state during configuration', async () => {
        const vmName = 'already-running';
        const vmId = TestUtils.createUuid();

        // VM is already running when we create it (cloned from running template)
        prlctlMock.addResponse('clone', ['running-template', '--name', vmName], {
          stdout: `Cloned VM: ${vmId}`,
        });

        // VM status checks show it's running
        prlctlMock.addDefaultResponse('list', 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'running', ipAddress: '10.211.55.20' }
          ])
        );

        // Configuration proceeds without start/stop
        prlctlMock.addResponse('exec', [vmName, 'hostnamectl', 'set-hostname', vmName], {
          stdout: '',
        });

        prlctlMock.addResponse('exec', [vmName, 'hostname'], {
          stdout: vmName,
        });

        const result = await harness.callTool('createVM', {
          name: vmName,
          fromTemplate: 'running-template',
          setHostname: true,
        });

        expect(result.isError).toBeFalsy();
        
        // Verify no start or stop commands were issued
        const calls = prlctlMock.getCallHistory();
        const startCalls = calls.filter(c => c.command === 'start');
        const stopCalls = calls.filter(c => c.command === 'stop');
        
        expect(startCalls).toHaveLength(0);
        expect(stopCalls).toHaveLength(0);
      });

      it('should handle concurrent operations on multiple VMs', async () => {
        const vms = [
          { name: 'concurrent-1', id: TestUtils.createUuid() },
          { name: 'concurrent-2', id: TestUtils.createUuid() },
          { name: 'concurrent-3', id: TestUtils.createUuid() },
        ];

        // Setup responses for all VMs
        vms.forEach(vm => {
          prlctlMock.addResponse('create', [vm.name], {
            stdout: `VM created: ${vm.id}`,
          });
        });

        // Create VMs concurrently
        const createPromises = vms.map(vm =>
          harness.callTool('createVM', {
            name: vm.name,
            setHostname: false,
            createUser: false,
          })
        );

        const results = await Promise.all(createPromises);

        // All should succeed
        results.forEach((result, index) => {
          expect(result.isError).toBeFalsy();
          expect(result.content[0].text).toContain(vms[index].name);
        });

        // Verify all VMs were created
        vms.forEach(vm => {
          expect(prlctlMock.wasCalledWith('create', [vm.name])).toBe(true);
        });
      });
    });

    describe('Different Mac username scenarios', () => {
      it('should handle admin user creation', async () => {
        clearOsMocks();
        setupOsMocks(SystemMockPresets.macAdminUser());

        const vmName = 'admin-vm';
        const vmId = TestUtils.createUuid();

        prlctlMock.addResponse('create', [vmName], {
          stdout: `VM created: ${vmId}`,
        });

        // Add default responses for the configuration flow
        prlctlMock.addDefaultResponse('list', 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'stopped' }
          ])
        );
        
        prlctlMock.addDefaultResponse('start', { stdout: 'Started' });
        prlctlMock.addDefaultResponse('exec', { stdout: '' });
        prlctlMock.addDefaultResponse('stop', { stdout: 'Stopped' });

        const result = await harness.callTool('createVM', {
          name: vmName,
          setHostname: true,
          createUser: true,
          enableSshAuth: true,
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain("User 'admin' created");
      });

      it('should handle CI environment username', async () => {
        clearOsMocks();
        setupOsMocks(SystemMockPresets.ciEnvironment());

        const vmName = 'ci-vm';
        const vmId = TestUtils.createUuid();

        prlctlMock.addResponse('create', [vmName], {
          stdout: `VM created: ${vmId}`,
        });

        // Add default responses
        prlctlMock.addDefaultResponse('list', 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'stopped' }
          ])
        );
        
        prlctlMock.addDefaultResponse('start', { stdout: 'Started' });
        prlctlMock.addDefaultResponse('exec', { stdout: '' });
        prlctlMock.addDefaultResponse('stop', { stdout: 'Stopped' });

        const result = await harness.callTool('createVM', {
          name: vmName,
          createUser: true,
          enableSshAuth: true,
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain("User 'runner' created");
      });

      it('should handle special characters in username', async () => {
        clearOsMocks();
        setupOsMocks({
          username: 'john.doe-test_123',
          homedir: '/Users/john.doe-test_123',
          uid: 501,
          gid: 20,
          shell: '/bin/zsh',
          platform: 'darwin',
        });

        const vmName = 'special-user-vm';
        const vmId = TestUtils.createUuid();

        prlctlMock.addResponse('create', [vmName], {
          stdout: `VM created: ${vmId}`,
        });

        // Add default responses
        prlctlMock.addDefaultResponse('list', 
          MockResponseFactory.vmList([
            { uuid: vmId, name: vmName, status: 'stopped' }
          ])
        );
        
        prlctlMock.addDefaultResponse('start', { stdout: 'Started' });
        prlctlMock.addDefaultResponse('exec', { stdout: '' });
        prlctlMock.addDefaultResponse('stop', { stdout: 'Stopped' });

        const result = await harness.callTool('createVM', {
          name: vmName,
          createUser: true,
          enableSshAuth: true,
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain("User 'john.doe-test_123' created");
      });
    });
  });
});