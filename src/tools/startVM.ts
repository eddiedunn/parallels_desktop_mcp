import { z } from 'zod';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { executePrlctl, sanitizeVmIdentifier } from '../prlctl-handler.js';

const startVmSchema = z.object({
  vmId: z.string().min(1, 'vmId is required'),
});

export async function handleStartVM(request: CallToolRequest) {
  try {
    // Validate input
    const { vmId } = startVmSchema.parse(request.params.arguments || {});
    const sanitizedVmId = sanitizeVmIdentifier(vmId);

    // Execute prlctl start command
    const { stdout } = await executePrlctl(['start', sanitizedVmId]);

    return {
      content: [
        {
          type: 'text',
          text: `✅ **Success**\n\nVM '${vmId}' started successfully.\n\n**Output:**\n\`\`\`\n${stdout}\n\`\`\``,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ **Error starting VM**\n\nFailed to start VM '${request.params.arguments?.vmId}': ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
