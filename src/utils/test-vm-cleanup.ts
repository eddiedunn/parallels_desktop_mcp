/**
 * Centralized test VM cleanup utilities
 * 
 * This module provides consistent VM cleanup functionality across:
 * - Unit tests
 * - Integration tests  
 * - E2E tests
 * - Manual cleanup scripts
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface TestVM {
  uuid: string;
  status: string;
  name: string;
}

export interface CleanupOptions {
  dryRun?: boolean;
  force?: boolean;
  patterns?: RegExp[];
  excludePatterns?: RegExp[];
  logPrefix?: string;
}

export interface CleanupResult {
  found: string[];
  cleaned: string[];
  failed: string[];
  errors: Record<string, string>;
}

/**
 * Default test VM patterns that should be cleaned up
 */
export const DEFAULT_TEST_VM_PATTERNS: RegExp[] = [
  // General test patterns
  /^test-/i,
  /^jest-/i,
  /^temp-/i,
  /^tmp-/i,
  
  // Security test patterns (sanitized names)
  /^testrm-rf$/i,     // With hyphen (actual sanitized version)
  /^testrmrf$/i,      // Without hyphen (alternative pattern)
  
  // Test type specific patterns
  /^unit-test-/i,
  /^integration-test-/i,
  /^e2e-test-/i,
  /^test-e2e-/i,
  /^mcp-e2e-/i,
  
  // Numbered test patterns
  /^concurrent-\d+$/,
  /^test-vm-\d+$/,
  /^test-\d+$/,
  
  // Feature test patterns
  /^snapshot-test/,
  /-test-vm$/,
  
  // CI/CD patterns
  /^ci-vm$/,
  /^ci-test-/i,
  /^github-actions-/i,
];

/**
 * Patterns that should never be cleaned up (production VMs)
 */
export const PROTECTED_VM_PATTERNS: RegExp[] = [
  /^production-/i,
  /^prod-/i,
  /^main-/i,
  /^primary-/i,
  /^backup-/i,
];

/**
 * Parse VM list output from prlctl
 */
export function parseVMList(output: string): TestVM[] {
  const lines = output.trim().split('\n');
  const vms: TestVM[] = [];
  
  // Skip header line if present
  const startIndex = lines[0]?.includes('UUID') ? 1 : 0;
  
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse VM info using regex to handle names with spaces
    // Format: {UUID} STATUS IP_ADDR NAME
    const match = line.match(/^(\{[^}]+\})\s+(\S+)\s+(\S+)?\s+(.+)$/);
    if (match) {
      vms.push({
        uuid: match[1],
        status: match[2],
        name: match[4].trim(),
      });
    }
  }
  
  return vms;
}

/**
 * Check if a VM name matches test patterns
 */
export function isTestVM(
  vmName: string, 
  patterns: RegExp[] = DEFAULT_TEST_VM_PATTERNS,
  excludePatterns: RegExp[] = PROTECTED_VM_PATTERNS
): boolean {
  // First check if it's protected
  if (excludePatterns.some(pattern => pattern.test(vmName))) {
    return false;
  }
  
  // Then check if it matches test patterns
  return patterns.some(pattern => pattern.test(vmName));
}

/**
 * List all test VMs
 */
export async function listTestVMs(options: CleanupOptions = {}): Promise<TestVM[]> {
  const { patterns = DEFAULT_TEST_VM_PATTERNS, excludePatterns = PROTECTED_VM_PATTERNS } = options;
  
  try {
    const { stdout } = await execFileAsync('prlctl', ['list', '--all']);
    const allVMs = parseVMList(stdout);
    
    return allVMs.filter(vm => isTestVM(vm.name, patterns, excludePatterns));
  } catch (error: any) {
    throw new Error(`Failed to list VMs: ${error.message}`);
  }
}

/**
 * Clean up a single VM
 */
