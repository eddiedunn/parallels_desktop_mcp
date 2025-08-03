import { z } from 'zod';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { executePrlctl, sanitizeVmIdentifier, isValidUuid } from '../prlctl-handler.js';

const restoreSnapshotSchema = z.object({
  vmId: z.string().min(1, 'vmId is required'),
  snapshotId: z.string().min(1, 'snapshotId is required'),
});

export async function handleRestoreSnapshot(request: CallToolRequest) {
  try {
    // Validate input
    const { vmId, snapshotId } = restoreSnapshotSchema.parse(request.params.arguments || {});
    const sanitizedVmId = sanitizeVmIdentifier(vmId);

    // For snapshot ID, we need to handle both UUID format and name
    let snapshotIdentifier: string;
    if (isValidUuid(snapshotId)) {
      snapshotIdentifier = snapshotId; // Already a valid UUID
    } else {
      snapshotIdentifier = sanitizeVmIdentifier(snapshotId);
    }

    // Execute prlctl snapshot-switch command
    const { stdout } = await executePrlctl([
      'snapshot-switch',
      sanitizedVmId,
      '--id',
      snapshotIdentifier,
    ]);

    return {
      content: [
        {
          type: 'text',
          text: `✅ **Success**\n\nVM '${vmId}' has been restored to snapshot '${snapshotId}'.\n\n**Note**: The VM state has been reverted to the snapshot point. Any changes made after the snapshot was taken have been discarded.\n\n**Output:**\n\`\`\`\n${stdout}\n\`\`\``,
        },
      ],
    };
  } catch (error: any) {
    // Check if it's a snapshot not found error
    if (error.message.includes('snapshot') && error.message.includes('not found')) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Snapshot not found**\n\nThe specified snapshot '${request.params.arguments?.snapshotId}' was not found for VM '${request.params.arguments?.vmId}'.\n\nUse the 'listSnapshots' tool to see available snapshots for this VM.`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `❌ **Error restoring snapshot**\n\nFailed to restore snapshot for VM '${request.params.arguments?.vmId}': ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
