import { z } from 'zod';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { executePrlctl, parseVmList } from '../prlctl-handler.js';
import { getErrorMessage } from '../types/errors.js';

// Schema for listVMs - no parameters needed
const listVmsSchema = z.object({});

export async function handleListVMs(request: CallToolRequest) {
  try {
    // Validate input (empty object expected)
    listVmsSchema.parse(request.params.arguments || {});

    // Execute prlctl list command
    const { stdout } = await executePrlctl(['list', '--all']);

    // Parse the VM list
    const vms = parseVmList(stdout);

    // Format the response
    let responseText = '## Virtual Machines\n\n';

    if (vms.length === 0) {
      responseText += 'No virtual machines found.\n';
    } else {
      responseText += `Found ${vms.length} virtual machine(s):\n\n`;
      vms.forEach((vm, index) => {
        responseText += `### ${index + 1}. ${vm.name}\n`;
        responseText += `- **UUID**: ${vm.uuid}\n`;
        responseText += `- **Status**: ${vm.status}\n`;
        if (vm.ipAddress) {
          responseText += `- **IP Address**: ${vm.ipAddress}\n`;
        }
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
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ **Error listing VMs**\n\n${getErrorMessage(error)}`,
        },
      ],
      isError: true,
    };
  }
}
