/**
 * Global test setup file
 * This file runs before all tests and sets up global mocks
 */

// Ensure child_process is mocked globally
jest.mock('child_process');

// Set test timeout
jest.setTimeout(30000);

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});