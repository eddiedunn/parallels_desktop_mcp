import { z } from 'zod';
import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { executePrlctl, sanitizeVmIdentifier } from '../prlctl-handler.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

const takeScreenshotSchema = z.object({
  vmId: z.string().min(1, 'vmId is required'),
  outputPath: z.string().optional(),
});

export async function handleTakeScreenshot(request: CallToolRequest) {
  try {
    // Validate input
    const { vmId, outputPath } = takeScreenshotSchema.parse(request.params.arguments || {});
    const sanitizedVmId = sanitizeVmIdentifier(vmId);

    // Determine output path
    let screenshotPath: string;
    if (outputPath) {
      screenshotPath = outputPath;
    } else {
      // Create default path in temp directory
      const tempDir = os.tmpdir();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      screenshotPath = path.join(tempDir, `parallels-${vmId}-${timestamp}.png`);
    }

    // Ensure directory exists
    const dir = path.dirname(screenshotPath);
    await fs.mkdir(dir, { recursive: true });

    // Execute prlctl capture command
    const { stdout } = await executePrlctl(['capture', sanitizedVmId, '--file', screenshotPath]);

    // Verify the file was created
    try {
      await fs.access(screenshotPath);
    } catch {
      throw new Error('Screenshot file was not created successfully');
    }

    return {
      content: [
        {
          type: 'text',
          text: `✅ **Success**\n\nScreenshot captured for VM '${vmId}'.\n\n**Saved to**: ${screenshotPath}\n\n**Output:**\n\`\`\`\n${stdout}\n\`\`\``,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ **Error capturing screenshot**\n\nFailed to capture screenshot for VM '${request.params.arguments?.vmId}': ${error.message}\n\n**Note**: Make sure the VM is running and Parallels Tools are installed.`,
        },
      ],
      isError: true,
    };
  }
}
