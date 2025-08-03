import { z } from 'zod';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { executePrlctl, sanitizeVmIdentifier } from '../prlctl-handler.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

const manageSshAuthSchema = z.object({
  vmId: z.string().min(1, 'vmId is required'),
  username: z.string().optional(),
  publicKeyPath: z.string().optional(),
  enablePasswordlessSudo: z.boolean().optional().default(false),
});

/**
 * SSH configuration state tracking
 */
interface SshConfigStep {
  name: string;
  completed: boolean;
  error?: string;
  command?: string;
}

/**
 * Check if VM is running and accessible
 */
async function checkVmAccess(vmId: string): Promise<{ running: boolean; accessible: boolean; error?: string }> {
  try {
    // Check if VM is running
    const { stdout: listOutput } = await executePrlctl(['list', '--all']);
    const running = listOutput.includes(vmId) && listOutput.includes('running');
    
    if (!running) {
      return { running: false, accessible: false, error: 'VM is not running' };
    }
    
    // Test basic command execution
    try {
      await executePrlctl(['exec', vmId, 'echo "test"']);
      return { running: true, accessible: true };
    } catch (execError: any) {
      return { 
        running: true, 
        accessible: false, 
        error: `VM running but not accessible: ${execError.message}` 
      };
    }
  } catch (error: any) {
    return { running: false, accessible: false, error: `Failed to check VM status: ${error.message}` };
  }
}

/**
 * Create detailed error response with recovery guidance
 */
function createSshErrorResponse(vmId: string, error: Error, completedSteps: SshConfigStep[], failedStep?: SshConfigStep): any {
  let responseText = `❌ **SSH Configuration Failed**\n\n`;
  responseText += `VM: ${vmId}\n`;
  responseText += `Error: ${error.message}\n\n`;
  
  if (completedSteps.length > 0) {
    responseText += '**✅ Completed Steps:**\n';
    completedSteps.forEach(step => {
      responseText += `- ${step.name}\n`;
    });
    responseText += '\n';
  }
  
  if (failedStep) {
    responseText += '**❌ Failed Step:**\n';
    responseText += `- ${failedStep.name}: ${failedStep.error}\n`;
    if (failedStep.command) {
      responseText += `  Command: ${failedStep.command}\n`;
    }
    responseText += '\n';
  }
  
  // Recovery guidance based on error type
  responseText += '**🛠️ Recovery Options:**\n';
  
  if (error.message.includes('not running') || error.message.includes('not accessible')) {
    responseText += '1. **Start VM and retry:**\n';
    responseText += `   \`prlctl start "${vmId}"\`\n`;
    responseText += '   Wait for VM to fully boot, then retry SSH configuration\n\n';
  }
  
  if (error.message.includes('public key') || error.message.includes('ssh-keygen')) {
    responseText += '2. **Generate SSH Key:**\n';
    responseText += '   \`ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519\`\n';
    responseText += '   Then retry with the generated key\n\n';
  }
  
  if (error.message.includes('permission') || error.message.includes('sudo')) {
    responseText += '3. **Manual User Setup:**\n';
    responseText += `   \`prlctl enter "${vmId}"\`\n`;
    responseText += '   Then manually create user and configure SSH\n\n';
  }
  
  responseText += '**🔍 Troubleshooting:**\n';
  responseText += `- Check VM status: \`prlctl list | grep "${vmId}"\`\n`;
  responseText += `- Access VM console: \`prlctl enter "${vmId}"\`\n`;
  responseText += `- Check VM network: \`prlctl exec "${vmId}" "ip addr"\`\n`;
  responseText += '- Verify SSH service: Look for sshd process in VM\n';
  
  return {
    content: [{
      type: 'text',
      text: responseText,
    }],
    isError: true,
  };
}

