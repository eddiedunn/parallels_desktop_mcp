/**
 * Manual mock for child_process module
 * 
 * This mock provides a flexible implementation that can be controlled
 * by tests while working with the MockManager infrastructure.
 */

// Create the base mock functions
const execFileMock = jest.fn();
const execMock = jest.fn();
const spawnMock = jest.fn();
const forkMock = jest.fn();
const execSyncMock = jest.fn();
const execFileSyncMock = jest.fn();
const spawnSyncMock = jest.fn();

// Default implementation for execFile that can be overridden
// Return success by default - tests can override this
execFileMock.mockImplementation((_command: any, _args: any, options: any, callback?: any) => {
  // Handle both callback and options+callback signatures
  let actualCallback = callback;
  if (typeof options === 'function') {
    actualCallback = options;
  }
  
  // By default, return success with empty output
  if (actualCallback) {
    actualCallback(null, '', '');
  }
  
  return null;
});

// Export the mocks
export {
  execFileMock as execFile,
  execMock as exec,
  spawnMock as spawn,
  forkMock as fork,
  execSyncMock as execSync,
  execFileSyncMock as execFileSync,
  spawnSyncMock as spawnSync
};

// Default export for require() compatibility
export default {
  execFile: execFileMock,
  exec: execMock,
  spawn: spawnMock,
  fork: forkMock,
  execSync: execSyncMock,
  execFileSync: execFileSyncMock,
  spawnSync: spawnSyncMock
};