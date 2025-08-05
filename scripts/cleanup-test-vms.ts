#!/usr/bin/env ts-node

/**
 * Manual cleanup script for test VMs
 * 
 * This script provides a user-friendly interface to clean up test VMs
 * created during development and testing of the Parallels Desktop MCP server.
 * 
 * Usage:
 *   npm run cleanup:vms              # Interactive cleanup with confirmation
 *   npm run cleanup:vms -- --dry-run # Preview what would be cleaned up
 *   npm run cleanup:vms -- --force   # Skip confirmation prompt
 *   npm run cleanup:vms -- --help    # Show usage instructions
 * 
 * Examples:
 *   # Preview cleanup without making changes
 *   npm run cleanup:vms -- --dry-run
 * 
 *   # Clean up all test VMs without confirmation
 *   npm run cleanup:vms -- --force
 * 
 *   # Interactive cleanup (default)
 *   npm run cleanup:vms
 */

import { 
  listTestVMs, 
  cleanupTestVMs, 
  DEFAULT_TEST_VM_PATTERNS,
  PROTECTED_VM_PATTERNS,
  type TestVM,
  type CleanupResult 
} from '../src/utils/test-vm-cleanup';

// Command line argument parsing
interface CliOptions {
  dryRun: boolean;
  force: boolean;
  help: boolean;
  verbose: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    force: args.includes('--force') || args.includes('-f'),
    help: args.includes('--help') || args.includes('-h'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  };
}

function showHelp(): void {
  console.log(`
🧹 Parallels Test VM Cleanup Tool

This tool helps clean up test VMs created during development and testing.
It uses patterns to identify test VMs while protecting production VMs.

USAGE:
  npm run cleanup:vms [options]

OPTIONS:
  --dry-run, -d    Preview what would be cleaned without making changes
  --force, -f      Skip confirmation prompt (use with caution!)
  --verbose, -v    Show detailed information about patterns and operations
  --help, -h       Show this help message

EXAMPLES:
  # Preview cleanup (recommended first step)
  npm run cleanup:vms -- --dry-run

  # Clean up with confirmation
  npm run cleanup:vms

  # Force cleanup without confirmation
  npm run cleanup:vms -- --force

  # Verbose dry-run to see all patterns
  npm run cleanup:vms -- --dry-run --verbose

PROTECTED PATTERNS:
  The following VM name patterns are protected from cleanup:
  - production-*
  - prod-*
  - main-*
  - primary-*
  - backup-*

For more information about VM naming conventions, see:
docs/test-vm-naming-conventions.md
`);
}

function formatVMList(vms: TestVM[]): void {
  if (vms.length === 0) return;
  
  // Group VMs by status
  const byStatus = vms.reduce((acc, vm) => {
    if (!acc[vm.status]) acc[vm.status] = [];
    acc[vm.status].push(vm);
    return acc;
  }, {} as Record<string, TestVM[]>);
  
  // Display grouped VMs
  Object.entries(byStatus).forEach(([status, statusVMs]) => {
    console.log(`\n  ${status.toUpperCase()} (${statusVMs.length}):`);
    statusVMs.forEach(vm => {
      console.log(`    - ${vm.name}`);
    });
  });
}

function displayPatterns(verbose: boolean): void {
  if (!verbose) return;
  
  console.log('\n📋 Test VM Patterns (will be cleaned):');
  DEFAULT_TEST_VM_PATTERNS.forEach(pattern => {
    console.log(`  - ${pattern.source}`);
  });
  
  console.log('\n🛡️  Protected Patterns (will NOT be cleaned):');
  PROTECTED_VM_PATTERNS.forEach(pattern => {
    console.log(`  - ${pattern.source}`);
  });
}

async function confirmCleanup(vmCount: number): Promise<boolean> {
  if (process.env.CI) return true; // Always proceed in CI
  
  console.log('\n⚠️  WARNING: These VMs will be permanently deleted!');
  console.log('⏱️  You have 10 seconds to cancel (Ctrl+C)...\n');
  
  // Countdown
  for (let i = 10; i > 0; i--) {
    process.stdout.write(`\r  ${i} seconds remaining...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\r  Proceeding with cleanup...    \n');
  return true;
}

function displaySummary(result: CleanupResult, isDryRun: boolean): void {
  console.log('\n\n📊 Cleanup Summary');
  console.log('==================');
  
  if (isDryRun) {
    console.log(`\n🔍 DRY RUN RESULTS:`);
    console.log(`  Found: ${result.found.length} test VM(s)`);
    if (result.found.length > 0) {
      console.log('\n  VMs that would be deleted:');
      result.found.forEach(vm => console.log(`    - ${vm}`));
    }
  } else {
    console.log(`\n✅ CLEANUP RESULTS:`);
    console.log(`  Found: ${result.found.length}`);
    console.log(`  Cleaned: ${result.cleaned.length}`);
    console.log(`  Failed: ${result.failed.length}`);
    
    if (result.cleaned.length > 0) {
      console.log('\n  Successfully cleaned:');
      result.cleaned.forEach(vm => console.log(`    - ${vm}`));
    }
    
    if (result.failed.length > 0) {
      console.log('\n  ❌ Failed to clean:');
      Object.entries(result.errors).forEach(([vm, error]) => {
        console.log(`    - ${vm}: ${error}`);
      });
    }
  }
}

async function runCleanup(): Promise<void> {
  const options = parseArgs();
  
  // Show help if requested
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  console.log('🧹 Parallels Test VM Cleanup Tool');
  console.log('=================================\n');
  
  try {
    // Display patterns if verbose
    displayPatterns(options.verbose);
    
    // List test VMs first
    console.log('📋 Scanning for test VMs...');
    const testVMs = await listTestVMs();
    
    if (testVMs.length === 0) {
      console.log('\n✅ No test VMs found. Environment is clean!');
      return;
    }
    
    // Display found VMs
    console.log(`\n🎯 Found ${testVMs.length} test VM(s):`);
    formatVMList(testVMs);
    
    // Handle dry-run
    if (options.dryRun) {
      console.log('\n📌 Running in DRY-RUN mode - no changes will be made');
    }
    
    // Confirm cleanup if not forced
    if (!options.dryRun && !options.force) {
      const confirmed = await confirmCleanup(testVMs.length);
      if (!confirmed) {
        console.log('\n❌ Cleanup cancelled by user');
        process.exit(1);
      }
    }
    
    // Perform cleanup
    console.log('\n🧹 Starting cleanup process...');
    const result = await cleanupTestVMs({
      dryRun: options.dryRun,
      force: true, // Always use force for manual cleanup to handle stopped VMs
      logPrefix: options.verbose ? '[Cleanup]' : '',
    });
    
    // Display summary
    displaySummary(result, options.dryRun);
    
    // Exit with appropriate code
    if (!options.dryRun && result.failed.length > 0) {
      console.log('\n⚠️  Cleanup completed with errors');
      process.exit(1);
    } else {
      console.log('\n✨ Cleanup completed successfully!');
    }
    
  } catch (error: any) {
    console.error('\n❌ Error during cleanup:', error.message);
    if (options.verbose && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runCleanup().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default runCleanup;