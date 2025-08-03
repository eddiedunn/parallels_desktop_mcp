import { z } from 'zod';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { executePrlctl, sanitizeVmIdentifier } from '../prlctl-handler.js';

const deleteVmSchema = z.object({
  vmId: z.string().min(1, 'vmId is required'),
  confirm: z.boolean().optional().default(false),
});

export async function handleDeleteVM(request: CallToolRequest) {
  try {
    // Validate input
    const { vmId, confirm } = deleteVmSchema.parse(request.params.arguments || {});

    // Require explicit confirmation to prevent accidental deletions
    if (!confirm) {
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ **Confirmation Required**\n\nTo delete VM '${vmId}', please set the 'confirm' parameter to true.\n\n**Warning**: This action is irreversible and will permanently delete the VM and all its data.`,
          },
        ],
      };
    }

    const sanitizedVmId = sanitizeVmIdentifier(vmId);

    // Execute prlctl delete command
    const { stdout } = await executePrlctl(['delete', sanitizedVmId]);

    return {
      content: [
        {
          type: 'text',
          text: `✅ **Success**\n\nVM '${vmId}' has been permanently deleted.\n\n**Output:**\n\`\`\`\n${stdout}\n\`\`\``,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ **Error deleting VM**\n\nFailed to delete VM '${request.params.arguments?.vmId}': ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
