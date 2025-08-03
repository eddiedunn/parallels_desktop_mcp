import { z } from 'zod';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { executePrlctl, sanitizeVmIdentifier, parseVmList } from '../prlctl-handler.js';
import { handleSetHostname } from './setHostname.js';
import { handleManageSshAuth } from './manageSshAuth.js';
import * as os from 'os';

const createVmSchema = z.object({
  name: z.string().min(1).max(100, 'VM name must be between 1 and 100 characters'),
  fromTemplate: z.string().optional(),
  os: z.enum(['ubuntu', 'debian', 'windows-11', 'macos', 'other']).optional(),
  distribution: z.string().optional(),
  memory: z.number().min(512).max(32768).optional(), // MB
  cpus: z.number().min(1).max(16).optional(),
  diskSize: z.number().min(8).max(2048).optional(), // GB
  setHostname: z.boolean().optional().default(true),
  createUser: z.boolean().optional().default(false),
  enableSshAuth: z.boolean().optional().default(false),
});

/**
 * Helper function to check if a VM is running
 */
async function isVmRunning(vmId: string): Promise<boolean> {
  try {
    const { stdout } = await executePrlctl(['list', '--all']);
    const vms = parseVmList(stdout);
    const vm = vms.find(v => v.name === vmId || v.uuid === vmId);
    return vm?.status === 'running';
  } catch {
    return false;
  }
}

/**
 * Helper function to check VM existence
 */
async function vmExists(vmName: string): Promise<boolean> {
  try {
    const { stdout } = await executePrlctl(['list', '--all']);
    const vms = parseVmList(stdout);
    return vms.some(v => v.name === vmName);
  } catch {
    return false;
  }
}

/**
 * Configuration step tracking for error reporting and recovery
 */
interface ConfigStep {
  name: string;
  completed: boolean;
  error?: string;
  retryable?: boolean;
  recoveryCommands?: string[];
  dependencies?: string[];
}

/**
 * VM configuration state for rollback and recovery
 */
interface VMConfigState {
  vmName: string;
  vmCreated: boolean;
  vmRunning: boolean;
  wasRunningBefore: boolean;
  configSteps: ConfigStep[];
  rollbackActions: string[];
  criticalFailure: boolean;
}

/**
 * Helper function to delete VM for rollback
 */
async function deleteVmForRollback(vmName: string): Promise<void> {
  try {
    // Stop VM first if running
    await executePrlctl(['stop', vmName]).catch(() => {});
    // Delete VM
    await executePrlctl(['delete', vmName]);
  } catch (error: any) {
    throw new Error(`Failed to delete VM during rollback: ${error.message}`);
  }
}

/**
 * Generate recovery commands for manual completion
 */
function generateRecoveryCommands(vmName: string, failedSteps: ConfigStep[], params: any): string[] {
  const commands: string[] = [];
  
  failedSteps.forEach(step => {
    if (step.recoveryCommands) {
      commands.push(`# To manually complete: ${step.name}`);
      commands.push(...step.recoveryCommands);
      commands.push('');
    }
  });
  
  return commands;
}

/**
 * Create detailed error response with recovery guidance
 */
