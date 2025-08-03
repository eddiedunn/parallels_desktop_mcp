import { handleCreateVM } from '../../../tools/createVM.js';
import * as prlctlHandler from '../../../prlctl-handler.js';
import * as setHostnameModule from '../../../tools/setHostname.js';
import * as manageSshAuthModule from '../../../tools/manageSshAuth.js';
import * as os from 'os';

// Mock the dependencies
jest.mock('../../../prlctl-handler.js');
jest.mock('../../../tools/setHostname.js');
jest.mock('../../../tools/manageSshAuth.js');
jest.mock('os');

const mockExecutePrlctl = prlctlHandler.executePrlctl as jest.MockedFunction<typeof prlctlHandler.executePrlctl>;
const mockParseVmList = jest.mocked(prlctlHandler.parseVmList);
const mockSanitizeVmIdentifier = prlctlHandler.sanitizeVmIdentifier as jest.MockedFunction<typeof prlctlHandler.sanitizeVmIdentifier>;
const mockHandleSetHostname = setHostnameModule.handleSetHostname as jest.MockedFunction<typeof setHostnameModule.handleSetHostname>;
const mockHandleManageSshAuth = manageSshAuthModule.handleManageSshAuth as jest.MockedFunction<typeof manageSshAuthModule.handleManageSshAuth>;
const mockOsUserInfo = os.userInfo as jest.MockedFunction<typeof os.userInfo>;

