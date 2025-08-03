import { z } from 'zod';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { executePrlctl, sanitizeVmIdentifier } from '../prlctl-handler.js';

const batchOperationSchema = z.object({
  targetVMs: z.array(z.string()).min(1, 'At least one VM must be specified'),
  operation: z.enum(['start', 'stop', 'suspend', 'resume', 'restart']),
  force: z.boolean().optional().default(false),
});

interface OperationResult {
  vmId: string;
  success: boolean;
  message: string;
}

export async function handleBatchOperation(request: CallToolRequest) {
  try {
    // Validate input
    const { targetVMs, operation, force } = batchOperationSchema.parse(
      request.params.arguments || {}
    );

    const results: OperationResult[] = [];
    const operationPromises: Promise<void>[] = [];

    // Process each VM
    for (const vmId of targetVMs) {
      const sanitizedVmId = sanitizeVmIdentifier(vmId);

      const operationPromise = (async () => {
        try {
          // Build command based on operation
          const args: string[] = [operation, sanitizedVmId];

          // Add force flag for stop operation
          if (operation === 'stop' && force) {
            args.push('--kill');
          }

          await executePrlctl(args);

          results.push({
            vmId,
            success: true,
            message: `${operation} completed successfully`,
          });
        } catch (error: any) {
          results.push({
            vmId,
            success: false,
            message: error.message,
          });
        }
      })();

      operationPromises.push(operationPromise);
    }

    // Wait for all operations to complete
    await Promise.all(operationPromises);

    // Format response
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    let responseText = '## Batch Operation Results\n\n';
    responseText += `**Operation**: ${operation}${force ? ' (forced)' : ''}\n`;
    responseText += `**Target VMs**: ${targetVMs.length}\n`;
    responseText += `**Successful**: ${successCount}\n`;
    responseText += `**Failed**: ${failureCount}\n\n`;

    responseText += '### Details:\n\n';
    results.forEach((result) => {
      const icon = result.success ? '✅' : '❌';
      responseText += `${icon} **${result.vmId}**: ${result.message}\n`;
    });

    return {
      content: [
        {
          type: 'text',
          text: responseText,
        },
      ],
      isError: failureCount === targetVMs.length, // Only error if all failed
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ **Error executing batch operation**\n\n${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
