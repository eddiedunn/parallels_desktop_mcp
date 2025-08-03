import { z } from 'zod';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { executePrlctl, sanitizeVmIdentifier } from '../prlctl-handler.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

const manageSshAuthSchema = z.object({
  vmId: z.string().min(1, 'vmId is required'),
  username: z.string().min(1, 'username is required'),
  publicKeyPath: z.string().optional(),
  enablePasswordlessSudo: z.boolean().optional().default(false),
});

export async function handleManageSshAuth(request: CallToolRequest) {
  try {
    // Validate input
    const { vmId, username, publicKeyPath, enablePasswordlessSudo } = manageSshAuthSchema.parse(
      request.params.arguments || {}
    );
    const sanitizedVmId = sanitizeVmIdentifier(vmId);

    // Determine public key path
    let keyPath: string = '';
    if (publicKeyPath) {
      keyPath = publicKeyPath;
    } else {
      // Try common public key locations
      const homeDir = os.homedir();
      const commonKeyPaths = [
        path.join(homeDir, '.ssh', 'id_rsa.pub'),
        path.join(homeDir, '.ssh', 'id_ed25519.pub'),
        path.join(homeDir, '.ssh', 'id_ecdsa.pub'),
      ];

      // Find the first existing key
      let foundKey = false;
      for (const possiblePath of commonKeyPaths) {
        try {
          await fs.access(possiblePath);
          keyPath = possiblePath;
          foundKey = true;
          break;
        } catch {
          // Continue to next key
        }
      }

      if (!foundKey) {
        throw new Error(
          'No SSH public key found. Please specify publicKeyPath or generate a key with ssh-keygen.'
        );
      }
    }

    // Read the public key
    const publicKey = await fs.readFile(keyPath, 'utf8');
    const trimmedKey = publicKey.trim();

    // Prepare the commands to run inside the VM
    const commands: string[] = [];

    // Ensure SSH host keys are generated
    commands.push('# Ensure SSH host keys are generated');
    commands.push('sudo ssh-keygen -A 2>/dev/null || true');

    // Ensure SSH service is enabled and started
    commands.push('# Ensure SSH service is running');
    commands.push(
      'sudo systemctl enable ssh 2>/dev/null || sudo systemctl enable sshd 2>/dev/null || true'
    );
    commands.push(
      'sudo systemctl start ssh 2>/dev/null || sudo systemctl start sshd 2>/dev/null || true'
    );

    // Create .ssh directory and set permissions
    commands.push(`# Setup SSH directory for user ${username}`);
    commands.push(`sudo -u ${username} mkdir -p /home/${username}/.ssh`);
    commands.push(`sudo chmod 700 /home/${username}/.ssh`);

    // Add the public key to authorized_keys
    commands.push('# Add public key to authorized_keys');
    commands.push(`echo '${trimmedKey}' | sudo tee -a /home/${username}/.ssh/authorized_keys`);
    commands.push(`sudo chown ${username}:${username} /home/${username}/.ssh/authorized_keys`);
    commands.push(`sudo chmod 600 /home/${username}/.ssh/authorized_keys`);

    // Configure passwordless sudo if requested
    if (enablePasswordlessSudo) {
      commands.push('# Enable passwordless sudo');
      commands.push(
        `echo '${username} ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/${username}`
      );
      commands.push(`sudo chmod 440 /etc/sudoers.d/${username}`);
    }

    // Get VM IP for connection instructions
    commands.push('# Get VM IP address');
    commands.push(
      'ip -4 addr show | grep -oP "(?<=inet )[\\d.]+(?=/)" | grep -v "127.0.0.1" | head -1'
    );

    // Execute the commands
    const fullCommand = commands.join(' && ');
    const { stdout } = await executePrlctl(['exec', sanitizedVmId, fullCommand]);

    // Try to extract IP from output
    const ipMatch = stdout.match(/(\d+\.\d+\.\d+\.\d+)/);
    const vmIp = ipMatch ? ipMatch[1] : 'VM_IP_ADDRESS';

    let responseText = `✅ **Success**\n\nSSH authentication configured for user '${username}' on VM '${vmId}'.\n\n`;
    responseText += '**Configuration applied:**\n';
    responseText += '- SSH host keys generated/verified\n';
    responseText += '- SSH service enabled and started\n';
    responseText += `- Public key from '${keyPath}' added to authorized_keys\n`;
    if (enablePasswordlessSudo) {
      responseText += `- Passwordless sudo enabled for ${username}\n`;
    }
    responseText += '\n**To connect:**\n';
    responseText += `\`\`\`bash\nssh ${username}@${vmIp}\n\`\`\`\n\n`;
    responseText +=
      "**Note**: If the IP address above shows as 'VM_IP_ADDRESS', run `prlctl list -f` to get the actual IP.";

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
          text: `❌ **Error configuring SSH authentication**\n\nFailed to configure SSH for VM '${request.params.arguments?.vmId}': ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
