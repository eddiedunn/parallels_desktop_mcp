/**
 * Global cleanup handler for test environment
 * 
 * This ensures that any test VMs are cleaned up even if tests crash
 * or are interrupted. It runs after all tests complete.
 */

import { cleanupTestVMs } from '../utils/test-vm-cleanup';

async function globalCleanup() {
  console.log('[Global Cleanup] Checking for orphaned test VMs...');

  try {
    const result = await cleanupTestVMs({
      logPrefix: '[Global Cleanup]',
      force: true, // Always force cleanup in global handler
    });
    
    if (result.found.length === 0) {
      console.log('[Global Cleanup] No test VMs found.');
      return;
    }
    
    console.log(`[Global Cleanup] Found ${result.found.length} test VM(s) to clean up: ${result.found.join(', ')}`);
    
    if (result.cleaned.length > 0) {
      console.log(`[Global Cleanup] Successfully cleaned ${result.cleaned.length} VM(s).`);
    }
    
    if (result.failed.length > 0) {
      console.error(`[Global Cleanup] Failed to clean ${result.failed.length} VM(s): ${result.failed.join(', ')}`);
    }
    
    console.log('[Global Cleanup] Cleanup complete.');
  } catch (error: any) {
    // If prlctl is not available or other error, just log and continue
    console.log('[Global Cleanup] Unable to check for test VMs:', error.message);
  }
}

// Run cleanup on process exit
process.on('exit', () => {
  // Note: This must be synchronous, so we just log here
  console.log('[Global Cleanup] Process exiting. Run manual cleanup if needed.');
});

// Export for Jest global teardown
export default globalCleanup;