import { PrlctlResult } from '../../prlctl-handler';

export interface MockResponse {
  stdout?: string;
  stderr?: string;
  shouldFail?: boolean;
  error?: string;
  delay?: number;
}

export class PrlctlMock {
  private responses: Map<string, MockResponse> = new Map();
  private callHistory: Array<{ command: string; args: string[] }> = [];

  /**
   * Add a mock response for a specific command and arguments
   */
  addResponse(command: string, args: string[], response: MockResponse) {
    const key = this.createKey([command, ...args]);
    this.responses.set(key, response);
  }

  /**
   * Add a response that matches any arguments for a command
   */
  addDefaultResponse(command: string, response: MockResponse) {
    const key = `DEFAULT:${command}`;
    this.responses.set(key, response);
  }

  /**
   * Execute mock prlctl command
   */
  async execute(args: string[]): Promise<PrlctlResult> {
    this.callHistory.push({ command: args[0], args: args.slice(1) });

    // Try exact match first
    const exactKey = this.createKey(args);
    let response = this.responses.get(exactKey);

    // Try default response for command
    if (!response && args.length > 0) {
      const defaultKey = `DEFAULT:${args[0]}`;
      response = this.responses.get(defaultKey);
    }

    if (!response) {
      console.log('Mock lookup failed:');
      console.log('  Args:', args);
      console.log('  Exact key:', exactKey);
      console.log('  Available keys:', Array.from(this.responses.keys()));
      throw new Error(`No mock defined for prlctl ${args.join(' ')}`);
    }

    // Simulate delay if specified
    if (response.delay) {
      await new Promise((resolve) => setTimeout(resolve, response.delay));
    }

    if (response.shouldFail) {
      const error: any = new Error(response.error || 'Command failed');
      error.stdout = response.stdout || '';
      error.stderr = response.stderr || '';
      throw error;
    }

    return {
      stdout: response.stdout || '',
      stderr: response.stderr || '',
    };
  }

  /**
   * Get call history
   */
  getCallHistory() {
    return [...this.callHistory];
  }

  /**
   * Clear all mocks and history
   */
  reset() {
    this.responses.clear();
    this.callHistory = [];
  }

  /**
   * Check if a command was called
   */
  wasCalledWith(command: string, args?: string[]): boolean {
    return this.callHistory.some((call) => {
      if (call.command !== command) {
        return false;
      }
      if (!args) {
        return true;
      }
      return JSON.stringify(call.args) === JSON.stringify(args);
    });
  }

  /**
   * Get number of times a command was called
   */
  getCallCount(command: string): number {
    return this.callHistory.filter((call) => call.command === command).length;
  }

  private createKey(args: string[]): string {
    return args.join(':');
  }
}

/**
 * Factory for common mock responses
 */
export class MockResponseFactory {
  static vmList(
    vms: Array<{
      uuid: string;
      name: string;
      status: string;
      ipAddress?: string;
    }>
  ): MockResponse {
    const lines = ['UUID                                     STATUS       IP_ADDR         NAME'];

    vms.forEach((vm) => {
      const ip = vm.ipAddress || '-';
      lines.push(`${vm.uuid} ${vm.status.padEnd(12)} ${ip.padEnd(15)} ${vm.name}`);
    });

    return { stdout: lines.join('\n') };
  }

  static snapshotList(
    snapshots: Array<{
      id: string;
      name: string;
      date: string;
      current?: boolean;
    }>
  ): MockResponse {
    const lines = snapshots.map((s) => {
      const current = s.current ? '*' : ' ';
      return `${s.id} ${current} "${s.name}" ${s.date}`;
    });

    return { stdout: lines.join('\n') };
  }

  static success(message: string): MockResponse {
    return { stdout: message };
  }

  static error(message: string, stderr?: string): MockResponse {
    return {
      shouldFail: true,
      error: message,
      stderr: stderr || message,
    };
  }

  static permissionDenied(): MockResponse {
    return {
      shouldFail: true,
      error: 'Permission denied',
      stderr: 'prlctl: Permission denied. Try running with sudo.',
    };
  }

  static vmNotFound(vmId: string): MockResponse {
    return {
      shouldFail: true,
      error: 'Failed to get VM info: The virtual machine could not be found.',
      stderr: `Failed to get VM '${vmId}' info: The virtual machine could not be found.`,
    };
  }

  /**
   * User creation command responses
   */
  static userCreation(username: string, vmId: string): MockResponse {
    return {
      stdout: `Creating user '${username}' in VM '${vmId}'...\nUser '${username}' has been successfully created.`,
    };
  }

  static userExists(username: string): MockResponse {
    return {
      shouldFail: true,
      error: 'User already exists',
      stderr: `useradd: user '${username}' already exists`,
    };
  }

  static userCreationFailed(username: string, reason: string = 'Invalid username'): MockResponse {
    return {
      shouldFail: true,
      error: `Failed to create user '${username}'`,
      stderr: `useradd: ${reason}`,
    };
  }

