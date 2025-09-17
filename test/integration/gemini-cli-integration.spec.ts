import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Gemini CLI Integration Tests', () => {
  const testServerUrl = 'http://127.0.0.1:23062/api'; // Use the existing dev server

  beforeAll(async () => {
    // Check if the development server is running
    try {
      const response = await fetch('http://127.0.0.1:23062/api/v1/health');
      if (!response.ok) {
        throw new Error('Dev server health check failed');
      }
    } catch (error) {
      throw new Error(
        'Development server is not running on port 23062. Please start it with: pnpm run start:dev',
      );
    }
  });

  // Helper function to run Gemini CLI commands
  async function runGeminiCommand(
    prompt: string,
    options: { timeout?: number } = {},
  ) {
    const env = {
      ...process.env,
      GOOGLE_GEMINI_BASE_URL: testServerUrl,
    };

    const command = `gemini -p "${prompt.replace(/"/g, '\\"')}"`;

    try {
      const result = await execAsync(command, {
        env,
        timeout: options.timeout || 30000, // 30 second timeout
      });
      return {
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error: unknown) {
      const err = error as {
        stdout?: string;
        stderr?: string;
        message?: string;
      };
      return {
        success: false,
        stdout: err.stdout || '',
        stderr: err.stderr || '',
        error: err.message || 'Unknown error',
      };
    }
  }

  describe('Basic Functionality', () => {
    it('should handle simple Chinese greeting', async () => {
      const result = await runGeminiCommand('你好。');

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('你好');
      expect(result.stderr).not.toContain('JSON input');
      expect(result.stderr).not.toContain('API Error');
    }, 60000);

    it('should handle English greetings', async () => {
      const result = await runGeminiCommand('Hello!');

      expect(result.success).toBe(true);
      expect(result.stdout.length).toBeGreaterThan(0);
      expect(result.stderr).not.toContain('JSON input');
    }, 60000);
  });

  describe('Complex Queries', () => {
    it('should handle Python code generation requests', async () => {
      const result = await runGeminiCommand(
        'Write a simple Python function to calculate factorial',
      );

      expect(result.success).toBe(true);
      expect(result.stdout.toLowerCase()).toMatch(/def|function|factorial/);
      expect(result.stderr).not.toContain('JSON input');
    }, 60000);

    it('should handle multi-language requests', async () => {
      const result = await runGeminiCommand(
        '请用Python写一个计算斐波那契数列的函数',
      );

      expect(result.success).toBe(true);
      expect(result.stdout.length).toBeGreaterThan(50);
      expect(result.stderr).not.toContain('JSON input');
    }, 60000);
  });

  describe('Stream Processing', () => {
    it('should handle streaming responses without JSON errors', async () => {
      const result = await runGeminiCommand('Tell me a short story about AI');

      expect(result.success).toBe(true);
      expect(result.stdout.length).toBeGreaterThan(100);
      expect(result.stderr).not.toContain('Unexpected end of JSON input');
      expect(result.stderr).not.toContain('is not valid JSON');
    }, 60000);

    it('should handle GLM model buffering correctly', async () => {
      const result = await runGeminiCommand(
        '用中文讲一个关于机器学习的故事，要求至少100字',
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toMatch(/[\u4e00-\u9fff]/); // Contains Chinese characters
      expect(result.stderr).not.toContain('JSON input');
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should handle very long prompts gracefully', async () => {
      const longPrompt =
        'Explain quantum computing ' + 'in great detail '.repeat(50);
      const result = await runGeminiCommand(longPrompt);

      // Should either succeed or fail gracefully (not with JSON parse errors)
      if (!result.success) {
        expect(result.stderr).not.toContain('Unexpected end of JSON input');
        expect(result.stderr).not.toContain('is not valid JSON');
      }
    }, 90000);

    it('should handle special characters in prompts', async () => {
      const result = await runGeminiCommand(
        'Explain symbols: @#$%^&*()[]{}|\\:";\'<>?,./ 中文符号：！@#￥%……&*（）',
      );

      expect(result.success).toBe(true);
      expect(result.stderr).not.toContain('JSON input');
    }, 60000);
  });

  describe('Tool Calls and Advanced Features', () => {
    it('should handle requests that might trigger tool calls', async () => {
      const result = await runGeminiCommand(
        'Create a file called test.txt with hello world content',
      );

      // Should handle tool calls without JSON parsing errors
      expect(result.stderr).not.toContain('Unexpected end of JSON input');
      expect(result.stderr).not.toContain('is not valid JSON');
    }, 60000);
  });
});

// Optional test that requires manual verification
describe('Gemini CLI Manual Verification Tests (Optional)', () => {
  it.skip('should be manually testable with gemini-test.sh', () => {
    console.log('Run the following command to manually test:');
    console.log('./gemini-test.sh');
    console.log(
      'Expected: Should receive a Chinese greeting without JSON errors',
    );
  });

  it.skip('should be manually testable with complex queries', () => {
    console.log(
      'Run the following commands to manually test complex scenarios:',
    );
    console.log(
      'GOOGLE_GEMINI_BASE_URL=http://127.0.0.1:23062/api gemini -p "请写一个Python函数"',
    );
    console.log(
      'GOOGLE_GEMINI_BASE_URL=http://127.0.0.1:23062/api gemini -p "Tell me about machine learning"',
    );
  });
});
