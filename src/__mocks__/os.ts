/**
 * Manual mock for the 'os' module
 * 
 * This mock is used in tests to override OS-level functions
 */

// Create mocked functions
const userInfoMock = jest.fn();
const hostnameMock = jest.fn();
const homedirMock = jest.fn();
const platformMock = jest.fn();

// Export the mocked functions
export const userInfo = userInfoMock;
export const hostname = hostnameMock;
export const homedir = homedirMock;
export const platform = platformMock;

// Export all other os functions as jest mocks
export const arch = jest.fn(() => 'x64');
export const cpus = jest.fn(() => []);
export const endianness = jest.fn(() => 'LE');
export const freemem = jest.fn(() => 8589934592);
export const loadavg = jest.fn(() => [0, 0, 0]);
export const networkInterfaces = jest.fn(() => ({}));
export const release = jest.fn(() => '10.0.0');
export const tmpdir = jest.fn(() => '/tmp');
export const totalmem = jest.fn(() => 17179869184);
export const type = jest.fn(() => 'Darwin');
export const uptime = jest.fn(() => 3600);
export const version = jest.fn(() => 'Darwin Kernel Version 10.0.0');

// Export constants
export const EOL = '\n';
export const constants = {
  signals: {},
  errno: {},
};