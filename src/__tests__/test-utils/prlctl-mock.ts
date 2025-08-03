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
}
