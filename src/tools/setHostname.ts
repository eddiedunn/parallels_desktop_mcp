import { z } from 'zod';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { executePrlctl, sanitizeVmIdentifier } from '../prlctl-handler.js';

// RFC 1123 hostname validation schema
const hostnameSchema = z
  .string()
  .min(1, 'Hostname cannot be empty')
  .max(253, 'Hostname cannot exceed 253 characters')
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
    'Hostname must follow RFC 1123 format (letters, numbers, hyphens only; segments max 63 chars)'
  )
  .refine((hostname) => {
    // Additional validation: no consecutive hyphens, no leading/trailing hyphens in segments
    const segments = hostname.split('.');
    return segments.every(
      (segment) =>
        segment.length <= 63 &&
        !segment.startsWith('-') &&
        !segment.endsWith('-') &&
        !segment.includes('--')
    );
  }, 'Hostname segments cannot start/end with hyphens or contain consecutive hyphens');

const setHostnameSchema = z.object({
  vmId: z.string().min(1, 'vmId is required'),
  hostname: hostnameSchema,
});

/**
 * Sanitizes hostname to prevent command injection while preserving valid format
 */
function sanitizeHostname(hostname: string): string {
  // Remove any shell metacharacters but preserve dots for FQDN
  return hostname.replace(/[^a-zA-Z0-9.-]/g, '');
}

/**
 * Escapes hostname for safe use in shell commands
 */
function escapeForShell(str: string): string {
  return `'${str.replace(/'/g, "'\"'\"'")}'`;
}

/**
 * Hostname configuration step tracking
 */
interface HostnameConfigStep {
  name: string;
  completed: boolean;
  error?: string;
  method?: string;
  command?: string;
}

/**
 * Check VM status and accessibility
 */
async function checkVmStatus(
  vmId: string
): Promise<{ running: boolean; accessible: boolean; error?: string }> {
  try {
    // Check if VM is running
    const { stdout } = await executePrlctl(['list', '--all']);
    const running = stdout.includes(vmId) && stdout.includes('running');

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
        error: `VM running but commands fail: ${execError.message}`,
      };
    }
  } catch (error: any) {
    return { running: false, accessible: false, error: `Cannot check VM status: ${error.message}` };
  }
}

/**
 * Create detailed error response for hostname configuration
 */
function createHostnameErrorResponse(
  vmId: string,
  hostname: string,
  error: Error,
  completedSteps: HostnameConfigStep[],
  failedStep?: HostnameConfigStep
): any {
  let responseText = `❌ **Hostname Configuration Failed**\n\n`;
  responseText += `VM: ${vmId}\n`;
  responseText += `Target Hostname: ${hostname}\n`;
  responseText += `Error: ${error.message}\n\n`;

  if (completedSteps.length > 0) {
    responseText += '**✅ Completed Steps:**\n';
    completedSteps.forEach((step) => {
      responseText += `- ${step.name}`;
      if (step.method) {
        responseText += ` (${step.method})`;
      }
      responseText += '\n';
    });
    responseText += '\n';
  }

  if (failedStep) {
    responseText += '**❌ Failed Step:**\n';
    responseText += `- ${failedStep.name}`;
    if (failedStep.error) {
      responseText += `: ${failedStep.error}`;
    }
    if (failedStep.method) {
      responseText += ` (${failedStep.method})`;
    }
    responseText += '\n';
    if (failedStep.command) {
      responseText += `  Command: ${failedStep.command}\n`;
    }
    responseText += '\n';
  }

  // Recovery guidance
  responseText += '**🛠️ Recovery Options:**\n';

  if (error.message.includes('not running') || error.message.includes('not accessible')) {
    responseText += '1. **Start VM and retry:**\n';
    responseText += `   \`prlctl start "${vmId}"\`\n`;
    responseText += '   Wait for VM to fully boot, then retry hostname configuration\n\n';
  }

  responseText += '2. **Manual hostname configuration:**\n';
  responseText += `   \`prlctl enter "${vmId}"\`\n`;
  responseText += '   Then inside the VM:\n';
  responseText += `   \`sudo hostnamectl set-hostname ${hostname}\`\n`;
  responseText += `   \`echo "${hostname}" | sudo tee /etc/hostname\`\n`;
  responseText += `   \`sudo hostname ${hostname}\`\n\n`;

  responseText += '3. **Alternative methods:**\n';
  responseText += `   \`prlctl exec "${vmId}" "sudo hostnamectl set-hostname ${hostname}"\`\n`;
  responseText += `   \`prlctl exec "${vmId}" "echo '${hostname}' | sudo tee /etc/hostname"\`\n\n`;

  responseText += '**🔍 Troubleshooting:**\n';
  responseText += `- Check VM status: \`prlctl list | grep "${vmId}"\`\n`;
  responseText += `- Access VM console: \`prlctl enter "${vmId}"\`\n`;
  responseText += `- Test VM exec: \`prlctl exec "${vmId}" "whoami"\`\n`;
  responseText += '- Verify hostname after reboot: Hostname changes may require VM restart\n';

  return {
    content: [
      {
        type: 'text',
        text: responseText,
      },
    ],
    isError: true,
  };
}

