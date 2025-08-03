import { z } from 'zod';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { sanitizeVmIdentifier } from '../prlctl-handler.js';

const createTerminalSessionSchema = z.object({
  vmId: z.string().min(1, 'vmId is required'),
  user: z.string().optional(),
});

// eslint-disable-next-line require-await
export async function handleCreateTerminalSession(request: CallToolRequest) {
  try {
    // Validate input
    const { vmId, user } = createTerminalSessionSchema.parse(request.params.arguments || {});
    const sanitizedVmId = sanitizeVmIdentifier(vmId);

    // Build command args
    const args = ['enter', sanitizedVmId];

    if (user) {
      args.push('--user', user);
    }

    // For an interactive terminal session, we need to provide instructions
    // rather than actually spawning the process (which wouldn't work in MCP context)
    const command = `prlctl ${args.join(' ')}`;

    let instructions = '## Terminal Session Instructions\n\n';
    instructions += `To open an interactive terminal session to VM '${vmId}', run the following command in your terminal:\n\n`;
    instructions += `\`\`\`bash\n${command}\n\`\`\`\n\n`;

    if (!user) {
      instructions +=
        '**Note**: This will connect as the default user. To connect as a specific user, add the `--user` parameter.\n\n';
    }

    instructions += '### Alternative SSH Connection\n\n';
    instructions +=
      'If the VM has SSH enabled and you know its IP address, you can also connect via SSH:\n\n';
    instructions += `\`\`\`bash\n# First, get the VM's IP address\nprlctl list -f --json | jq '.[] | select(.name=="${vmId}") | .ip_configured'\n\n`;
    instructions += `# Then connect via SSH\nssh ${user || 'username'}@<vm-ip-address>\n\`\`\`\n\n`;
    instructions +=
      '**Tip**: Use the `manageSshAuth` tool to set up passwordless SSH access with your public key.';

    return {
      content: [
        {
          type: 'text',
          text: instructions,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ **Error preparing terminal session**\n\nFailed to prepare terminal session for VM '${request.params.arguments?.vmId}': ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
