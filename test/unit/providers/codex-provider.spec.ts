import { ConfigService } from '@nestjs/config';
import { CodexProvider } from '@/providers/codex/codex.provider';
import { OpenAIRequest } from '@/models/openai/openai-request.model';

describe('CodexProvider message normalization', () => {
  const createProvider = (): CodexProvider => {
    return new CodexProvider({} as ConfigService);
  };

  const baseConfig = {
    authMode: 'ApiKey',
    baseURL: 'https://example.com',
    model: 'gpt-5-codex',
    timeout: 1000,
  } as any;

  it('flattens array-based user content into input_text text', () => {
    const provider = createProvider();
    const request: OpenAIRequest = {
      model: 'gpt-5-codex',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '你好，Codex',
            },
            {
              type: 'text',
              text: '请回答下面的问题。',
            },
          ],
        },
      ],
    } as any;

    const payload = (provider as any).buildCodexPayload(request, baseConfig);

    const text = payload.input?.[0]?.content?.[0]?.text;
    expect(text).toBe('你好，Codex\n\n请回答下面的问题。');
  });

  it('keeps system message parts wrapped in system markers', () => {
    const provider = createProvider();
    const request: OpenAIRequest = {
      model: 'gpt-5-codex',
      messages: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'You are a helpful assistant.',
            },
          ],
        },
        {
          role: 'user',
          content: '写一个函数。',
        },
      ],
    } as any;

    const payload = (provider as any).buildCodexPayload(request, baseConfig);

    const systemText = payload.input?.[0]?.content?.[0]?.text;
    expect(systemText).toBe('<system>You are a helpful assistant.</system>');
  });
});
