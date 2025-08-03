// Global setup for E2E tests
export default async function globalSetup() {
  console.log('\n📦 Setting up E2E test environment...');
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.MCP_TEST_MODE = 'true';
  
  // Ensure clean test environment
  // Add any global setup logic here
  
  console.log('✅ E2E test environment ready\n');
}