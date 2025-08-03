import { z } from 'zod';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { executePrlctl, sanitizeVmIdentifier } from '../prlctl-handler.js';

const createVmSchema = z.object({
  name: z.string().min(1).max(100, 'VM name must be between 1 and 100 characters'),
  fromTemplate: z.string().optional(),
  os: z.enum(['ubuntu', 'debian', 'windows-11', 'macos', 'other']).optional(),
  distribution: z.string().optional(),
  memory: z.number().min(512).max(32768).optional(), // MB
  cpus: z.number().min(1).max(16).optional(),
  diskSize: z.number().min(8).max(2048).optional(), // GB
});

export async function handleCreateVM(request: CallToolRequest) {
  try {
    // Validate input
    const params = createVmSchema.parse(request.params.arguments || {});
    const sanitizedName = sanitizeVmIdentifier(params.name);

    let args: string[] = [];
    let commandDescription = '';

    if (params.fromTemplate) {
      // Clone from existing VM/template
      const sanitizedTemplate = sanitizeVmIdentifier(params.fromTemplate);
      args = ['clone', sanitizedTemplate, '--name', sanitizedName];
      commandDescription = `Cloning VM from template '${params.fromTemplate}' as '${params.name}'`;
    } else {
      // Create new VM from scratch
      args = ['create', sanitizedName];

      // Add OS type if specified
      if (params.os) {
        args.push('--ostype', params.os);
      }

      // Add distribution if specified
      if (params.distribution) {
        args.push('--distribution', params.distribution);
      }

      commandDescription = `Creating new VM '${params.name}'`;
      if (params.os) {
        commandDescription += ` with OS type '${params.os}'`;
      }
    }

    // Execute the create/clone command
    const { stdout } = await executePrlctl(args);

    // If we created from scratch and have hardware specs, configure them
    if (!params.fromTemplate && (params.memory || params.cpus || params.diskSize)) {
      const configResults: string[] = [];

      if (params.memory) {
        await executePrlctl(['set', sanitizedName, '--memsize', params.memory.toString()]);
        configResults.push(`Memory: ${params.memory}MB`);
      }

      if (params.cpus) {
        await executePrlctl(['set', sanitizedName, '--cpus', params.cpus.toString()]);
        configResults.push(`CPUs: ${params.cpus}`);
      }

      if (params.diskSize) {
        await executePrlctl([
          'set',
          sanitizedName,
          '--device-set',
          'hdd0',
          '--size',
          `${params.diskSize}G`,
        ]);
        configResults.push(`Disk: ${params.diskSize}GB`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ **Success**\n\n${commandDescription}\n\n**VM Created:**\n- Name: ${params.name}\n${configResults.map((r) => `- ${r}`).join('\n')}\n\n**Output:**\n\`\`\`\n${stdout}\n\`\`\``,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `✅ **Success**\n\n${commandDescription}\n\n**Output:**\n\`\`\`\n${stdout}\n\`\`\``,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ **Error creating VM**\n\nFailed to create VM '${request.params.arguments?.name}': ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
