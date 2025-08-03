// Global teardown for E2E tests
export default async function globalTeardown() {
  console.log('\n🧹 Cleaning up E2E test environment...');
  
  // Add any cleanup logic here
  // For example: cleanup test VMs, temporary files, etc.
  
  console.log('✅ E2E test cleanup complete\n');
}