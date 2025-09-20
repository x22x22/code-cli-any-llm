import { RequestTransformer } from '@/transformers/request.transformer';
import { ToolFormatter } from '@/transformers/enhanced/ToolFormatter';
import type { GeminiRequestDto } from '@/models/gemini/gemini-request.dto';

describe('RequestTransformer - 工具调用配对', () => {
  let transformer: RequestTransformer;

  beforeEach(() => {
    transformer = new RequestTransformer(new ToolFormatter());
  });

  it('移除缺少工具响应的纯工具调用消息', () => {
    const request: GeminiRequestDto = {
      contents: [
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'queryWeather',
                args: { city: '上海' },
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [{ text: '请继续' }],
        },
      ],
    } as GeminiRequestDto;

    const result = transformer.transformRequest(
      request,
      'qwen3-next-80b-a3b-thinking',
    );

    const assistantWithToolCalls = result.messages.filter(
      (msg) => msg.role === 'assistant' && msg.tool_calls?.length,
    );

    expect(assistantWithToolCalls).toHaveLength(0);
    expect(result.messages.some((msg) => msg.role === 'user')).toBe(true);
  });

  it('保留文本内容但移除无响应的工具调用', () => {
    const request: GeminiRequestDto = {
      contents: [
        {
          role: 'model',
          parts: [
            { text: '我准备执行工具调用' },
            {
              functionCall: {
                id: 'call-text',
                name: 'searchDocument',
                args: { keyword: 'Gemini' },
              },
            },
          ],
        },
      ],
    } as GeminiRequestDto;

    const result = transformer.transformRequest(request, 'glm-4.5');

    const assistantMessages = result.messages.filter(
      (msg) => msg.role === 'assistant',
    );

    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]?.content).toContain('工具调用');
    expect(assistantMessages[0]?.tool_calls).toBeUndefined();
  });

  it('保留已完成配对的工具调用与响应', () => {
    const request: GeminiRequestDto = {
      contents: [
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call-1',
                name: 'lookup',
                args: { id: 1 },
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'call-1',
                name: 'lookup',
                response: { result: 'ok' },
              },
            },
          ],
        },
      ],
    } as GeminiRequestDto;

    const result = transformer.transformRequest(request, 'glm-4.5');

    const assistantToolCall = result.messages.find(
      (msg) => msg.role === 'assistant' && msg.tool_calls?.[0]?.id === 'call-1',
    );
    const toolResponse = result.messages.find(
      (msg) => msg.role === 'tool' && msg.tool_call_id === 'call-1',
    );

    expect(assistantToolCall).toBeDefined();
    expect(toolResponse).toBeDefined();
  });

  it('合并连续的助手消息以保持上下文紧凑', () => {
    const request: GeminiRequestDto = {
      contents: [
        {
          role: 'user',
          parts: [{ text: '请给出建议' }],
        },
        {
          role: 'model',
          parts: [{ text: '第一段' }],
        },
        {
          role: 'model',
          parts: [{ text: '第二段' }],
        },
      ],
    } as GeminiRequestDto;

    const result = transformer.transformRequest(request, 'glm-4.5');

    const assistantMessages = result.messages.filter(
      (msg) => msg.role === 'assistant',
    );

    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]?.content).toBe('第一段第二段');
  });
});