export async function cleanupVM(
  vmName: string, 
  options: CleanupOptions = {}
): Promise<void> {
  const { dryRun = false, force = false, logPrefix = '[Cleanup]' } = options;
  
  if (dryRun) {
    console.log(`${logPrefix} [DRY RUN] Would delete VM: ${vmName}`);
    return;
  }
  
  // Stop the VM first if it's running
  try {
    await execFileAsync('prlctl', ['stop', vmName, '--kill']);
    console.log(`${logPrefix} Stopped VM: ${vmName}`);
  } catch (error: any) {
    // VM might already be stopped
    if (!error.message.includes('is not started')) {
      if (!force) {
        throw new Error(`Failed to stop VM ${vmName}: ${error.message}`);
      }
      console.warn(`${logPrefix} Warning: Failed to stop VM ${vmName}: ${error.message}`);
    }
  }
  
  // Delete the VM
  try {
    await execFileAsync('prlctl', ['delete', vmName]);
    console.log(`${logPrefix} Deleted VM: ${vmName}`);
  } catch (error: any) {
    throw new Error(`Failed to delete VM ${vmName}: ${error.message}`);
  }
}

/**
 * Clean up all test VMs
 */
export async function cleanupTestVMs(options: CleanupOptions = {}): Promise<CleanupResult> {
  const { 
    dryRun = false, 
    force = false, 
    logPrefix = '[Cleanup]',
    patterns = DEFAULT_TEST_VM_PATTERNS,
    excludePatterns = PROTECTED_VM_PATTERNS
  } = options;
  
  const result: CleanupResult = {
    found: [],
    cleaned: [],
    failed: [],
    errors: {},
  };
  
  try {
    // List all test VMs
    const testVMs = await listTestVMs({ patterns, excludePatterns });
    result.found = testVMs.map(vm => vm.name);
    
    if (testVMs.length === 0) {
      console.log(`${logPrefix} No test VMs found.`);
      return result;
    }
    
    console.log(`${logPrefix} Found ${testVMs.length} test VM(s) to clean up: ${result.found.join(', ')}`);
    
    // Clean up each VM
    for (const vm of testVMs) {
      try {
        await cleanupVM(vm.name, { dryRun, force, logPrefix });
        if (!dryRun) {
          result.cleaned.push(vm.name);
        }
      } catch (error: any) {
        result.failed.push(vm.name);
        result.errors[vm.name] = error.message;
        console.error(`${logPrefix} Failed to cleanup VM ${vm.name}: ${error.message}`);
        
        if (!force) {
          throw error;
        }
      }
    }
    
    // Log summary
    if (!dryRun && result.cleaned.length > 0) {
      console.log(`${logPrefix} Successfully cleaned up ${result.cleaned.length} VM(s).`);
    }
    
    if (result.failed.length > 0) {
      console.warn(`${logPrefix} Failed to clean up ${result.failed.length} VM(s).`);
    }
    
  } catch (error: any) {
    console.error(`${logPrefix} Cleanup failed: ${error.message}`);
    throw error;
  }
  
  return result;
}

/**
 * Create a cleanup handler for use in test hooks
 */
export function createTestCleanupHandler(options: CleanupOptions = {}) {
  return async () => {
    try {
      await cleanupTestVMs(options);
    } catch (error: any) {
      // In test cleanup, we don't want to fail the tests due to cleanup errors
      console.error(`Test cleanup failed: ${error.message}`);
    }
  };
}

/**
 * Register cleanup handlers for process exit
 */
export function registerProcessCleanup(options: CleanupOptions = {}) {
  const cleanup = async (signal: string) => {
    console.log(`\n${options.logPrefix || '[Cleanup]'} Process ${signal} - cleaning up test VMs...`);
    try {
      await cleanupTestVMs({ ...options, force: true });
    } catch (error: any) {
      console.error(`Cleanup on ${signal} failed:`, error.message);
    }
  };
  
  // Handle various exit signals
  process.on('SIGINT', () => cleanup('SIGINT'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));
  process.on('SIGUSR1', () => cleanup('SIGUSR1'));
  process.on('SIGUSR2', () => cleanup('SIGUSR2'));
}