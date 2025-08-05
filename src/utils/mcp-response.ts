/**
 * Unified MCP Response Format Utilities
 * 
 * Provides standardized response formatting for MCP tools to ensure
 * consistency between tool outputs and test expectations.
 */

export interface McpResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Creates a successful MCP response
 */
export function createSuccessResponse(text: string): McpResponse {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

/**
 * Creates an error MCP response
 */
export function createErrorResponse(text: string): McpResponse {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
    isError: true,
  };
}

/**
 * Extracts text content from MCP response for testing
 */
export function extractResponseText(response: McpResponse): string {
  return response.content[0]?.text || '';
}

/**
 * Checks if a response is an error response
 */
export function isErrorResponse(response: McpResponse): boolean {
  return response.isError === true;
}

/**
 * Configuration step tracking for tools
 */
export interface ConfigStep {
  name: string;
  completed: boolean;
  error?: string;
  command?: string;
}

/**
 * Formats configuration steps summary
 */
export function formatConfigSummary(
  steps: ConfigStep[],
  includeCommands = false
): string {
  const completed = steps.filter(s => s.completed);
  const failed = steps.filter(s => !s.completed);
  
  let summary = '';
  
  if (completed.length > 0 || failed.length > 0) {
    summary += `**Configuration Summary:** ${completed.length}/${steps.length} steps completed\n\n`;
  }
  
  if (completed.length > 0) {
    summary += '**✅ Completed Steps:**\n';
    completed.forEach(step => {
      summary += `- ${step.name}\n`;
    });
    summary += '\n';
  }
  
  if (failed.length > 0) {
    summary += '**⚠️ Failed/Skipped Steps:**\n';
    failed.forEach(step => {
      summary += `- ${step.name}`;
      if (step.error) {
        summary += `: ${step.error}`;
      }
      summary += '\n';
    });
    summary += '\n';
    
    if (includeCommands) {
      const stepsWithCommands = failed.filter(s => s.command);
      if (stepsWithCommands.length > 0) {
        summary += '**🛠️ Manual Steps for Failed Items:**\n';
        stepsWithCommands.forEach(step => {
          summary += `- ${step.name}: \`${step.command}\`\n`;
        });
        summary += '\n';
      }
    }
  }
  
  return summary;
}