function createErrorResponse(state: VMConfigState, error: Error, params: any): any {
  const failedSteps = state.configSteps.filter(s => !s.completed);
  const completedSteps = state.configSteps.filter(s => s.completed);
  const retryableSteps = failedSteps.filter(s => s.retryable);
  
  let responseText = `❌ **VM Creation Failed**\n\n`;
  responseText += `VM: ${state.vmName}\n`;
  responseText += `Error: ${error.message}\n\n`;
  
  // Configuration progress summary
  responseText += `**Configuration Progress:** ${completedSteps.length}/${state.configSteps.length} steps completed\n\n`;
  
  if (completedSteps.length > 0) {
    responseText += '**✅ Completed Steps:**\n';
    completedSteps.forEach(step => {
      responseText += `- ${step.name}\n`;
    });
    responseText += '\n';
  }
  
  if (failedSteps.length > 0) {
    responseText += '**❌ Failed Steps:**\n';
    failedSteps.forEach(step => {
      responseText += `- ${step.name}`;
      if (step.error) {
        responseText += `: ${step.error}`;
      }
      if (step.retryable) {
        responseText += ' (retryable)';
      }
      responseText += '\n';
    });
    responseText += '\n';
  }
  
  // VM state information
  responseText += '**VM State:**\n';
  responseText += `- VM Created: ${state.vmCreated ? 'Yes' : 'No'}\n`;
  if (state.vmCreated) {
    responseText += `- VM Running: ${state.vmRunning ? 'Yes' : 'No'}\n`;
  }
  responseText += '\n';
  
  // Recovery options
  if (state.criticalFailure && state.vmCreated) {
    responseText += '**🔄 Rollback Option:**\n';
    responseText += `Due to critical failure, you may want to delete the partially created VM:\n`;
    responseText += `\`\`\`bash\nprlctl delete "${state.vmName}"\n\`\`\`\n\n`;
  }
  
  // Manual completion guidance
  if (failedSteps.length > 0 && state.vmCreated) {
    responseText += '**🛠️ Manual Completion:**\n';
    responseText += 'You can manually complete the failed configuration steps:\n\n';
    
    failedSteps.forEach(step => {
      if (step.name === 'Hostname Configuration') {
        responseText += `- **Set Hostname:** Use the setHostname tool:\n`;
        responseText += `  \`setHostname\` with vmId: "${state.vmName}", hostname: "${params.name}"\n\n`;
      } else if (step.name === 'User and SSH Configuration') {
        responseText += `- **Setup SSH:** Use the manageSshAuth tool:\n`;
        responseText += `  \`manageSshAuth\` with vmId: "${state.vmName}", username: "${os.userInfo().username}", enablePasswordlessSudo: true\n\n`;
      } else if (step.name === 'Hardware Configuration') {
        responseText += `- **Hardware Config:** Manually configure using prlctl:\n`;
        if (params.memory) responseText += `  \`prlctl set "${state.vmName}" --memsize ${params.memory}\`\n`;
        if (params.cpus) responseText += `  \`prlctl set "${state.vmName}" --cpus ${params.cpus}\`\n`;
        if (params.diskSize) responseText += `  \`prlctl set "${state.vmName}" --device-set hdd0 --size ${params.diskSize}G\`\n`;
        responseText += '\n';
      }
    });
  }
  
  // Retry guidance
  if (retryableSteps.length > 0) {
    responseText += '**🔄 Retry Guidance:**\n';
    responseText += 'Some steps can be retried. Common solutions:\n';
    responseText += '- Ensure VM is running before configuration steps\n';
    responseText += '- Check VM has network connectivity\n';
    responseText += '- Verify sufficient system resources\n';
    responseText += '- Try running individual tools manually\n\n';
  }
  
  // Troubleshooting
  responseText += '**🔍 Troubleshooting:**\n';
  responseText += '- Check VM status: `prlctl list --all`\n';
  responseText += '- View VM info: `prlctl list -i "' + state.vmName + '"`\n';
  responseText += '- Check VM console: `prlctl enter "' + state.vmName + '"`\n';
  
  return {
    content: [{
      type: 'text',
      text: responseText,
    }],
    isError: true,
  };
}

