/**
 * Test Data Factory for Integration Tests
 *
 * Provides consistent test data generation for all integration tests
 */

export interface TestVM {
  uuid: string;
  name: string;
  status: 'running' | 'stopped' | 'suspended' | 'paused';
  ipAddress?: string;
  memory?: number;
  cpus?: number;
  diskSize?: number;
  os?: string;
}

export interface TestSnapshot {
  id: string;
  name: string;
  date: string;
  current: boolean;
  description?: string;
}

export interface TestEnvironment {
  vms: TestVM[];
  templates: TestVM[];
  snapshots: Map<string, TestSnapshot[]>;
}

export class TestDataFactory {
  private static vmCounter = 0;
  private static snapshotCounter = 0;

  /**
   * Create a complete test environment with various VM states
   */
  static createTestEnvironment(): TestEnvironment {
    const vms: TestVM[] = [
      this.createVM({
        name: 'ubuntu-dev',
        status: 'running',
        ipAddress: '10.211.55.10',
        os: 'ubuntu',
      }),
      this.createVM({ name: 'windows-test', status: 'stopped', os: 'windows-11' }),
      this.createVM({ name: 'macos-build', status: 'suspended', os: 'macos' }),
      this.createVM({
        name: 'db-server',
        status: 'running',
        ipAddress: '10.211.55.11',
        memory: 8192,
        cpus: 4,
      }),
      this.createVM({ name: 'web-frontend', status: 'running', ipAddress: '10.211.55.12' }),
      this.createVM({ name: 'api-backend', status: 'stopped' }),
      this.createVM({ name: 'test-runner', status: 'paused' }),
    ];

    const templates: TestVM[] = [
      this.createVM({ name: 'ubuntu-22.04-template', status: 'stopped', os: 'ubuntu' }),
      this.createVM({ name: 'windows-11-template', status: 'stopped', os: 'windows-11' }),
      this.createVM({ name: 'macos-14-template', status: 'stopped', os: 'macos' }),
    ];

    const snapshots = new Map<string, TestSnapshot[]>();

    // Add snapshots for some VMs
    snapshots.set('ubuntu-dev', [
      this.createSnapshot({ name: 'clean-install', current: false }),
      this.createSnapshot({ name: 'dev-tools-installed', current: true }),
      this.createSnapshot({ name: 'project-setup', current: false }),
    ]);

    snapshots.set('db-server', [
      this.createSnapshot({ name: 'empty-database', current: false }),
      this.createSnapshot({ name: 'test-data-loaded', current: false }),
      this.createSnapshot({ name: 'production-backup', current: true }),
    ]);

    return { vms, templates, snapshots };
  }

  /**
   * Create a test VM with default or custom properties
   */
  static createVM(overrides: Partial<TestVM> = {}): TestVM {
    const defaults: TestVM = {
      uuid: this.createUuid(),
      name: `test-vm-${++this.vmCounter}`,
      status: 'stopped',
      memory: 2048,
      cpus: 2,
      diskSize: 50,
      os: 'ubuntu',
    };

    return { ...defaults, ...overrides };
  }

  /**
   * Create a test snapshot
   */
  static createSnapshot(overrides: Partial<TestSnapshot> = {}): TestSnapshot {
    const defaults: TestSnapshot = {
      id: this.createUuid(),
      name: `snapshot-${++this.snapshotCounter}`,
      date: new Date().toISOString(),
      current: false,
      description: 'Test snapshot',
    };

    return { ...defaults, ...overrides };
  }

  /**
   * Create a valid Parallels UUID
   */
  static createUuid(): string {
    const hex = () => Math.floor(Math.random() * 16).toString(16);
    const segment = (length: number) => Array(length).fill(0).map(hex).join('');

    return `{${segment(8)}-${segment(4)}-${segment(4)}-${segment(4)}-${segment(12)}}`;
  }

  /**
   * Create test SSH key pair
   */
  static createSshKeyPair() {
    return {
      publicKey: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDTest... test@example.com',
      privateKey:
        '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEATest...\n-----END RSA PRIVATE KEY-----',
      fingerprint: 'SHA256:TestFingerprint123456789',
    };
  }

  /**
   * Create prlctl command output for various scenarios
   */
  static createPrlctlOutput(
    command: string,
    scenario: 'success' | 'error' | 'warning' = 'success'
  ): string {
    const outputs: Record<string, Record<string, string>> = {
      create: {
        success: "Creating virtual machine 'test-vm'...\nThe VM has been successfully created.",
        error: 'Failed to create VM: A virtual machine with this name already exists.',
        warning:
          "Creating virtual machine 'test-vm'...\nWarning: Low disk space\nThe VM has been successfully created.",
      },
      start: {
        success: "Starting the VM...\nVM 'test-vm' has been successfully started.",
        error: 'Failed to start VM: Not enough physical memory available.',
        warning: 'Starting the VM...\nWarning: VM tools are outdated\nVM started successfully.',
      },
      stop: {
        success: "Stopping the VM...\nVM 'test-vm' has been successfully stopped.",
        error: 'Failed to stop VM: The virtual machine is not running.',
        warning: 'Stopping the VM...\nWarning: Unsaved changes may be lost\nVM stopped.',
      },
      snapshot: {
        success: "Creating snapshot 'backup'...\nSnapshot has been successfully created.",
        error: 'Failed to create snapshot: Not enough disk space.',
        warning: 'Creating snapshot...\nWarning: VM has unsaved changes\nSnapshot created.',
      },
    };

    return outputs[command]?.[scenario] || `${command} completed successfully.`;
  }

