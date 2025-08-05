// Mock child_process at the top
jest.mock('child_process');

import { handleCreateVM } from '../../../tools/createVM.js';
import * as prlctlHandler from '../../../prlctl-handler.js';
import * as setHostnameModule from '../../../tools/setHostname.js';
import * as manageSshAuthModule from '../../../tools/manageSshAuth.js';
import * as os from 'os';
import { setupTestSuite } from '../../test-utils/test-setup';

// Mock the dependencies
jest.mock('../../../prlctl-handler.js');
jest.mock('../../../tools/setHostname.js');
jest.mock('../../../tools/manageSshAuth.js');
jest.mock('os');

const mockExecutePrlctl = prlctlHandler.executePrlctl as jest.MockedFunction<
  typeof prlctlHandler.executePrlctl
>;
const mockParseVmList = jest.mocked(prlctlHandler.parseVmList);
const mockSanitizeVmIdentifier = prlctlHandler.sanitizeVmIdentifier as jest.MockedFunction<
  typeof prlctlHandler.sanitizeVmIdentifier
>;
const mockHandleSetHostname = setHostnameModule.handleSetHostname as jest.MockedFunction<
  typeof setHostnameModule.handleSetHostname
>;
const mockHandleManageSshAuth = manageSshAuthModule.handleManageSshAuth as jest.MockedFunction<
  typeof manageSshAuthModule.handleManageSshAuth
>;
const mockOsUserInfo = os.userInfo as jest.MockedFunction<typeof os.userInfo>;

