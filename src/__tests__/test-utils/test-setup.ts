/**
 * Standard Test Setup Utilities
 * 
 * Provides standardized setup and teardown functions for all test files
 * to ensure consistent mock management and cleanup.
 */

import { setupGlobalMocks, cleanupGlobalMocks } from './mock-manager';
import { clearOsMocks, resetOsMocks } from './system-mocks';

/**
 * Standard beforeAll setup for test suites
 */
export function standardBeforeAll(): void {
  // Setup global mocks
  setupGlobalMocks();
}

/**
 * Standard afterAll cleanup for test suites
 */
export function standardAfterAll(): void {
  // Cleanup global mocks
  cleanupGlobalMocks();
}

/**
 * Standard beforeEach setup for individual tests
 */
export function standardBeforeEach(): void {
  // Clear all Jest mocks
  jest.clearAllMocks();
  
  // Clear OS mocks
  clearOsMocks();
}

/**
 * Standard afterEach cleanup for individual tests
 */
export function standardAfterEach(): void {
  // Clear all Jest mocks
  jest.clearAllMocks();
  
  // Clear OS mocks
  clearOsMocks();
}

/**
 * Setup hooks for a test suite
 * Call this at the top of your describe block
 */
export function setupTestSuite(): void {
  beforeAll(standardBeforeAll);
  afterAll(standardAfterAll);
  beforeEach(standardBeforeEach);
  afterEach(standardAfterEach);
}

/**
 * Manual test cleanup helper
 * Use this when you need to cleanup mocks mid-test
 */
export function cleanupMocks(): void {
  jest.clearAllMocks();
  clearOsMocks();
}

/**
 * Reset all mocks to initial state
 * Use this when you need a complete reset
 */
export function resetAllMocks(): void {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  resetOsMocks();
  cleanupGlobalMocks();
  setupGlobalMocks();
}