  /**
   * Hostname configuration command responses
   */
  static hostnameSet(hostname: string, vmId: string): MockResponse {
    return {
      stdout: `Setting hostname to '${hostname}' in VM '${vmId}'...\nHostname has been successfully updated.`,
    };
  }

  static hostnameGetCurrent(hostname: string): MockResponse {
    return {
      stdout: hostname,
    };
  }

  static hostnameFailed(reason: string = 'Invalid hostname'): MockResponse {
    return {
      shouldFail: true,
      error: 'Failed to set hostname',
      stderr: `hostnamectl: ${reason}`,
    };
  }

  /**
   * SSH setup command responses
   */
  static sshKeyAdded(username: string): MockResponse {
    return {
      stdout: `Adding SSH key for user '${username}'...\nSSH key has been successfully added to authorized_keys.`,
    };
  }

  static sshSetupComplete(username: string): MockResponse {
    return {
      stdout: `SSH access configured for user '${username}':\n- Public key added to authorized_keys\n- SSH directory permissions set\n- Password authentication disabled`,
    };
  }

  static sshSetupFailed(reason: string = 'Permission denied'): MockResponse {
    return {
      shouldFail: true,
      error: 'Failed to setup SSH',
      stderr: reason,
    };
  }

  /**
   * User management command responses
   */
  static userList(users: Array<{ username: string; uid: number; home: string }>): MockResponse {
    const lines = users.map((u) => `${u.username}:x:${u.uid}:${u.uid}::/home/${u.username}:/bin/bash`);
    return { stdout: lines.join('\n') };
  }

  static sudoersUpdated(username: string): MockResponse {
    return {
      stdout: `User '${username}' added to sudoers with NOPASSWD privileges.`,
    };
  }

  static sudoersFailed(username: string): MockResponse {
    return {
      shouldFail: true,
      error: 'Failed to update sudoers',
      stderr: `visudo: syntax error in /etc/sudoers.d/${username}`,
    };
  }

  /**
   * System information command responses
   */
  static systemInfo(info: {
    hostname?: string;
    os?: string;
    kernel?: string;
    arch?: string;
  }): MockResponse {
    const lines = [];
    if (info.hostname) lines.push(`Hostname: ${info.hostname}`);
    if (info.os) lines.push(`Operating System: ${info.os}`);
    if (info.kernel) lines.push(`Kernel: ${info.kernel}`);
    if (info.arch) lines.push(`Architecture: ${info.arch}`);
    
    return { stdout: lines.join('\n') };
  }

  /**
   * Home directory operations
   */
  static homeDirectoryCreated(username: string, path: string): MockResponse {
    return {
      stdout: `Created home directory for '${username}' at ${path}`,
    };
  }

  static homeDirectoryExists(path: string): MockResponse {
    return {
      stdout: `Home directory already exists at ${path}`,
    };
  }

  /**
   * Group management
   */
  static groupAdded(username: string, group: string): MockResponse {
    return {
      stdout: `User '${username}' added to group '${group}'`,
    };
  }

  static groupAddFailed(username: string, group: string): MockResponse {
    return {
      shouldFail: true,
      error: `Failed to add user to group`,
      stderr: `usermod: user '${username}' does not exist or group '${group}' does not exist`,
    };
  }

  /**
   * Combined operation responses
   */
  static vmConfigured(config: {
    vmId: string;
    hostname?: string;
    username?: string;
    sshEnabled?: boolean;
  }): MockResponse {
    const lines = [`VM '${config.vmId}' configuration complete:`];
    if (config.hostname) lines.push(`- Hostname set to: ${config.hostname}`);
    if (config.username) lines.push(`- User created: ${config.username}`);
    if (config.sshEnabled) lines.push(`- SSH access enabled`);
    
    return { stdout: lines.join('\n') };
  }

  /**
   * Network configuration
   */
  static networkConfigured(settings: {
    interface?: string;
    ip?: string;
    gateway?: string;
    dns?: string[];
  }): MockResponse {
    const lines = ['Network configuration applied:'];
    if (settings.interface) lines.push(`- Interface: ${settings.interface}`);
    if (settings.ip) lines.push(`- IP Address: ${settings.ip}`);
    if (settings.gateway) lines.push(`- Gateway: ${settings.gateway}`);
    if (settings.dns?.length) lines.push(`- DNS: ${settings.dns.join(', ')}`);
    
    return { stdout: lines.join('\n') };
  }

  /**
   * File operation responses
   */
  static fileCreated(path: string): MockResponse {
    return { stdout: `File created: ${path}` };
  }

  static fileWritten(path: string, size: number): MockResponse {
    return { stdout: `Wrote ${size} bytes to ${path}` };
  }

  static fileOperationFailed(operation: string, path: string, reason: string): MockResponse {
    return {
      shouldFail: true,
      error: `${operation} failed: ${reason}`,
      stderr: `${operation}: ${path}: ${reason}`,
    };
  }
}