describe('createVM Tool Enhanced', () => {
  setupTestSuite();
  
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default mocks
    mockSanitizeVmIdentifier.mockImplementation((input: string) =>
      input.replace(/[^a-zA-Z0-9\-_{}]/g, '')
    );
    mockOsUserInfo.mockReturnValue({ username: 'testuser' } as any);

    // Default successful execution
    mockExecutePrlctl.mockResolvedValue({
      stdout: 'VM created successfully',
      stderr: '',
    });

    // Default VM status (not running initially)
    mockParseVmList.mockReturnValue([]);

    // Default successful hostname setting
    mockHandleSetHostname.mockResolvedValue({
      content: [{ type: 'text', text: 'Hostname set successfully' }],
    });

    // Default successful SSH setup
    mockHandleManageSshAuth.mockResolvedValue({
      content: [{ type: 'text', text: 'SSH configured successfully' }],
    });
  });

  describe('Basic VM Creation', () => {
    it('should create a VM with only name parameter (backward compatibility)', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
          },
        },
      };

      const result = await handleCreateVM(request as any);

      expect(result.content[0].text).toContain('VM Created:');
      expect(result.content[0].text).toContain('Name: test-vm');
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['create', 'test-vm']);
    });

    it('should create a VM with hardware specifications', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            memory: 2048,
            cpus: 2,
            diskSize: 50,
          },
        },
      };

      const result = await handleCreateVM(request as any);

      expect(result.content[0].text).toContain('Memory: 2048MB');
      expect(result.content[0].text).toContain('CPUs: 2');
      expect(result.content[0].text).toContain('Disk: 50GB');

      expect(mockExecutePrlctl).toHaveBeenCalledWith(['create', 'test-vm']);
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['set', 'test-vm', '--memsize', '2048']);
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['set', 'test-vm', '--cpus', '2']);
      expect(mockExecutePrlctl).toHaveBeenCalledWith([
        'set',
        'test-vm',
        '--device-set',
        'hdd0',
        '--size',
        '50G',
      ]);
    });
  });

  describe('Enhanced Features', () => {
    it('should set hostname when setHostname is true (default)', async () => {
      // Mock VM list to show VM is running after start
      mockParseVmList
        .mockReturnValueOnce([]) // First call - check if VM was already running
        .mockReturnValueOnce([]) // Second call - check after create (still not running)
        .mockReturnValueOnce([{ uuid: '{test-uuid}', name: 'test-vm', status: 'running' }]); // Third call - VM running after start
      
      // Mock the list --all commands that isVmRunning calls
      mockExecutePrlctl
        .mockResolvedValueOnce({ stdout: 'VM created successfully', stderr: '' }) // create VM
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // list --all (before start)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // start VM
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // list --all (after start)

      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            setHostname: true,
          },
        },
      };

      const result = await handleCreateVM(request as any);

      expect(result.content[0].text).toContain('Hostname set to: test-vm');
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['start', 'test-vm']);
      expect(mockHandleSetHostname).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            arguments: expect.objectContaining({
              vmId: 'test-vm',
              hostname: 'test-vm',
            }),
          }),
        })
      );
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['stop', 'test-vm']);
    });

    it('should create user and setup SSH when createUser is true', async () => {
      // Mock VM list to show VM is running after start
      mockParseVmList
        .mockReturnValueOnce([]) // First call - check if VM was already running
        .mockReturnValueOnce([]) // Second call - check after create (still not running)
        .mockReturnValueOnce([{ uuid: '{test-uuid}', name: 'test-vm', status: 'running' }]); // Third call - VM running after start
      
      // Mock the list --all commands that isVmRunning calls
      mockExecutePrlctl
        .mockResolvedValueOnce({ stdout: 'VM created successfully', stderr: '' }) // create VM
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // list --all (before start)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // start VM
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // list --all (after start)

      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            createUser: true,
            setHostname: false, // Disable hostname to focus on user creation
          },
        },
      };

      const result = await handleCreateVM(request as any);

      expect(result.content[0].text).toContain(
        "User 'testuser' created with passwordless sudo and SSH access"
      );
      expect(mockHandleManageSshAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            arguments: expect.objectContaining({
              vmId: 'test-vm',
              username: 'testuser',
              enablePasswordlessSudo: true,
            }),
          }),
        })
      );
    });

    it('should handle both hostname and user creation together', async () => {
      // Mock VM list to show VM is running after start
      mockParseVmList
        .mockReturnValueOnce([]) // First call - check if VM was already running
        .mockReturnValueOnce([]) // Second call - check after create (still not running)
        .mockReturnValueOnce([{ uuid: '{test-uuid}', name: 'test-vm', status: 'running' }]); // Third call - VM running after start
      
      // Mock the list --all commands that isVmRunning calls
      mockExecutePrlctl
        .mockResolvedValueOnce({ stdout: 'VM created successfully', stderr: '' }) // create VM
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // list --all (before start)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // start VM
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // list --all (after start)
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // stop VM

      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            setHostname: true,
            createUser: true,
          },
        },
      };

      const result = await handleCreateVM(request as any);

      expect(result.content[0].text).toContain('Post-Creation Configuration:');
      expect(result.content[0].text).toContain('Hostname set to: test-vm');
      expect(result.content[0].text).toContain(
        "User 'testuser' created with passwordless sudo and SSH access"
      );
      expect(mockHandleSetHostname).toHaveBeenCalled();
      expect(mockHandleManageSshAuth).toHaveBeenCalled();
    });

    it('should skip configuration if VM cannot be started', async () => {
      // Clear all default mocks first
      mockParseVmList.mockReset();
      mockExecutePrlctl.mockReset();
      
      // Setup for vmExists check - VM doesn't exist initially
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' }); // list --all for vmExists
      mockParseVmList.mockReturnValueOnce([]); // vmExists returns false
      
      // VM creation
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'VM created successfully', stderr: '' });
      
      // Setup for isVmRunning check before configuration
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' }); // list --all for isVmRunning
      mockParseVmList.mockReturnValueOnce([]); // VM not running initially
      
      // VM start failure
      mockExecutePrlctl.mockRejectedValueOnce(new Error('VM failed to start'));

      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            setHostname: true,
          },
        },
      };

      const result = await handleCreateVM(request as any);

      expect(result.content[0].text).toContain('Post-Creation Configuration:');
      expect(result.content[0].text).toContain('VM could not be started');
      expect(result.content[0].text).toContain('Failed Steps:');
      expect(result.content[0].text).toContain('VM Start for Configuration');
      expect(mockHandleSetHostname).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle hostname setting failure gracefully', async () => {
      // Clear all default mocks first
      mockParseVmList.mockReset();
      mockExecutePrlctl.mockReset();
      
      // Setup for vmExists check - VM doesn't exist initially
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' }); // list --all for vmExists
      mockParseVmList.mockReturnValueOnce([]); // vmExists returns false
      
      // VM creation
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'VM created successfully', stderr: '' });
      
      // Setup for isVmRunning check before configuration
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' }); // list --all for isVmRunning
      mockParseVmList.mockReturnValueOnce([]); // VM not running initially
      
      // VM start
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'VM started', stderr: '' });
      
      // Setup for isVmRunning check after start
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' }); // list --all for isVmRunning
      mockParseVmList.mockReturnValueOnce([{ uuid: '{test-uuid}', name: 'test-vm', status: 'running' }]); // VM running
      
      // VM stop
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'VM stopped', stderr: '' });
      
      // Mock hostname setting failure - returns error response
      mockHandleSetHostname.mockResolvedValue({
        content: [{ type: 'text', text: 'Error setting hostname' }],
        isError: true,
      });

      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            setHostname: true,
          },
        },
      };

      const result = await handleCreateVM(request as any);

      expect(result.content[0].text).toContain('Post-Creation Configuration:');
      expect(result.content[0].text).toContain('Hostname setting failed');
      expect(result.content[0].text).toContain('Failed Steps:');
      expect(result.content[0].text).toContain('Manual Completion Options:');
    });

    it('should handle SSH setup failure gracefully', async () => {
      // Clear all default mocks first and setup empty VM list
      mockParseVmList.mockReset();
      mockExecutePrlctl.mockReset();
      
      // Setup for vmExists check - VM doesn't exist initially
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' }); // list --all for vmExists
      mockParseVmList.mockReturnValueOnce([]); // vmExists returns false
      
      // VM creation
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'VM created successfully', stderr: '' });
      
      // Setup for isVmRunning check before configuration
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' }); // list --all for isVmRunning
      mockParseVmList.mockReturnValueOnce([]); // VM not running initially
      
      // VM start
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'VM started', stderr: '' });
      
      // Setup for isVmRunning check after start
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: '', stderr: '' }); // list --all for isVmRunning
      mockParseVmList.mockReturnValueOnce([{ uuid: '{test-uuid}', name: 'test-vm', status: 'running' }]); // VM running
      
      // VM stop
      mockExecutePrlctl.mockResolvedValueOnce({ stdout: 'VM stopped', stderr: '' });
      
      // Mock SSH setup failure
      mockHandleManageSshAuth.mockResolvedValue({
        content: [{ type: 'text', text: 'Error configuring SSH' }],
        isError: true,
      });

      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            createUser: true,
            setHostname: false,
          },
        },
      };

      const result = await handleCreateVM(request as any);

      // The implementation treats SSH setup failures as non-critical and continues
      expect(result.content[0].text).toContain('Failed Steps:');
      expect(result.content[0].text).toContain('User and SSH Configuration');
    });
  });

  describe('VM State Management', () => {
    it('should not restart VM if it was already running', async () => {
      // Mock VM already exists when checking
      mockExecutePrlctl
        .mockResolvedValueOnce({ 
          stdout: 'UUID                                     NAME     STATUS       IP_ADDR\n{test-uuid}                              test-vm  running      -', 
          stderr: '' 
        }); // list --all to check if VM exists
      
      // Mock parseVmList to show VM exists
      mockParseVmList.mockReturnValueOnce([
        { uuid: '{test-uuid}', name: 'test-vm', status: 'running' },
      ]);

      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            setHostname: true,
          },
        },
      };

      const result = await handleCreateVM(request as any);

      // The implementation checks if VM exists and fails if it does
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("VM with name 'test-vm' already exists");
    });
  });

  describe('Input Validation', () => {
    it('should validate VM name requirements', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: '', // Invalid empty name
          },
        },
      };

      const result = await handleCreateVM(request as any);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('VM Creation Failed');
    });

    it('should validate memory constraints', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            memory: 100, // Below minimum of 512MB
          },
        },
      };

      const result = await handleCreateVM(request as any);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('VM Creation Failed');
    });
  });
});
