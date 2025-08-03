import { execFile } from 'child_process';
import { promisify } from 'util';
import { isCommandError } from './types/errors.js';

const execFileAsync = promisify(execFile);

export interface PrlctlResult {
  stdout: string;
  stderr: string;
}

export interface VmInfo {
  uuid: string;
  name: string;
  status: string;
  ipAddress?: string;
}

export interface SnapshotInfo {
  id: string;
  name: string;
  date: string;
  current?: boolean;
}

/**
 * Securely executes a prlctl command using execFile to prevent shell injection
 * @param args Array of command arguments (first element is the subcommand)
 * @returns Promise resolving to stdout and stderr output
 */
export async function executePrlctl(args: string[]): Promise<PrlctlResult> {
  try {
    const { stdout, stderr } = await execFileAsync('prlctl', args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
    });

    return { stdout: stdout || '', stderr: stderr || '' };
  } catch (error) {
    // Even on error, we might have partial stdout/stderr
    const errorMessage = isCommandError(error)
      ? `prlctl command failed: ${error.message}\n` +
        `stdout: ${error.stdout || ''}\n` +
        `stderr: ${error.stderr || ''}`
      : `prlctl command failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    
    throw new Error(errorMessage);
  }
}

/**
 * Parses the output of 'prlctl list' command
 * @param output The stdout from prlctl list
 * @returns Array of VM information
 */
export function parseVmList(output: string): VmInfo[] {
  const vms: VmInfo[] = [];
  const lines = output.trim().split('\n');

  // Skip header line if present
  const startIndex = lines[0]?.includes('UUID') ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }

    // prlctl list format: UUID STATUS IP_ADDR NAME
    // Match pattern that handles names with spaces
    const match = line.match(/^(\{[^}]+\})\s+(\S+)\s+(\S+)?\s+(.+)$/);
    if (match) {
      vms.push({
        uuid: match[1],
        status: match[2],
        ipAddress: match[3] === '-' ? undefined : match[3],
        name: match[4].trim(),
      });
    }
  }

  return vms;
}

/**
 * Parses the output of 'prlctl snapshot-list' command
 * @param output The stdout from prlctl snapshot-list
 * @returns Array of snapshot information
 */
export function parseSnapshotList(output: string): SnapshotInfo[] {
  const snapshots: SnapshotInfo[] = [];
  const lines = output.trim().split('\n');

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    // Format: {snapshot-id} *? "Snapshot Name" date
    // Handle escaped quotes in snapshot names
    const match = line.match(/^(\{[^}]+\})\s+(\*)?\s*"((?:[^"\\]|\\.)*)"\s+(.+)$/);
    if (match) {
      snapshots.push({
        id: match[1],
        current: match[2] === '*',
        name: match[3],
        date: match[4].trim(),
      });
    }
  }

  return snapshots;
}

/**
 * Sanitizes a VM name or identifier to prevent command injection
 * @param input The user-provided input
 * @returns Sanitized string safe for use in commands
 */
export function sanitizeVmIdentifier(input: string): string {
  // Remove any characters that could be interpreted as shell metacharacters
  // Allow alphanumeric, dash, underscore, and UUID braces
  return input.replace(/[^a-zA-Z0-9\-_{}]/g, '');
}

/**
 * Validates if a string is a valid UUID format used by Parallels
 * @param uuid The UUID string to validate
 * @returns true if valid UUID format
 */
export function isValidUuid(uuid: string): boolean {
  return /^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/i.test(uuid);
}
