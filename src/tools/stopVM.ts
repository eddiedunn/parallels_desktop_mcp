import { z } from 'zod';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { executePrlctl, sanitizeVmIdentifier } from '../prlctl-handler.js';

const stopVmSchema = z.object({
  vmId: z.string().min(1, 'vmId is required'),
  force: z.boolean().optional().default(false),
});

export async function handleStopVM(request: CallToolRequest) {
  try {
    // Validate input
    const { vmId, force } = stopVmSchema.parse(request.params.arguments || {});
    const sanitizedVmId = sanitizeVmIdentifier(vmId);

    // Build command args
    const args = ['stop', sanitizedVmId];
    if (force) {
      args.push('--kill');
    }

    // Execute prlctl stop command
    const { stdout } = await executePrlctl(args);

    const actionType = force ? 'forcefully stopped' : 'stopped';
    return {
      content: [
        {
          type: 'text',
          text: `✅ **Success**\n\nVM '${vmId}' ${actionType} successfully.\n\n**Output:**\n\`\`\`\n${stdout}\n\`\`\``,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ **Error stopping VM**\n\nFailed to stop VM '${request.params.arguments?.vmId}': ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
