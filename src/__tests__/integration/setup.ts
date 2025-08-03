/**
 * Integration Test Setup
 *
 * Global setup for all integration tests
 */

// Extend Jest matchers
import '@testing-library/jest-dom';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MCP_TEST_MODE = 'true';

// Mock console methods to reduce noise during tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress expected errors and warnings during tests
  console.error = jest.fn((message: string, ...args: any[]) => {
    // Only log unexpected errors
    if (!message.includes('expected error') && !message.includes('test error')) {
      originalConsoleError(message, ...args);
    }
  });

  console.warn = jest.fn((message: string, ...args: any[]) => {
    // Only log unexpected warnings
    if (!message.includes('expected warning') && !message.includes('test warning')) {
      originalConsoleWarn(message, ...args);
    }
  });
});

afterAll(() => {
  // Restore console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

beforeEach(() => {
  // Ensure clean mock state before each test
  jest.restoreAllMocks();
});

// Global test helpers
global.testHelpers = {
  /**
   * Wait for a condition to be true
   */
  waitFor: async (condition: () => boolean, timeout = 5000, interval = 100): Promise<void> => {
    const startTime = Date.now();
    while (!condition() && Date.now() - startTime < timeout) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    if (!condition()) {
      throw new Error(`Condition not met within ${timeout}ms`);
    }
  },

  /**
   * Create a deferred promise for testing async flows
   */
  createDeferred: <T>() => {
    let resolve: (value: T) => void;
    let reject: (error: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve: resolve!, reject: reject! };
  },

  /**
   * Mock timer utilities
   */
  mockTimers: {
    enable: () => jest.useFakeTimers(),
    disable: () => jest.useRealTimers(),
    advance: (ms: number) => jest.advanceTimersByTime(ms),
    runAll: () => jest.runAllTimers(),
  },
};

// Declare global test helper types
declare global {
  // eslint-disable-next-line no-var
  var testHelpers: {
    waitFor: (condition: () => boolean, timeout?: number, interval?: number) => Promise<void>;
    createDeferred: <T>() => {
      promise: Promise<T>;
      resolve: (value: T) => void;
      reject: (error: any) => void;
    };
    mockTimers: {
      enable: () => void;
      disable: () => void;
      advance: (ms: number) => void;
      runAll: () => void;
    };
  };
}

// Export empty object to make this a module
export {};
