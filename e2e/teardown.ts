// Global teardown for E2E tests
import { cleanupTestVMs } from '../src/utils/test-vm-cleanup';

export default async function globalTeardown() {
  console.log('\n🧹 Cleaning up E2E test environment...');
  
  // Clean up any E2E test VMs using centralized cleanup utility
  try {
    const result = await cleanupTestVMs({
      logPrefix: '[E2E Cleanup]',
      force: true, // Force cleanup even if some VMs fail
      patterns: [
        // E2E-specific patterns
        /^testrm-rf$/i,     // Security test VM (actual sanitized name)
        /^testrmrf$/i,      // Security test VM (alternative pattern)
        /^test-e2e-/i,      // E2E test VMs
        /^e2e-test-/i,      // Alternative e2e naming
        /^mcp-e2e-/i,       // MCP-specific e2e VMs
        // Also include general test patterns
        /^test-/i,
        /^temp-/i,
      ]
    });
    
    if (result.cleaned.length > 0) {
      console.log(`[E2E Cleanup] Successfully cleaned ${result.cleaned.length} VM(s): ${result.cleaned.join(', ')}`);
    }
    
    if (result.failed.length > 0) {
      console.error(`[E2E Cleanup] Failed to clean ${result.failed.length} VM(s): ${result.failed.join(', ')}`);
      Object.entries(result.errors).forEach(([vm, error]) => {
        console.error(`  - ${vm}: ${error}`);
      });
    }
  } catch (error: any) {
    console.error('[E2E Cleanup] Cleanup failed:', error.message);
  }
  
  // Add any other E2E-specific cleanup here
  // For example: cleanup temporary files, logs, etc.
  
  console.log('✅ E2E test cleanup complete\n');
}