describe('createVM Tool Enhanced', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up default mocks
    mockSanitizeVmIdentifier.mockImplementation((input: string) => input.replace(/[^a-zA-Z0-9\-_{}]/g, ''));
    mockOsUserInfo.mockReturnValue({ username: 'testuser' } as any);
    
    // Default successful execution
    mockExecutePrlctl.mockResolvedValue({
      stdout: 'VM created successfully',
      stderr: ''
    });
    
    // Default VM status (not running initially)
    mockParseVmList.mockReturnValue([]);
    
    // Default successful hostname setting
    mockHandleSetHostname.mockResolvedValue({
      content: [{ type: 'text', text: 'Hostname set successfully' }]
    });
    
    // Default successful SSH setup
    mockHandleManageSshAuth.mockResolvedValue({
      content: [{ type: 'text', text: 'SSH configured successfully' }]
    });
  });

  describe('Basic VM Creation', () => {
    it('should create a VM with only name parameter (backward compatibility)', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm'
          }
        }
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
            diskSize: 50
          }
        }
      };

      const result = await handleCreateVM(request as any);

      expect(result.content[0].text).toContain('Memory: 2048MB');
      expect(result.content[0].text).toContain('CPUs: 2');
      expect(result.content[0].text).toContain('Disk: 50GB');
      
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['create', 'test-vm']);
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['set', 'test-vm', '--memsize', '2048']);
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['set', 'test-vm', '--cpus', '2']);
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['set', 'test-vm', '--device-set', 'hdd0', '--size', '50G']);
    });
  });

  describe('Enhanced Features', () => {
    it('should set hostname when setHostname is true (default)', async () => {
      // Mock VM list to show VM is running after start
      mockParseVmList
        .mockReturnValueOnce([]) // First call - VM not running
        .mockReturnValueOnce([{ uuid: '{test-uuid}', name: 'test-vm', status: 'running' }]); // Second call - VM running

      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            setHostname: true
          }
        }
      };

      const result = await handleCreateVM(request as any);

      expect(result.content[0].text).toContain('Hostname set to: test-vm');
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['start', 'test-vm']);
      expect(mockHandleSetHostname).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            arguments: expect.objectContaining({
              vmId: 'test-vm',
              hostname: 'test-vm'
            })
          })
        })
      );
      expect(mockExecutePrlctl).toHaveBeenCalledWith(['stop', 'test-vm']);
    });

    it('should create user and setup SSH when createUser is true', async () => {
      // Mock VM list to show VM is running after start
      mockParseVmList
        .mockReturnValueOnce([]) // First call - VM not running
        .mockReturnValueOnce([{ uuid: '{test-uuid}', name: 'test-vm', status: 'running' }]); // Second call - VM running

      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            createUser: true,
            setHostname: false // Disable hostname to focus on user creation
          }
        }
      };

      const result = await handleCreateVM(request as any);

      expect(result.content[0].text).toContain("User 'testuser' created with passwordless sudo and SSH access");
      expect(mockHandleManageSshAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            arguments: expect.objectContaining({
              vmId: 'test-vm',
              username: 'testuser',
              enablePasswordlessSudo: true
            })
          })
        })
      );
    });

    it('should handle both hostname and user creation together', async () => {
      // Mock VM list to show VM is running after start
      mockParseVmList
        .mockReturnValueOnce([]) // First call - VM not running
        .mockReturnValueOnce([{ uuid: '{test-uuid}', name: 'test-vm', status: 'running' }]); // Second call - VM running

      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            setHostname: true,
            createUser: true
          }
        }
      };

      const result = await handleCreateVM(request as any);

      expect(result.content[0].text).toContain('Hostname set to: test-vm');
      expect(result.content[0].text).toContain("User 'testuser' created with passwordless sudo and SSH access");
      expect(mockHandleSetHostname).toHaveBeenCalled();
      expect(mockHandleManageSshAuth).toHaveBeenCalled();
    });

    it('should skip configuration if VM cannot be started', async () => {
      // Mock VM start failure - need to mock the prlctl calls in sequence
      mockExecutePrlctl
        .mockResolvedValueOnce({ stdout: 'VM created successfully', stderr: '' }) // Create VM
        .mockResolvedValueOnce({ stdout: 'VM list output', stderr: '' }) // First VM list check (not running)
        .mockRejectedValueOnce(new Error('VM failed to start')) // Start failure
        .mockResolvedValueOnce({ stdout: 'VM list output', stderr: '' }); // Second VM list check (still not running)

      // Mock parseVmList to return empty array (VM not running) for both calls
      mockParseVmList
        .mockReturnValueOnce([]) // First call - VM not running
        .mockReturnValueOnce([]); // Second call - VM still not running after failed start

      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            setHostname: true
          }
        }
      };

      const result = await handleCreateVM(request as any);

      expect(result.content[0].text).toContain('VM could not be started for configuration');
      expect(mockHandleSetHostname).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle hostname setting failure gracefully', async () => {
      // Mock VM list to show VM is running after start
      mockParseVmList
        .mockReturnValueOnce([]) // First call - VM not running
        .mockReturnValueOnce([{ uuid: '{test-uuid}', name: 'test-vm', status: 'running' }]); // Second call - VM running

      // Mock hostname setting failure
      mockHandleSetHostname.mockResolvedValue({
        content: [{ type: 'text', text: 'Error setting hostname' }],
        isError: true
      });

      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            setHostname: true
          }
        }
      };

      const result = await handleCreateVM(request as any);

      expect(result.content[0].text).toContain('Hostname setting failed');
      expect(result.content[0].text).toContain('Failed Steps:');
      expect(result.content[0].text).toContain('Manual Completion:');
    });

    it('should handle SSH setup failure gracefully', async () => {
      // Mock VM list to show VM is running after start
      mockParseVmList
        .mockReturnValueOnce([]) // First call - VM not running
        .mockReturnValueOnce([{ uuid: '{test-uuid}', name: 'test-vm', status: 'running' }]); // Second call - VM running

      // Mock SSH setup failure
      mockHandleManageSshAuth.mockResolvedValue({
        content: [{ type: 'text', text: 'Error configuring SSH' }],
        isError: true
      });

      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            createUser: true,
            setHostname: false
          }
        }
      };

      const result = await handleCreateVM(request as any);

      expect(result.content[0].text).toContain('User/SSH setup failed');
      expect(result.content[0].text).toContain('Failed Steps:');
    });
  });

  describe('VM State Management', () => {
    it('should not restart VM if it was already running', async () => {
      // Mock VM list to show VM is already running
      mockParseVmList.mockReturnValue([{ uuid: '{test-uuid}', name: 'test-vm', status: 'running' }]);

      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            setHostname: true
          }
        }
      };

      const result = await handleCreateVM(request as any);

      expect(result.content[0].text).toContain('Hostname set to: test-vm');
      
      // Should not call start or stop since VM was already running
      expect(mockExecutePrlctl).not.toHaveBeenCalledWith(['start', 'test-vm']);
      expect(mockExecutePrlctl).not.toHaveBeenCalledWith(['stop', 'test-vm']);
    });
  });

  describe('Input Validation', () => {
    it('should validate VM name requirements', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: '' // Invalid empty name
          }
        }
      };

      const result = await handleCreateVM(request as any);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error creating VM');
    });

    it('should validate memory constraints', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'createVM',
          arguments: {
            name: 'test-vm',
            memory: 100 // Below minimum of 512MB
          }
        }
      };

      const result = await handleCreateVM(request as any);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error creating VM');
    });
  });
});