export async function handleCreateVM(request: CallToolRequest) {
  // Initialize VM configuration state
  const state: VMConfigState = {
    vmName: '',
    vmCreated: false,
    vmRunning: false,
    wasRunningBefore: false,
    configSteps: [],
    rollbackActions: [],
    criticalFailure: false
  };
  
  try {
    // Validate input
    const params = createVmSchema.parse(request.params.arguments || {});
    const sanitizedName = sanitizeVmIdentifier(params.name);
    state.vmName = sanitizedName;
    
    // Check if VM already exists
    if (await vmExists(sanitizedName)) {
      throw new Error(`VM with name '${params.name}' already exists`);
    }

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
    let stdout = '';
    try {
      const result = await executePrlctl(args);
      stdout = result.stdout;
      state.configSteps.push({ 
        name: 'VM Creation', 
        completed: true,
        retryable: false
      });
      state.vmCreated = true;
      state.rollbackActions.push(`prlctl delete "${sanitizedName}"`);
    } catch (error: any) {
      state.configSteps.push({ 
        name: 'VM Creation', 
        completed: false, 
        error: error.message,
        retryable: true,
        recoveryCommands: [
          `# Retry VM creation`,
          `prlctl create "${sanitizedName}"${params.os ? ` --ostype ${params.os}` : ''}${params.distribution ? ` --distribution ${params.distribution}` : ''}`
        ]
      });
      state.criticalFailure = true;
      throw error;
    }

    // Hardware configuration phase
    const hardwareResults: string[] = [];
    if (!params.fromTemplate && (params.memory || params.cpus || params.diskSize)) {
      const hardwareCommands: string[] = [];
      try {
        if (params.memory) {
          await executePrlctl(['set', sanitizedName, '--memsize', params.memory.toString()]);
          hardwareResults.push(`Memory: ${params.memory}MB`);
          hardwareCommands.push(`prlctl set "${sanitizedName}" --memsize ${params.memory}`);
        }

        if (params.cpus) {
          await executePrlctl(['set', sanitizedName, '--cpus', params.cpus.toString()]);
          hardwareResults.push(`CPUs: ${params.cpus}`);
          hardwareCommands.push(`prlctl set "${sanitizedName}" --cpus ${params.cpus}`);
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
          hardwareResults.push(`Disk: ${params.diskSize}GB`);
          hardwareCommands.push(`prlctl set "${sanitizedName}" --device-set hdd0 --size ${params.diskSize}G`);
        }
        state.configSteps.push({ 
          name: 'Hardware Configuration', 
          completed: true,
          retryable: true,
          recoveryCommands: hardwareCommands
        });
      } catch (error: any) {
        state.configSteps.push({ 
          name: 'Hardware Configuration', 
          completed: false, 
          error: error.message,
          retryable: true,
          recoveryCommands: hardwareCommands
        });
        // Hardware configuration failure is not critical - continue with VM creation
        hardwareResults.push(`⚠️ Hardware configuration failed: ${error.message}`);
      }
    }

    // Post-creation configuration phase
    const postConfigResults: string[] = [];
    let needsVmRestart = false;
    let wasVmRunning = false;
    
    if (params.setHostname || params.createUser || params.enableSshAuth) {
      // Check if VM was already running
      state.wasRunningBefore = await isVmRunning(sanitizedName);
      wasVmRunning = state.wasRunningBefore;
      
      // Start VM if needed for configuration
      if (!wasVmRunning) {
        try {
          await executePrlctl(['start', sanitizedName]);
          state.configSteps.push({ 
            name: 'VM Start for Configuration', 
            completed: true,
            retryable: true,
            recoveryCommands: [`prlctl start "${sanitizedName}"`]
          });
          needsVmRestart = true;
          state.vmRunning = true;
          
          // Wait a moment for VM to fully start
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error: any) {
          state.configSteps.push({ 
            name: 'VM Start for Configuration', 
            completed: false, 
            error: error.message,
            retryable: true,
            recoveryCommands: [
              `# Start VM manually for configuration`,
              `prlctl start "${sanitizedName}"`,
              `# Wait for VM to boot, then retry configuration`
            ]
          });
          // Continue without configuration rather than failing completely
          const skipMessage = 'VM could not be started for configuration. Skipping hostname and user setup.';
          postConfigResults.push(`⚠️ ${skipMessage}`);
        }
      } else {
        state.vmRunning = true;
      }
      
      // Only proceed with configuration if VM is running
      const vmRunning = await isVmRunning(sanitizedName);
      state.vmRunning = vmRunning;
      if (vmRunning) {
        // Set hostname to match VM name
        if (params.setHostname) {
          try {
            const hostnameRequest = {
              method: 'tools/call',
              params: {
                name: 'setHostname',
                arguments: {
                  vmId: sanitizedName,
                  hostname: params.name
                }
              }
            } as CallToolRequest;
            
            const hostnameResult = await handleSetHostname(hostnameRequest);
            if (hostnameResult.isError) {
              throw new Error('Hostname setting failed');
            }
            state.configSteps.push({ 
              name: 'Hostname Configuration', 
              completed: true,
              retryable: true,
              dependencies: ['VM running']
            });
            postConfigResults.push(`Hostname set to: ${params.name}`);
          } catch (error: any) {
            state.configSteps.push({ 
              name: 'Hostname Configuration', 
              completed: false, 
              error: error.message,
              retryable: true,
              recoveryCommands: [
                `# Set hostname manually using setHostname tool`,
                `# Or use prlctl exec directly:`,
                `prlctl exec "${sanitizedName}" "sudo hostnamectl set-hostname ${params.name}"`
              ],
              dependencies: ['VM running']
            });
            postConfigResults.push(`⚠️ Hostname setting failed: ${error.message}`);
          }
        }
        
        // Create user and setup SSH if requested
        if (params.createUser || params.enableSshAuth) {
          try {
            const username = os.userInfo().username;
            const sshRequest = {
              method: 'tools/call',
              params: {
                name: 'manageSshAuth',
                arguments: {
                  vmId: sanitizedName,
                  username: username,
                  enablePasswordlessSudo: true
                }
              }
            } as CallToolRequest;
            
            const sshResult = await handleManageSshAuth(sshRequest);
            if (sshResult.isError) {
              throw new Error('SSH configuration failed');
            }
            state.configSteps.push({ 
              name: 'User and SSH Configuration', 
              completed: true,
              retryable: true,
              dependencies: ['VM running']
            });
            postConfigResults.push(`User '${username}' created with passwordless sudo and SSH access`);
          } catch (error: any) {
            state.configSteps.push({ 
              name: 'User and SSH Configuration', 
              completed: false, 
              error: error.message,
              retryable: true,
              recoveryCommands: [
                `# Setup SSH manually using manageSshAuth tool`,
                `# Or create user manually:`,
                `prlctl exec "${sanitizedName}" "sudo useradd -m -s /bin/bash ${os.userInfo().username}"`,
                `prlctl exec "${sanitizedName}" "sudo usermod -aG sudo ${os.userInfo().username}"`
              ],
              dependencies: ['VM running']
            });
            postConfigResults.push(`⚠️ User/SSH setup failed: ${error.message}`);
          }
        }
        
        // Return VM to original state
        if (needsVmRestart && !wasVmRunning) {
          try {
            await executePrlctl(['stop', sanitizedName]);
            state.configSteps.push({ 
              name: 'VM Stop after Configuration', 
              completed: true,
              retryable: true,
              recoveryCommands: [`prlctl stop "${sanitizedName}"`]
            });
            state.vmRunning = false;
          } catch (error: any) {
            state.configSteps.push({ 
              name: 'VM Stop after Configuration', 
              completed: false, 
              error: error.message,
              retryable: true,
              recoveryCommands: [
                `# Stop VM manually`,
                `prlctl stop "${sanitizedName}"`,
                `# Or force stop if needed`,
                `prlctl stop "${sanitizedName}" --kill`
              ]
            });
            postConfigResults.push(`⚠️ VM could not be stopped: ${error.message}`);
          }
        }
      }
    }

    // Build response
    let responseText = `✅ **Success**\n\n${commandDescription}\n\n`;
    
    responseText += '**VM Created:**\n';
    responseText += `- Name: ${params.name}\n`;
    if (hardwareResults.length > 0) {
      responseText += hardwareResults.map((r) => `- ${r}`).join('\n') + '\n';
    }
    
    if (postConfigResults.length > 0) {
      responseText += '\n**Post-Creation Configuration:**\n';
      responseText += postConfigResults.map((r) => `- ${r}`).join('\n') + '\n';
    }
    
    // Show configuration steps summary
    const completedSteps = state.configSteps.filter(s => s.completed).length;
    const totalSteps = state.configSteps.length;
    if (totalSteps > 1) {
      responseText += `\n**Configuration Summary:** ${completedSteps}/${totalSteps} steps completed\n`;
      
      const failedSteps = state.configSteps.filter(s => !s.completed);
      if (failedSteps.length > 0) {
        responseText += '\n**⚠️ Failed Steps:**\n';
        failedSteps.forEach(step => {
          responseText += `- ${step.name}`;
          if (step.error) {
            responseText += `: ${step.error}`;
          }
          if (step.retryable) {
            responseText += ' (retryable)';
          }
          responseText += '\n';
        });
        
        responseText += '\n**🛠️ Manual Completion Options:**\n';
        failedSteps.forEach(step => {
          if (step.name === 'Hostname Configuration') {
            responseText += `- **Set Hostname:** Use \`setHostname\` tool with vmId: "${sanitizedName}", hostname: "${params.name}"\n`;
          } else if (step.name === 'User and SSH Configuration') {
            responseText += `- **Setup SSH:** Use \`manageSshAuth\` tool with vmId: "${sanitizedName}", username: "${os.userInfo().username}"\n`;
          } else if (step.recoveryCommands && step.recoveryCommands.length > 0) {
            responseText += `- **${step.name}:** Run recovery commands\n`;
          }
        });
        
        responseText += '\n**🔄 Recovery Commands:**\n';
        responseText += '```bash\n';
        failedSteps.forEach(step => {
          if (step.recoveryCommands) {
            responseText += step.recoveryCommands.join('\n') + '\n';
          }
        });
        responseText += '```\n';
      }
    }
    
    // Add VM management guidance
    responseText += '\n**📋 VM Management:**\n';
    responseText += `- Start VM: \`prlctl start "${sanitizedName}"\`\n`;
    responseText += `- Stop VM: \`prlctl stop "${sanitizedName}"\`\n`;
    responseText += `- VM Status: \`prlctl list | grep "${sanitizedName}"\`\n`;
    responseText += `- VM Info: \`prlctl list -i "${sanitizedName}"\`\n`;
    
    responseText += `\n**Output:**\n\`\`\`\n${stdout}\n\`\`\``;

    return {
      content: [
        {
          type: 'text',
          text: responseText,
        },
      ],
    };
  } catch (error: any) {
    // Handle critical failures with potential rollback
    if (state.criticalFailure && state.vmCreated) {
      const params = request.params.arguments;
      let rollbackText = '';
      
      try {
        // Offer rollback for critical creation failures
        rollbackText = '\n**🔄 Automatic Rollback Available:**\n';
        rollbackText += 'Due to critical failure during VM creation, the VM can be automatically removed.\n';
        rollbackText += 'To manually clean up:\n';
        rollbackText += `\`\`\`bash\nprlctl delete "${state.vmName}"\n\`\`\`\n`;
      } catch (rollbackError: any) {
        rollbackText = `\n**⚠️ Rollback Failed:** ${rollbackError.message}\n`;
        rollbackText += 'Manual cleanup may be required.\n';
      }
      
      return createErrorResponse(state, error, params);
    }
    
    return createErrorResponse(state, error, request.params.arguments);
  }
}