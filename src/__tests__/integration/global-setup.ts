/**
 * Global Setup for Integration Tests
 *
 * Runs once before all test suites
 */

export default async function globalSetup() {
  console.log('\n🚀 Starting MCP Parallels Desktop Integration Tests\n');

  // Check for required environment
  const platform = process.platform;
  if (platform !== 'darwin') {
    console.warn(
      `⚠️  Warning: Running on ${platform}. These tests are designed for macOS with Parallels Desktop.`
    );
  }

  // Set up test environment variables
  process.env.MCP_TEST_ENV = 'integration';
  process.env.MCP_LOG_LEVEL = process.env.CI ? 'error' : 'warn';

  // Create test directories if needed
  const { promises: fs } = await import('fs');
  const path = await import('path');

  const testDirs = [
    path.join(process.cwd(), 'test-results'),
    path.join(process.cwd(), 'coverage'),
    '/tmp/parallels-test-screenshots',
  ];

  for (const dir of testDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's fine
    }
  }

  // Log test configuration
  console.log('Test Configuration:');
  console.log(`  Platform: ${platform}`);
  console.log(`  Node Version: ${process.version}`);
  console.log('  Test Timeout: 30s');
  console.log('  Max Workers: 2');
  console.log('');
}
