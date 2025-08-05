/**
 * Centralized Mock Manager for Test Infrastructure
 * 
 * This module provides a centralized way to manage child_process mocks
 * across the test suite, preventing conflicts and ensuring proper cleanup.
 */

import { PrlctlMock } from './prlctl-mock';

// Type definition for mocked execFile
type MockedExecFile = jest.Mock<any, any[]>;

export class MockManager {
  private static instance: MockManager;
  private execFileMock?: MockedExecFile;
  private activeInstances = new Set<string>();
  private prlctlMocks = new Map<string, PrlctlMock>();

  private constructor() {
    // Nothing to do here - we'll get the mock from Jest when needed
  }

  static getInstance(): MockManager {
    if (!MockManager.instance) {
      MockManager.instance = new MockManager();
    }
    return MockManager.instance;
  }

  /**
   * Setup execFile mock for a specific test instance
   */
  setupExecFileMock(instanceId: string, prlctlMock: PrlctlMock): void {
    // Track active instance
    this.activeInstances.add(instanceId);
    this.prlctlMocks.set(instanceId, prlctlMock);

    // Get the mocked child_process module
    let childProcess: any;
    try {
      // Jest will automatically use our __mocks__/child_process.ts file
      childProcess = require('child_process');
    } catch (error) {
      console.error('MockManager: Failed to load child_process mock:', error);
      return;
    }

    // Get the execFile mock
    const execFileMock = childProcess.execFile;
    if (!execFileMock || typeof execFileMock.mockImplementation !== 'function') {
      console.error('MockManager: child_process.execFile is not a Jest mock');
      return;
    }

    // Store reference to the mock
    this.execFileMock = execFileMock as MockedExecFile;

    // Clear any previous mock data
    this.execFileMock.mockClear();

    // Update the mock implementation
    this.execFileMock.mockImplementation((command: any, args: any, options: any, callback?: any) => {
      // Handle both callback and options+callback signatures
      let actualCallback = callback;
      if (typeof options === 'function') {
        actualCallback = options;
      }

      if (command !== 'prlctl' || !args) {
        if (actualCallback) {
          actualCallback(new Error(`Command not found: ${command}`));
        }
        return null as any;
      }

      // Get the prlctl mock for the most recent instance (for compatibility)
      // In practice, there should only be one active instance at a time
      const activeMock = this.getActivePrlctlMock();
      if (!activeMock) {
        if (actualCallback) {
          actualCallback(new Error('No active prlctl mock found'));
        }
        return null as any;
      }

      // Execute the mock
      activeMock.execute(args as string[])
        .then((result) => {
          if (actualCallback) {
            actualCallback(null, result.stdout, result.stderr);
          }
        })
        .catch((error) => {
          if (actualCallback) {
            actualCallback(error);
          }
        });

      return null as any;
    });
  }

  /**
   * Get the active prlctl mock (returns the most recent one)
   */
  private getActivePrlctlMock(): PrlctlMock | undefined {
    // Return the most recently added mock
    const instances = Array.from(this.activeInstances);
    if (instances.length === 0) {
      return undefined;
    }
    const latestInstance = instances[instances.length - 1];
    return this.prlctlMocks.get(latestInstance);
  }

  /**
   * Cleanup mock for a specific instance
   */
  cleanupInstance(instanceId: string): void {
    this.activeInstances.delete(instanceId);
    this.prlctlMocks.delete(instanceId);

    // If no more active instances, clear the mock
    if (this.activeInstances.size === 0 && this.execFileMock) {
      this.execFileMock.mockClear();
      this.execFileMock.mockReset();
      this.execFileMock = undefined;
    }
  }

  /**
   * Clear all mock calls without removing the mock
   */
  clearMockCalls(): void {
    if (this.execFileMock) {
      this.execFileMock.mockClear();
    }
  }

  /**
   * Get the mock for assertions
   */
  getExecFileMock(): MockedExecFile | undefined {
    return this.execFileMock;
  }

  /**
   * Force reset all mocks (use with caution)
   */
  forceReset(): void {
    this.activeInstances.clear();
    this.prlctlMocks.clear();
    
    if (this.execFileMock) {
      this.execFileMock.mockClear();
      this.execFileMock.mockReset();
      this.execFileMock = undefined;
    }
  }
}

/**
 * Global mock setup helper for use in test files
 */
export function setupGlobalMocks(): void {
  // Clear all Jest mocks
  jest.clearAllMocks();
  
  // Ensure mock manager is reset
  MockManager.getInstance().forceReset();
  
  // If child_process is mocked, ensure it's set up correctly
  const cp = require('child_process');
  if (cp.execFile && typeof cp.execFile.mockImplementation === 'function') {
    // child_process is already mocked, just clear it
    cp.execFile.mockClear();
  }
}

/**
 * Global mock cleanup helper for use in test files
 */
export function cleanupGlobalMocks(): void {
  // Clear all Jest mocks
  jest.clearAllMocks();
  
  // Reset mock manager
  MockManager.getInstance().forceReset();
  
  // Restore all Jest mocks
  jest.restoreAllMocks();
}