export async function handleSetHostname(request: CallToolRequest) {
  const configSteps: HostnameConfigStep[] = [];
  let currentStep: HostnameConfigStep | undefined;

  try {
    // Validate input
    const args = setHostnameSchema.parse(request.params.arguments || {});
    const { vmId, hostname } = args;

    const sanitizedVmId = sanitizeVmIdentifier(vmId);
    const sanitizedHostname = sanitizeHostname(hostname);
    const escapedHostname = escapeForShell(sanitizedHostname);

    // Step 1: Check VM status and accessibility
    currentStep = { name: 'VM Status Check', completed: false };
    const vmStatus = await checkVmStatus(sanitizedVmId);
    if (!vmStatus.accessible) {
      currentStep.error = vmStatus.error || 'VM not accessible';
      throw new Error(`VM '${vmId}' is not accessible: ${vmStatus.error}`);
    }
    currentStep.completed = true;
    configSteps.push(currentStep);

    // Step 2: Try hostnamectl method (systemd systems)
    currentStep = { name: 'Hostnamectl Configuration', completed: false, method: 'hostnamectl' };
    try {
      const hostnamectlCommand = `hostnamectl set-hostname ${escapedHostname}`;
      currentStep.command = hostnamectlCommand;
      await executePrlctl(['exec', sanitizedVmId, hostnamectlCommand]);
      currentStep.completed = true;
      configSteps.push(currentStep);
    } catch (error: any) {
      currentStep.error = `hostnamectl failed: ${error.message}`;
      currentStep.completed = false;
      configSteps.push(currentStep);
      // Continue with other methods
    }

    // Step 3: Write to /etc/hostname (traditional method)
    currentStep = {
      name: '/etc/hostname Configuration',
      completed: false,
      method: '/etc/hostname',
    };
    try {
      const hostnameFileCommand = `echo ${escapedHostname} | sudo tee /etc/hostname > /dev/null`;
      currentStep.command = hostnameFileCommand;
      await executePrlctl(['exec', sanitizedVmId, hostnameFileCommand]);
      currentStep.completed = true;
      configSteps.push(currentStep);
    } catch (error: any) {
      currentStep.error = `/etc/hostname update failed: ${error.message}`;
      currentStep.completed = false;
      configSteps.push(currentStep);
    }

    // Step 4: Set runtime hostname using hostname command
    currentStep = {
      name: 'Runtime Hostname Configuration',
      completed: false,
      method: 'hostname command',
    };
    try {
      const runtimeCommand = `sudo hostname ${escapedHostname}`;
      currentStep.command = runtimeCommand;
      await executePrlctl(['exec', sanitizedVmId, runtimeCommand]);
      currentStep.completed = true;
      configSteps.push(currentStep);
    } catch (error: any) {
      currentStep.error = `hostname command failed: ${error.message}`;
      currentStep.completed = false;
      configSteps.push(currentStep);
    }

    // Step 5: Update /etc/hosts for local resolution
    currentStep = { name: '/etc/hosts Configuration', completed: false, method: '/etc/hosts' };
    try {
      const hostsCommands = [
        `sudo sed -i '/127\\.0\\.1\\.1/d' /etc/hosts 2>/dev/null || true`,
        `echo "127.0.1.1 ${escapedHostname}" | sudo tee -a /etc/hosts > /dev/null`,
      ];
      const hostsCommand = hostsCommands.join(' && ');
      currentStep.command = hostsCommand;
      await executePrlctl(['exec', sanitizedVmId, hostsCommand]);
      currentStep.completed = true;
      configSteps.push(currentStep);
    } catch (error: any) {
      currentStep.error = `/etc/hosts update failed: ${error.message}`;
      currentStep.completed = false;
      configSteps.push(currentStep);
    }

    // Step 6: Verify hostname configuration
    currentStep = { name: 'Hostname Verification', completed: false, method: 'verification' };
    let verificationOutput = '';
    let currentHostname = '';

    try {
      const verificationCommands = [
        'echo "=== Hostname Verification ==="',
        'echo "Current hostname: $(hostname)"',
        'echo "FQDN: $(hostname -f 2>/dev/null || hostname)"',
        'echo "/etc/hostname contains: $(cat /etc/hostname 2>/dev/null || echo "file not found")"',
        'echo "Hosts file entries:"',
        'grep -E "127\\.0\\.1\\.1|127\\.0\\.0\\.1" /etc/hosts 2>/dev/null || echo "no localhost entries found"',
      ];
      const verificationCommand = verificationCommands.join(' && ');
      currentStep.command = verificationCommand;

      const { stdout } = await executePrlctl(['exec', sanitizedVmId, verificationCommand]);
      verificationOutput = stdout;

      // Extract current hostname from output
      const lines = stdout.split('\n');
      const hostnameLineMatch = lines.find((line) => line.includes('Current hostname:'));
      if (hostnameLineMatch) {
        currentHostname = hostnameLineMatch.split(': ')[1]?.trim() || '';
      }

      currentStep.completed = true;
      configSteps.push(currentStep);
    } catch (error: any) {
      currentStep.error = `Verification failed: ${error.message}`;
      currentStep.completed = false;
      configSteps.push(currentStep);
      verificationOutput = 'Verification failed';
    }

    // Analyze results
    const completedSteps = configSteps.filter((s) => s.completed);
    const failedSteps = configSteps.filter((s) => !s.completed);
    const success = currentHostname === sanitizedHostname;
    const criticalMethodsCompleted =
      completedSteps.some((s) => s.method === '/etc/hostname') ||
      completedSteps.some((s) => s.method === 'hostnamectl');

    // Build comprehensive response
    const statusIcon = success ? '✅' : criticalMethodsCompleted ? '⚠️' : '❌';
    const statusText = success
      ? 'Success'
      : criticalMethodsCompleted
        ? 'Partial Success'
        : 'Failed';

    let responseText = `${statusIcon} **${statusText}**\n\n`;
    responseText += `Hostname configuration completed for VM '${vmId}'.\n\n`;
    responseText += `**Target hostname**: ${sanitizedHostname}\n`;
    responseText += `**Current hostname**: ${currentHostname || 'Unable to determine'}\n\n`;

    // Configuration summary
    responseText += `**Configuration Summary:** ${completedSteps.length}/${configSteps.length} methods completed\n\n`;

    if (completedSteps.length > 0) {
      responseText += '**✅ Successful Methods:**\n';
      completedSteps.forEach((step) => {
        responseText += `- ${step.name}`;
        if (step.method) {
          responseText += ` (${step.method})`;
        }
        responseText += '\n';
      });
      responseText += '\n';
    }

    if (failedSteps.length > 0) {
      responseText += '**❌ Failed Methods:**\n';
      failedSteps.forEach((step) => {
        responseText += `- ${step.name}`;
        if (step.error) {
          responseText += `: ${step.error}`;
        }
        responseText += '\n';
      });
      responseText += '\n';
    }

    if (verificationOutput) {
      responseText += '**Verification Results:**\n```\n';
      responseText += verificationOutput;
      responseText += '\n```\n\n';
    }

    if (!success && criticalMethodsCompleted) {
      responseText += '**Note**: Hostname configuration partially succeeded. ';
      responseText += 'Some methods failed but core configuration was applied. ';
      responseText += 'The hostname should be properly set after a reboot.\n\n';
    } else if (!success) {
      responseText += '**Warning**: Critical hostname configuration methods failed. ';
      responseText += 'Manual intervention may be required.\n\n';
    }

    responseText += '**📝 Recommendations:**\n';
    responseText += '- Restart the VM to ensure all services pick up the new hostname\n';
    responseText += '- Verify hostname persistence after reboot\n';
    if (sanitizedHostname.includes('.')) {
      responseText += '- For FQDN hostnames, ensure DNS is properly configured\n';
    }

    if (failedSteps.length > 0) {
      responseText += '\n**🛠️ Manual Recovery:**\n';
      responseText += 'If hostname is not set correctly, try manually:\n';
      responseText += `- Access VM: \`prlctl enter "${vmId}"\`\n`;
      responseText += `- Set hostname: \`sudo hostnamectl set-hostname ${sanitizedHostname}\`\n`;
      responseText += `- Update file: \`echo "${sanitizedHostname}" | sudo tee /etc/hostname\`\n`;
      responseText += `- Runtime set: \`sudo hostname ${sanitizedHostname}\`\n`;
    }

    responseText += '\n**📋 VM Management:**\n';
    responseText += `- Check hostname: \`prlctl exec "${vmId}" "hostname"\`\n`;
    responseText += `- VM Console: \`prlctl enter "${vmId}"\`\n`;
    responseText += `- Restart VM: \`prlctl restart "${vmId}"\`\n`;

    return {
      content: [
        {
          type: 'text',
          text: responseText,
        },
      ],
    };
  } catch (error: any) {
    const completedSteps = configSteps.filter((s) => s.completed);
    return createHostnameErrorResponse(
      String(request.params.arguments?.vmId || 'unknown'),
      String(request.params.arguments?.hostname || 'unknown'),
      error,
      completedSteps,
      currentStep
    );
  }
}
