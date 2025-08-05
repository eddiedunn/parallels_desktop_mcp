/**
 * Global Teardown for Integration Tests
 *
 * Runs once after all test suites complete
 */

import globalVMCleanup from '../global-cleanup';

export default async function globalTeardown() {
  console.log('\n✅ Integration Tests Complete\n');

  // Clean up any orphaned test VMs
  await globalVMCleanup();

  // Clean up test artifacts if not in CI
  if (!process.env.CI) {
    const { promises: fs } = await import('fs');
    const path = await import('path');

    try {
      // Clean up temporary test screenshots
      const screenshotDir = '/tmp/parallels-test-screenshots';
      const files = await fs.readdir(screenshotDir);

      for (const file of files) {
        if (file.startsWith('test-')) {
          await fs.unlink(path.join(screenshotDir, file));
        }
      }
    } catch (error) {
      // Directory might not exist or be empty
    }
  }

  // Generate test summary
  const testResults = (global as any).__JEST_TEST_RESULTS__;
  if (testResults) {
    console.log('Test Summary:');
    console.log(`  Total Suites: ${testResults.numTotalTestSuites}`);
    console.log(`  Passed Suites: ${testResults.numPassedTestSuites}`);
    console.log(`  Total Tests: ${testResults.numTotalTests}`);
    console.log(`  Passed Tests: ${testResults.numPassedTests}`);
    console.log(
      `  Duration: ${((testResults.endTime - testResults.startTime) / 1000).toFixed(2)}s`
    );
  }
}
