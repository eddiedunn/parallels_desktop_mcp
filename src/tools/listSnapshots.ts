import { z } from 'zod';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { executePrlctl, parseSnapshotList, sanitizeVmIdentifier } from '../prlctl-handler.js';

const listSnapshotsSchema = z.object({
  vmId: z.string().min(1, 'vmId is required'),
});

export async function handleListSnapshots(request: CallToolRequest) {
  try {
    // Validate input
    const { vmId } = listSnapshotsSchema.parse(request.params.arguments || {});
    const sanitizedVmId = sanitizeVmIdentifier(vmId);

    // Execute prlctl snapshot-list command
    const { stdout } = await executePrlctl(['snapshot-list', sanitizedVmId]);

    // Parse the snapshot list
    const snapshots = parseSnapshotList(stdout);

    // Format the response
    let responseText = `## Snapshots for VM '${vmId}'\n\n`;

    if (snapshots.length === 0) {
      responseText += 'No snapshots found for this VM.\n';
    } else {
      responseText += `Found ${snapshots.length} snapshot(s):\n\n`;
      snapshots.forEach((snapshot, index) => {
        responseText += `### ${index + 1}. ${snapshot.name}`;
        if (snapshot.current) {
          responseText += ' ⭐ (Current)';
        }
        responseText += '\n';
        responseText += `- **ID**: ${snapshot.id}\n`;
        responseText += `- **Date**: ${snapshot.date}\n`;
        responseText += '\n';
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: responseText,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ **Error listing snapshots**\n\nFailed to list snapshots for VM '${request.params.arguments?.vmId}': ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
