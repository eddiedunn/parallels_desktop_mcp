/**
 * Test helpers for handling MCP response formats
 * 
 * These helpers bridge the gap between test expectations (simple text)
 * and actual MCP response format (structured objects).
 */

import { McpResponse } from '../../utils/mcp-response.js';

/**
 * Extracts text content from various response formats
 * Handles both legacy string responses and structured MCP responses
 */
export function getResponseText(response: any): string {
  // Handle direct string response (legacy)
  if (typeof response === 'string') {
    return response;
  }
  
  // Handle structured MCP response
  if (response?.content?.[0]?.text) {
    return response.content[0].text;
  }
  
  // Handle response with direct text property
  if (response?.text) {
    return response.text;
  }
  
  // Default to empty string
  return '';
}

/**
 * Checks if response indicates an error
 */
export function isResponseError(response: any): boolean {
  // Handle boolean error flag
  if (typeof response?.isError === 'boolean') {
    return response.isError;
  }
  
  // Check for error patterns in text
  const text = getResponseText(response);
  return text.includes('❌') || text.includes('Error:') || text.includes('Failed');
}

/**
 * Custom Jest matcher for response content
 */
export function toContainInResponse(response: any, expected: string): {
  pass: boolean;
  message: () => string;
} {
  const text = getResponseText(response);
  const pass = text.includes(expected);
  
  return {
    pass,
    message: () => pass
      ? `Expected response not to contain "${expected}"`
      : `Expected response to contain "${expected}"\n\nReceived:\n${text}`,
  };
}

/**
 * Creates a response object that matches test expectations
 */
export function createTestResponse(text: string, isError = false): McpResponse {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
    ...(isError && { isError: true }),
  };
}