export async function handleManageSshAuth(request: CallToolRequest) {
  const configSteps: SshConfigStep[] = [];
  let currentStep: SshConfigStep | undefined;
  
  try {
    // Validate input
    const args = manageSshAuthSchema.parse(request.params.arguments || {});
    const { vmId, publicKeyPath, enablePasswordlessSudo } = args;
    
    // Auto-detect Mac username if not provided
    const username = args.username || os.userInfo().username;
    
    const sanitizedVmId = sanitizeVmIdentifier(vmId);
    
    // Step 1: Check VM accessibility
    currentStep = { name: 'VM Access Check', completed: false };
    const vmAccess = await checkVmAccess(sanitizedVmId);
    if (!vmAccess.accessible) {
      currentStep.error = vmAccess.error || 'VM not accessible';
      throw new Error(`VM '${vmId}' is not accessible: ${vmAccess.error}`);
    }
    currentStep.completed = true;
    configSteps.push(currentStep);

    // Step 2: Locate and validate SSH public key
    currentStep = { name: 'SSH Key Validation', completed: false };
    let keyPath: string = '';
    let publicKey: string = '';
    
    try {
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
          currentStep.error = 'No SSH public key found';
          throw new Error(
            'No SSH public key found. Please specify publicKeyPath or generate a key with ssh-keygen.'
          );
        }
      }
      
      // Read and validate the public key
      publicKey = await fs.readFile(keyPath, 'utf8');
      const trimmedKey = publicKey.trim();
      
      if (!trimmedKey || !trimmedKey.startsWith('ssh-')) {
        currentStep.error = 'Invalid SSH public key format';
        throw new Error(`Invalid SSH public key format in ${keyPath}`);
      }
      
      publicKey = trimmedKey;
      currentStep.completed = true;
      configSteps.push(currentStep);
    } catch (error: any) {
      if (!currentStep.error) {
        currentStep.error = error.message;
      }
      throw error;
    }

    // Step 3: Check if user exists
    currentStep = { name: 'User Existence Check', completed: false, command: `id ${username}` };
    let userExists = false;
    
    try {
      const userCheckCommand = `id ${username} 2>/dev/null`;
      await executePrlctl(['exec', sanitizedVmId, userCheckCommand]);
      userExists = true;
      currentStep.completed = true;
      configSteps.push(currentStep);
    } catch {
      // User doesn't exist, we'll create it
      userExists = false;
      currentStep.completed = true;
      configSteps.push(currentStep);
    }
    
    // Step 4: Create user if needed
    if (!userExists) {
      currentStep = { name: 'User Creation', completed: false };
      const userCommands = [
        `sudo useradd -m -s /bin/bash ${username} 2>/dev/null || true`,
        `sudo usermod -aG sudo ${username} 2>/dev/null || sudo usermod -aG wheel ${username} 2>/dev/null || true`,
        `sudo chown ${username}:${username} /home/${username}`,
        `sudo chmod 755 /home/${username}`
      ];
      
      try {
        const userCommand = userCommands.join(' && ');
        currentStep.command = userCommand;
        await executePrlctl(['exec', sanitizedVmId, userCommand]);
        currentStep.completed = true;
        configSteps.push(currentStep);
      } catch (error: any) {
        currentStep.error = `Failed to create user: ${error.message}`;
        throw new Error(`Failed to create user '${username}': ${error.message}`);
      }
    }

    // Step 5: Configure SSH service
    currentStep = { name: 'SSH Service Configuration', completed: false };
    const sshServiceCommands = [
      'sudo ssh-keygen -A 2>/dev/null || true',
      'sudo systemctl enable ssh 2>/dev/null || sudo systemctl enable sshd 2>/dev/null || true',
      'sudo systemctl start ssh 2>/dev/null || sudo systemctl start sshd 2>/dev/null || true'
    ];
    
    try {
      const sshServiceCommand = sshServiceCommands.join(' && ');
      currentStep.command = sshServiceCommand;
      await executePrlctl(['exec', sanitizedVmId, sshServiceCommand]);
      currentStep.completed = true;
      configSteps.push(currentStep);
    } catch (error: any) {
      currentStep.error = `SSH service configuration failed: ${error.message}`;
      // This is not critical, continue with key setup
      currentStep.completed = false;
      configSteps.push(currentStep);
    }

    // Step 6: Setup SSH directory and keys
    currentStep = { name: 'SSH Key Installation', completed: false };
    const sshKeyCommands = [
      `sudo -u ${username} mkdir -p /home/${username}/.ssh`,
      `sudo chmod 700 /home/${username}/.ssh`,
      `echo '${publicKey}' | sudo tee -a /home/${username}/.ssh/authorized_keys`,
      `sudo chown ${username}:${username} /home/${username}/.ssh/authorized_keys`,
      `sudo chmod 600 /home/${username}/.ssh/authorized_keys`
    ];
    
    try {
      const sshKeyCommand = sshKeyCommands.join(' && ');
      currentStep.command = sshKeyCommand;
      await executePrlctl(['exec', sanitizedVmId, sshKeyCommand]);
      currentStep.completed = true;
      configSteps.push(currentStep);
    } catch (error: any) {
      currentStep.error = `SSH key installation failed: ${error.message}`;
      throw new Error(`Failed to install SSH key: ${error.message}`);
    }

    // Step 7: Configure passwordless sudo if requested
    if (enablePasswordlessSudo) {
      currentStep = { name: 'Passwordless Sudo Configuration', completed: false };
      const sudoCommands = [
        `echo '${username} ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/${username}`,
        `sudo chmod 440 /etc/sudoers.d/${username}`
      ];
      
      try {
        const sudoCommand = sudoCommands.join(' && ');
        currentStep.command = sudoCommand;
        await executePrlctl(['exec', sanitizedVmId, sudoCommand]);
        currentStep.completed = true;
        configSteps.push(currentStep);
      } catch (error: any) {
        currentStep.error = `Sudo configuration failed: ${error.message}`;
        // This is not critical, continue
        currentStep.completed = false;
        configSteps.push(currentStep);
      }
    }

    // Step 8: Get VM IP address for connection instructions
    currentStep = { name: 'IP Address Discovery', completed: false };
    let vmIp = 'VM_IP_ADDRESS';
    
    try {
      const ipCommand = 'ip -4 addr show | grep -oP "(?<=inet )[\\d.]+(?=/)" | grep -v "127.0.0.1" | head -1';
      currentStep.command = ipCommand;
      const { stdout } = await executePrlctl(['exec', sanitizedVmId, ipCommand]);
      
      const ipMatch = stdout.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch) {
        vmIp = ipMatch[1];
        currentStep.completed = true;
      } else {
        currentStep.error = 'Could not determine VM IP address';
        currentStep.completed = false;
      }
      configSteps.push(currentStep);
    } catch (error: any) {
      currentStep.error = `IP discovery failed: ${error.message}`;
      currentStep.completed = false;
      configSteps.push(currentStep);
      // Not critical for SSH configuration
    }

    // Build comprehensive success response
    const completedSteps = configSteps.filter(s => s.completed);
    const failedSteps = configSteps.filter(s => !s.completed);
    
    let responseText = `✅ **SSH Configuration ${failedSteps.length > 0 ? 'Partially ' : ''}Completed**\n\n`;
    responseText += `SSH authentication configured for user '${username}' on VM '${vmId}'.\n\n`;
    
    // Configuration summary
    responseText += `**Configuration Summary:** ${completedSteps.length}/${configSteps.length} steps completed\n\n`;
    
    if (completedSteps.length > 0) {
      responseText += '**✅ Completed Steps:**\n';
      completedSteps.forEach(step => {
        responseText += `- ${step.name}\n`;
      });
      responseText += '\n';
    }
    
    if (failedSteps.length > 0) {
      responseText += '**⚠️ Failed/Skipped Steps:**\n';
      failedSteps.forEach(step => {
        responseText += `- ${step.name}`;
        if (step.error) {
          responseText += `: ${step.error}`;
        }
        responseText += '\n';
      });
      responseText += '\n';
    }
    
    responseText += '**Configuration Details:**\n';
    if (!userExists) {
      responseText += `- User '${username}' created with home directory\n`;
    } else {
      responseText += `- User '${username}' already existed\n`;
    }
    responseText += `- Public key from '${keyPath}' added to authorized_keys\n`;
    if (enablePasswordlessSudo && configSteps.find(s => s.name === 'Passwordless Sudo Configuration')?.completed) {
      responseText += `- Passwordless sudo enabled for ${username}\n`;
    }
    
    if (args.username) {
      responseText += `\n**Username**: Used provided username '${username}'\n`;
    } else {
      responseText += `\n**Username**: Auto-detected Mac username '${username}'\n`;
    }
    
    responseText += '\n**To connect:**\n';
    responseText += `\`\`\`bash\nssh ${username}@${vmIp}\n\`\`\`\n\n`;
    
    if (vmIp === 'VM_IP_ADDRESS') {
      responseText += "**Note**: Could not determine VM IP address. Run \`prlctl list -f\` to get the actual IP.\n\n";
    }
    
    if (failedSteps.length > 0) {
      responseText += '**🛠️ Manual Steps for Failed Items:**\n';
      failedSteps.forEach(step => {
        if (step.command) {
          responseText += `- ${step.name}: \`prlctl exec "${vmId}" "${step.command}"\`\n`;
        }
      });
      responseText += '\n';
    }
    
    responseText += '**📋 VM Management:**\n';
    responseText += `- Test SSH: \`ssh ${username}@${vmIp}\`\n`;
    responseText += `- VM Console: \`prlctl enter "${vmId}"\`\n`;
    responseText += `- VM Status: \`prlctl list | grep "${vmId}"\`\n`;

    return {
      content: [
        {
          type: 'text',
          text: responseText,
        },
      ],
    };
  } catch (error: any) {
    const completedSteps = configSteps.filter(s => s.completed);
    return createSshErrorResponse(
      request.params.arguments?.vmId || 'unknown',
      error,
      completedSteps,
      currentStep
    );
  }
}
