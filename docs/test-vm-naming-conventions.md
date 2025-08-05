# Test VM Naming Conventions

This document provides comprehensive guidelines for naming test VMs in the Parallels Desktop MCP server project. Following these conventions ensures proper cleanup, prevents conflicts, and maintains a clean testing environment.

## Table of Contents
- [Overview](#overview)
- [General Principles](#general-principles)
- [Naming Patterns by Test Type](#naming-patterns-by-test-type)
- [Sanitization Process](#sanitization-process)
- [Protected Patterns](#protected-patterns)
- [Cleanup System](#cleanup-system)
- [Best Practices](#best-practices)
- [Implementation Examples](#implementation-examples)
- [Troubleshooting](#troubleshooting)

## Overview

The VM naming convention system serves three critical purposes:
1. **Automatic cleanup** - Test VMs are identified and cleaned up based on patterns
2. **Conflict prevention** - Unique names prevent parallel test interference
3. **Debugging support** - Clear names help identify VMs during troubleshooting

## General Principles

1. **Test prefix requirement** - All test VMs MUST start with a recognized test prefix
2. **Descriptive naming** - Names should clearly indicate test type and purpose
3. **Character restrictions** - Avoid special characters that undergo sanitization
4. **Length limits** - Keep names under 50 characters for compatibility
5. **Uniqueness** - Include random suffixes to prevent naming conflicts

## Naming Patterns by Test Type

### Unit Tests
```
Pattern: unit-test-{feature}-{random}
Example: unit-test-createvm-a3f2b1
Purpose: VMs created during unit test execution
```

### Integration Tests
```
Pattern: integration-test-{scenario}-{random}
Example: integration-test-lifecycle-7b9e4c
Purpose: VMs for integration testing workflows
```

### End-to-End (E2E) Tests
```
Pattern: e2e-test-{feature}-{random}
Example: e2e-test-security-c4d1a8
Purpose: VMs for full system testing
```

### MCP-Specific E2E Tests
```
Pattern: mcp-e2e-{test-name}-{random}
Example: mcp-e2e-server-init-5f3a2b
Purpose: MCP server integration tests
```

### Special Test Categories

#### Security Tests
```
Pattern: e2e-test-security-{type}
Example: e2e-test-security-injection
Note: Avoid embedding commands in names (e.g., "test; rm -rf /")
```

#### Concurrent/Parallel Tests
```
Pattern: concurrent-{number}
Example: concurrent-1, concurrent-2, concurrent-3
Purpose: Tests running in parallel execution
```

#### Snapshot Tests
```
Pattern: snapshot-test-{feature}
Example: snapshot-test-restore-workflow
Purpose: Testing snapshot functionality
```

#### Temporary Test VMs
```
Pattern: temp-{purpose}-{random}
Example: temp-validation-8a3f2c
Purpose: Short-lived test VMs
```

#### CI/CD Test VMs
```
Pattern: ci-test-{job}-{random}
Example: ci-test-github-actions-9b2f
Purpose: Continuous integration testing
```

## Sanitization Process

The system sanitizes VM names to ensure compatibility with Parallels Desktop:

### Sanitization Rules
1. **Special characters** are removed or replaced with hyphens
2. **Spaces** are replaced with hyphens
3. **Consecutive hyphens** are collapsed to single hyphens
4. **Leading/trailing hyphens** are removed
5. **Case** is preserved but patterns are case-insensitive

### Sanitization Examples
```
Input:  "test; rm -rf /"     → Output: "test-rm-rf"
Input:  "test@#$vm"          → Output: "test-vm"
Input:  "test   vm"          → Output: "test-vm"
Input:  "test---vm"          → Output: "test-vm"
```

### Important Security Note
The sanitization of "test; rm -rf /" to "test-rm-rf" (or "testrmrf") is specifically handled in cleanup patterns to ensure these VMs are properly identified and removed.

## Protected Patterns

The following VM name patterns are NEVER deleted by the cleanup system:

```regex
/^production-/i    # Production VMs
/^prod-/i         # Production shorthand
/^main-/i         # Main/primary VMs
/^primary-/i      # Primary instances
/^backup-/i       # Backup VMs
```

**Safety guarantee**: Any VM matching these patterns is protected from accidental deletion, even if manually specified in cleanup operations.

## Cleanup System

### Default Test VM Patterns

The cleanup utility (`src/utils/test-vm-cleanup.ts`) recognizes these patterns:

```typescript
// General test patterns
/^test-/i          # Generic test VMs
/^jest-/i          # Jest framework VMs
/^temp-/i          # Temporary VMs
/^tmp-/i           # Alternative temporary

// Security test patterns (post-sanitization)
/^testrm-rf$/i     # Sanitized "test; rm -rf /"
/^testrmrf$/i      # Alternative sanitization

// Test type specific
/^unit-test-/i     # Unit tests
/^integration-test-/i  # Integration tests
/^e2e-test-/i      # E2E tests
/^test-e2e-/i      # Alternative E2E
/^mcp-e2e-/i       # MCP-specific E2E

// Numbered patterns
/^concurrent-\d+$/ # Concurrent tests
/^test-vm-\d+$/    # Numbered test VMs
/^test-\d+$/       # Simple numbered

// Feature patterns
/^snapshot-test/   # Snapshot tests
/-test-vm$/        # Suffix pattern

// CI/CD patterns
/^ci-vm$/          # CI VMs
/^ci-test-/i       # CI test VMs
/^github-actions-/i # GitHub Actions
```

### Cleanup Commands

```bash
# Show help and usage instructions
npm run cleanup:vms:help

# Preview cleanup (dry-run) - RECOMMENDED FIRST
npm run cleanup:vms:dry-run

# Interactive cleanup with confirmation
npm run cleanup:vms

# Force cleanup without confirmation
npm run cleanup:vms:force

# Verbose output showing all patterns
npm run cleanup:vms -- --dry-run --verbose
```

## Best Practices

### 1. Naming Strategy
```typescript
// GOOD: Clear prefix, feature, and unique suffix
const vmName = `e2e-test-auth-${Date.now()}`;
const vmName = `unit-test-createvm-${crypto.randomUUID().slice(0, 8)}`;

// BAD: No test prefix
const vmName = `myvm-123`;

// BAD: Ambiguous naming
const vmName = `test`;
```

### 2. Uniqueness Generation
```typescript
// Timestamp-based (good for debugging)
const suffix = Date.now();

// Random string (good for parallel tests)
const suffix = Math.random().toString(36).substring(2, 9);

// UUID-based (maximum uniqueness)
const suffix = crypto.randomUUID().slice(0, 8);
```

### 3. Test Lifecycle Management
```typescript
// Always clean up in afterEach/afterAll
afterEach(async () => {
  if (testVMName) {
    await cleanup(testVMName);
  }
});

// Use try-finally for guaranteed cleanup
try {
  const vmName = `test-feature-${Date.now()}`;
  await createVM(vmName);
  // ... test logic
} finally {
  await cleanup(vmName);
}
```

### 4. Parallel Test Considerations
```typescript
// Include worker ID for parallel tests
const workerId = process.env.JEST_WORKER_ID || '0';
const vmName = `test-parallel-${workerId}-${Date.now()}`;
```

## Implementation Examples

### Unit Test Example
```typescript
describe('VM Creation', () => {
  let vmName: string;
  
  beforeEach(() => {
    // Generate unique name for each test
    vmName = `unit-test-creation-${Date.now()}`;
  });
  
  afterEach(async () => {
    // Clean up after each test
    if (vmName) {
      await deleteVM(vmName);
    }
  });
  
  it('should create VM with custom settings', async () => {
    const result = await createVM({ name: vmName, /* ... */ });
    expect(result).toBeDefined();
  });
});
```

### Integration Test Example
```typescript
describe('VM Lifecycle Integration', () => {
  const testId = crypto.randomUUID().slice(0, 8);
  const baseVMName = `integration-test-lifecycle-${testId}`;
  
  // Use consistent naming for related VMs
  const vms = {
    main: `${baseVMName}-main`,
    clone: `${baseVMName}-clone`,
    snapshot: `${baseVMName}-snapshot`
  };
  
  afterAll(async () => {
    // Clean up all related VMs
    await Promise.all(
      Object.values(vms).map(name => deleteVM(name).catch(() => {}))
    );
  });
});
```

### E2E Test Example
```typescript
describe('E2E Security Tests', () => {
  it('should handle malicious VM names safely', async () => {
    // This name will be sanitized to "e2e-test-security-rm-rf"
    const maliciousName = 'e2e-test-security; rm -rf /';
    const sanitizedName = 'e2e-test-security-rm-rf';
    
    const result = await createVM({ name: maliciousName });
    expect(result.name).toBe(sanitizedName);
    
    // Cleanup will find it by the sanitized pattern
    await cleanup();
  });
});
```

## Troubleshooting

### Common Issues and Solutions

#### 1. VMs Not Being Cleaned Up
**Problem**: Test VMs persist after test runs
**Solution**: Ensure VM names match cleanup patterns
```bash
# Check what VMs would be cleaned
npm run cleanup:vms -- --dry-run --verbose
```

#### 2. Production VMs at Risk
**Problem**: Worried about accidental deletion
**Solution**: Protected patterns prevent this
```typescript
// These are ALWAYS safe:
'production-web-server'  // Protected by /^production-/i
'prod-database'         // Protected by /^prod-/i
'main-app-vm'          // Protected by /^main-/i
```

#### 3. Cleanup Pattern Debugging
**Problem**: Need to verify pattern matching
**Solution**: Use verbose mode to see all patterns
```bash
# Shows all patterns being used
npm run cleanup:vms -- --dry-run --verbose
```

#### 4. Manual Cleanup Required
**Problem**: Automated cleanup missed some VMs
**Solution**: Use the cleanup script with custom patterns
```typescript
// In test cleanup code
import { cleanupTestVMs } from '../src/utils/test-vm-cleanup';

await cleanupTestVMs({
  patterns: [
    /^my-custom-test-/i,
    // ... additional patterns
  ]
});
```

## Summary

Following these naming conventions ensures:
- ✅ Automatic cleanup of test VMs
- ✅ Protection of production VMs
- ✅ Clear identification during debugging
- ✅ Prevention of naming conflicts
- ✅ Consistent test environment

For questions or to propose changes to these conventions, please refer to the [contributing guidelines](./CONTRIBUTING.md) or open an issue in the project repository.