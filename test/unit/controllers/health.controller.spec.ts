import { HealthController } from '../../../src/controllers/health.controller';

describe('HealthController gateway cliMode reporting', () => {
  it('returns qwencode cliMode when configured', async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'aiProvider') {
          return 'openai';
        }
        if (key === 'openai') {
          return {
            model: 'example-model',
            baseURL: 'https://example.com',
          };
        }
        if (key === 'gateway') {
          return {
            apiMode: 'openai',
            cliMode: 'qwencode',
          };
        }
        return undefined;
      }),
    };

    const mockOpenAIProvider = {
      isEnabled: () => true,
      healthCheck: jest
        .fn()
        .mockResolvedValue({ status: 'healthy', details: {} }),
    };

    const controller = new HealthController(
      mockConfigService as any,
      mockOpenAIProvider as any,
      undefined,
      undefined,
    );

    const response = await controller.healthCheck();

    expect(response.gateway?.apiMode).toBe('openai');
    expect(response.gateway?.cliMode).toBe('qwencode');
    expect(mockConfigService.get).toHaveBeenCalledWith('gateway');
  });
});