  /**
   * Create realistic VM configurations for different use cases
   */
  static createVMPresets() {
    return {
      development: {
        ubuntu: this.createVM({
          name: 'ubuntu-dev',
          os: 'ubuntu',
          memory: 4096,
          cpus: 2,
          diskSize: 100,
        }),
        windows: this.createVM({
          name: 'windows-dev',
          os: 'windows-11',
          memory: 8192,
          cpus: 4,
          diskSize: 200,
        }),
      },
      testing: {
        minimal: this.createVM({
          name: 'test-minimal',
          memory: 512,
          cpus: 1,
          diskSize: 20,
        }),
        stress: this.createVM({
          name: 'test-stress',
          memory: 16384,
          cpus: 8,
          diskSize: 500,
        }),
      },
      production: {
        webServer: this.createVM({
          name: 'prod-web',
          memory: 4096,
          cpus: 4,
          diskSize: 100,
          status: 'running',
          ipAddress: '10.211.55.100',
        }),
        database: this.createVM({
          name: 'prod-db',
          memory: 16384,
          cpus: 8,
          diskSize: 1000,
          status: 'running',
          ipAddress: '10.211.55.101',
        }),
      },
    };
  }

  /**
   * Create error scenarios for testing
   */
  static createErrorScenarios() {
    return {
      vmNotFound: {
        error: 'Failed to get VM info: The virtual machine could not be found.',
        stderr: "prlctl: The virtual machine 'non-existent' could not be found.",
      },
      permissionDenied: {
        error: 'Permission denied',
        stderr: 'prlctl: Permission denied. Try running with sudo.',
      },
      resourceExhausted: {
        error: 'Not enough resources',
        stderr: 'Failed to start VM: Not enough physical memory available on the host.',
      },
      diskFull: {
        error: 'No space left on device',
        stderr: 'Failed to create snapshot: No space left on device.',
      },
      networkError: {
        error: 'Network error',
        stderr: 'Failed to connect: Network is unreachable.',
      },
      timeout: {
        error: 'Operation timed out',
        stderr: 'prlctl: Operation timed out after 30 seconds.',
      },
      licenseError: {
        error: 'License limit reached',
        stderr: 'Cannot start VM: Maximum number of running VMs reached for your license.',
      },
    };
  }

  /**
   * Create batch operation test scenarios
   */
  static createBatchScenarios() {
    return {
      small: Array.from({ length: 3 }, (_, i) => `batch-vm-${i}`),
      medium: Array.from({ length: 10 }, (_, i) => `batch-vm-${i}`),
      large: Array.from({ length: 50 }, (_, i) => `batch-vm-${i}`),
      mixed: [
        'existing-vm-1',
        'non-existent-vm',
        'existing-vm-2',
        'permission-denied-vm',
        'existing-vm-3',
      ],
    };
  }

  /**
   * Reset counters (useful between test suites)
   */
  static reset() {
    this.vmCounter = 0;
    this.snapshotCounter = 0;
  }
}

/**
 * Helper to create mock file system structure for tests
 */
export class MockFileSystem {
  static createVMDirectory(vmName: string) {
    return {
      path: `/Users/parallels/VMs/${vmName}.pvm`,
      files: [
        `${vmName}.pvm/config.pvs`,
        `${vmName}.pvm/${vmName}.hdd`,
        `${vmName}.pvm/Snapshots/`,
      ],
    };
  }

  static createSnapshotFiles(vmName: string, snapshots: TestSnapshot[]) {
    return snapshots.map((snapshot) => ({
      path: `/Users/parallels/VMs/${vmName}.pvm/Snapshots/${snapshot.id}`,
      files: [
        `${snapshot.id}/config.pvs`,
        `${snapshot.id}/memory.dat`,
        `${snapshot.id}/snapshot.xml`,
      ],
    }));
  }

  static createScreenshotPath(vmName: string, timestamp?: number) {
    const ts = timestamp || Date.now();
    return `/tmp/parallels-screenshot-${vmName}-${ts}.png`;
  }
}

/**
 * Test timing utilities
 */
export class TestTiming {
  static shortDelay = 50;
  static mediumDelay = 200;
  static longDelay = 500;

  static simulateOperation(delay: number = this.mediumDelay): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  static measureDuration<T>(operation: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    return operation().then((result) => ({
      result,
      duration: Date.now() - start,
    }));
  }
}
