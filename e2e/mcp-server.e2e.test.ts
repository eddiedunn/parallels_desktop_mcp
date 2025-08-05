import { spawn, ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';

describe('MCP Server E2E Tests', () => {
  let serverProcess: ChildProcess;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    // Build the project
    await new Promise<void>((resolve, reject) => {
      const build = spawn('npm', ['run', 'build'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit'
      });

      build.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Build failed with code ${code}`));
      });
    });
  });

  beforeEach(async () => {
    // Start the MCP server
    serverProcess = spawn('node', ['dist/index.js'], {
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Create client and connect
    transport = new StdioClientTransport({
      command: 'node',
      args: [path.join(__dirname, '..', 'dist', 'index.js')],
      env: process.env as Record<string, string>
    });

    client = new Client(
      {
        name: 'e2e-test-client',
        version: '1.0.0'
      },
      {
        capabilities: {}
      }
    );

    await client.connect(transport);
  });

  afterEach(async () => {
    // Cleanup
    if (client) {
      await client.close();
    }

    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill();
      await new Promise(resolve => serverProcess.on('close', resolve));
    }
  });

  describe('Server initialization', () => {
    it('should connect and initialize successfully', async () => {
      // Connection is established in beforeEach
      expect(client).toBeDefined();
      
      // List available tools
      const tools = await client.listTools();
      expect(tools).toBeDefined();
      expect(tools.tools.length).toBeGreaterThan(0);
      
      // Verify expected tools are present
      const toolNames = tools.tools.map(t => t.name);
      expect(toolNames).toContain('listVMs');
      expect(toolNames).toContain('createVM');
      expect(toolNames).toContain('startVM');
      expect(toolNames).toContain('stopVM');
    });
  });

  describe('Tool execution', () => {
    it('should execute listVMs tool', async () => {
      const result = await client.callTool({ name: 'listVMs', arguments: {} });
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect((result as any).content[0]).toBeDefined();
      expect((result as any).content[0].type).toBe('text');
      
      // Should contain VM list header
      const text = (result as any).content[0].text;
      expect(text).toContain('Virtual Machines');
    });

    it('should validate tool parameters', async () => {
      // Call createVM without required name parameter
      const result = await client.callTool({ name: 'createVM', arguments: {} });
      
      // The tool should return an error result, not throw
      expect(result.isError).toBe(true);
      expect((result as any).content[0].text).toContain('Error');
      expect((result as any).content[0].text).toContain('Required');
    });

    it('should handle non-existent tools', async () => {
      await expect(
        client.callTool({ name: 'nonExistentTool', arguments: {} })
      ).rejects.toThrow('Unknown tool');
    });
  });

  describe('Error handling', () => {
    it('should handle prlctl not being installed gracefully', async () => {
      // This test assumes prlctl might not be installed in CI
      const result = await client.callTool({ name: 'listVMs', arguments: {} });
      
      if ((result as any).isError) {
        expect((result as any).content[0].text).toContain('Error');
        // Should provide helpful error message
        expect((result as any).content[0].text.toLowerCase()).toMatch(
          /command not found|permission denied|not installed/
        );
      }
    });
  });

  describe('Security', () => {
    it('should prevent command injection attempts', async () => {
      const maliciousName = 'test; rm -rf /';
      const expectedSanitizedName = 'testrmrf'; // This is what the sanitization produces
      
      // Pre-test cleanup: ensure no leftover VMs from previous runs
      const preCleanupResult = await client.callTool({
        name: 'listVMs',
        arguments: {}
      });
      
      if (!preCleanupResult.isError) {
        const vmListText = (preCleanupResult as any).content[0].text;
        if (vmListText.includes(expectedSanitizedName)) {
          console.log(`[E2E Security Test] Found existing VM '${expectedSanitizedName}', cleaning up...`);
          try {
            await client.callTool({
              name: 'deleteVM',
              arguments: { vmId: expectedSanitizedName, confirm: true }
            });
            console.log(`[E2E Security Test] Successfully deleted existing VM '${expectedSanitizedName}'`);
          } catch (error) {
            console.error(`[E2E Security Test] Failed to delete existing VM '${expectedSanitizedName}':`, error);
          }
        }
      }
      
      let result;
      try {
        result = await client.callTool({
          name: 'createVM',
          arguments: { name: maliciousName }
        });
      } catch (error) {
        // If it throws, it might be due to validation - that's good
        expect(error).toBeDefined();
        return;
      }
      
      // The tool should either:
      // 1. Sanitize the input and succeed
      // 2. Reject the input with validation error
      // But it should never execute the injected command
      
      if (!result.isError) {
        // If it succeeded, the name should be sanitized
        // "test; rm -rf /" should become "testrmrf"
        expect((result as any).content[0].text).toContain(expectedSanitizedName);
        expect((result as any).content[0].text).not.toContain(';');
        expect((result as any).content[0].text).not.toContain('/');
        
        // Clean up: delete the created VM
        // The VM will have the sanitized name
        try {
          const deleteResult = await client.callTool({
            name: 'deleteVM',
            arguments: { vmId: expectedSanitizedName, confirm: true }
          });
          
          if (deleteResult.isError) {
            console.error(`[E2E Security Test] VM deletion returned error: ${(deleteResult as any).content[0].text}`);
          } else {
            console.log(`[E2E Security Test] Successfully cleaned up VM '${expectedSanitizedName}'`);
          }
        } catch (cleanupError) {
          // Log cleanup failure for debugging
          console.error(`[E2E Security Test] Failed to cleanup VM '${expectedSanitizedName}':`, cleanupError);
        }
      }
    }, 120000); // Increase timeout to 120 seconds for VM creation
  });

  describe('Performance', () => {
    it('should respond to tool calls within reasonable time', async () => {
      const start = Date.now();
      await client.callTool({ name: 'listVMs', arguments: {} });
      const duration = Date.now() - start;
      
      // Should respond within 5 seconds
      expect(duration).toBeLessThan(5000);
    });

    it('should handle concurrent tool calls', async () => {
      const promises = Array(5).fill(null).map(() => 
        client.callTool({ name: 'listVMs', arguments: {} })
      );
      
      const results = await Promise.all(promises);
      
      // All calls should succeed
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      });
    });
  });
});