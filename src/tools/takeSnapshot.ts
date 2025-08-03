import { z } from 'zod';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { executePrlctl, sanitizeVmIdentifier } from '../prlctl-handler.js';

const takeSnapshotSchema = z.object({
  vmId: z.string().min(1, 'vmId is required'),
  name: z.string().min(1).max(100, 'Snapshot name must be between 1 and 100 characters'),
  description: z.string().optional(),
});

export async function handleTakeSnapshot(request: CallToolRequest) {
  try {
    // Validate input
    const { vmId, name, description } = takeSnapshotSchema.parse(request.params.arguments || {});
    const sanitizedVmId = sanitizeVmIdentifier(vmId);

    // Build command args
    const args = ['snapshot', sanitizedVmId, '--name', name];

    if (description) {
      args.push('--description', description);
    }

    // Execute prlctl snapshot command
    const { stdout } = await executePrlctl(args);

    let responseText = `✅ **Success**\n\nSnapshot '${name}' created successfully for VM '${vmId}'.`;
    if (description) {
      responseText += `\n\n**Description**: ${description}`;
    }
    responseText += `\n\n**Output:**\n\`\`\`\n${stdout}\n\`\`\``;

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
          text: `❌ **Error creating snapshot**\n\nFailed to create snapshot for VM '${request.params.arguments?.vmId}': ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
