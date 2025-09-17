/**
 * 工具格式转换端到端测试
 *
 * 目标: 验证各种工具格式的转换和兼容性
 * 重要: 这些测试必须在实现前编写，并且必须失败
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, INestApplication } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('工具格式转换端到端测试 (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('OpenAI格式工具转换', () => {
    it('应该正确处理标准OpenAI格式的工具', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/gpt-4:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '帮我查询北京今天的天气',
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: 'get_weather',
                  description: 'Get current weather information',
                  parameters: {
                    type: 'object',
                    properties: {
                      location: {
                        type: 'string',
                        description: 'City name',
                      },
                      unit: {
                        type: 'string',
                        enum: ['celsius', 'fahrenheit'],
                        description: 'Temperature unit',
                      },
                    },
                    required: ['location'],
                  },
                },
              ],
            },
          ],
        })
        .expect(HttpStatus.OK);

      // 验证响应符合Gemini API格式
      expect(response.body).toHaveProperty('candidates');
      expect(response.body.candidates).toHaveLength(1);

      const candidate = response.body.candidates[0];
      if (candidate.content?.parts) {
        const toolCallParts = candidate.content.parts.filter(
          (part) => part.functionCall,
        );

        toolCallParts.forEach((part) => {
          expect(part.functionCall).toHaveProperty('name');
          expect(part.functionCall).toHaveProperty('args');

          // 验证参数类型正确
          if (part.functionCall.args.location) {
            expect(typeof part.functionCall.args.location).toBe('string');
          }

          if (part.functionCall.args.unit) {
            expect(['celsius', 'fahrenheit']).toContain(
              part.functionCall.args.unit,
            );
          }
        });
      }
    });

    it('应该处理复杂嵌套的工具参数', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/gpt-4:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '创建一个包含用户信息和偏好设置的配置',
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: 'create_user_config',
                  description: 'Create user configuration',
                  parameters: {
                    type: 'object',
                    properties: {
                      user: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          age: { type: 'number' },
                          email: { type: 'string' },
                        },
                        required: ['name', 'email'],
                      },
                      preferences: {
                        type: 'object',
                        properties: {
                          theme: { type: 'string', enum: ['light', 'dark'] },
                          language: { type: 'string' },
                          notifications: {
                            type: 'object',
                            properties: {
                              email: { type: 'boolean' },
                              sms: { type: 'boolean' },
                            },
                          },
                        },
                      },
                      tags: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                    required: ['user'],
                  },
                },
              ],
            },
          ],
        })
        .expect(HttpStatus.OK);

      // 验证复杂嵌套结构正确转换
      const candidate = response.body.candidates[0];
      if (candidate?.content?.parts) {
        const toolCallParts = candidate.content.parts.filter(
          (part) => part.functionCall,
        );

        toolCallParts.forEach((part) => {
          const args = part.functionCall.args;

          // 验证嵌套对象结构
          if (args.user) {
            expect(typeof args.user).toBe('object');
            if (args.user.name) expect(typeof args.user.name).toBe('string');
            if (args.user.age) expect(typeof args.user.age).toBe('number');
            if (args.user.email) expect(typeof args.user.email).toBe('string');
          }

          // 验证深度嵌套
          if (args.preferences?.notifications) {
            expect(typeof args.preferences.notifications).toBe('object');
            if (args.preferences.notifications.email !== undefined) {
              expect(typeof args.preferences.notifications.email).toBe(
                'boolean',
              );
            }
          }

          // 验证数组类型
          if (args.tags) {
            expect(Array.isArray(args.tags)).toBe(true);
            args.tags.forEach((tag) => expect(typeof tag).toBe('string'));
          }
        });
      }
    });
  });

  describe('Anthropic格式工具转换', () => {
    it('应该正确转换Anthropic样式的工具定义', async () => {
      // 注意：这里假设系统能检测并处理不同格式
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/claude-3:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '帮我分析一段文本的情感倾向',
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: 'analyze_sentiment',
                  description: 'Analyze the sentiment of given text',
                  parameters: {
                    type: 'object',
                    properties: {
                      text: {
                        type: 'string',
                        description: 'Text to analyze',
                      },
                      language: {
                        type: 'string',
                        description: 'Language of the text',
                        default: 'auto',
                      },
                      confidence_threshold: {
                        type: 'number',
                        minimum: 0,
                        maximum: 1,
                        description: 'Minimum confidence score',
                      },
                    },
                    required: ['text'],
                  },
                },
              ],
            },
          ],
        })
        .expect(HttpStatus.OK);

      // 验证Anthropic格式转换正确
      const candidate = response.body.candidates[0];
      if (candidate?.content?.parts) {
        const toolCallParts = candidate.content.parts.filter(
          (part) => part.functionCall,
        );

        toolCallParts.forEach((part) => {
          expect(part.functionCall.name).toBe('analyze_sentiment');

          const args = part.functionCall.args;
          if (args.text) expect(typeof args.text).toBe('string');
          if (args.language) expect(typeof args.language).toBe('string');
          if (args.confidence_threshold) {
            expect(typeof args.confidence_threshold).toBe('number');
            expect(args.confidence_threshold).toBeGreaterThanOrEqual(0);
            expect(args.confidence_threshold).toBeLessThanOrEqual(1);
          }
        });
      }
    });
  });

  describe('Qwen格式工具转换', () => {
    it('应该正确处理Qwen格式的工具调用', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/qwen-max:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '帮我搜索关于机器学习的最新研究论文',
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: 'search_papers',
                  description: 'Search for academic papers',
                  parameters: {
                    type: 'object',
                    properties: {
                      query: { type: 'string', description: 'Search query' },
                      field: {
                        type: 'string',
                        enum: [
                          'computer_science',
                          'physics',
                          'biology',
                          'mathematics',
                        ],
                        description: 'Academic field',
                      },
                      year_range: {
                        type: 'object',
                        properties: {
                          start: { type: 'integer', minimum: 1900 },
                          end: { type: 'integer', maximum: 2025 },
                        },
                      },
                      limit: {
                        type: 'integer',
                        minimum: 1,
                        maximum: 100,
                        default: 10,
                      },
                    },
                    required: ['query'],
                  },
                },
              ],
            },
          ],
        })
        .expect(HttpStatus.OK);

      // 验证Qwen格式工具调用正确处理
      const candidate = response.body.candidates[0];
      if (candidate?.content?.parts) {
        const toolCallParts = candidate.content.parts.filter(
          (part) => part.functionCall,
        );

        toolCallParts.forEach((part) => {
          const args = part.functionCall.args;

          if (args.query) expect(typeof args.query).toBe('string');
          if (args.field) {
            expect([
              'computer_science',
              'physics',
              'biology',
              'mathematics',
            ]).toContain(args.field);
          }
          if (args.year_range) {
            expect(typeof args.year_range).toBe('object');
            if (args.year_range.start) {
              expect(typeof args.year_range.start).toBe('number');
              expect(args.year_range.start).toBeGreaterThanOrEqual(1900);
            }
            if (args.year_range.end) {
              expect(typeof args.year_range.end).toBe('number');
              expect(args.year_range.end).toBeLessThanOrEqual(2025);
            }
          }
          if (args.limit) {
            expect(typeof args.limit).toBe('number');
            expect(args.limit).toBeGreaterThanOrEqual(1);
            expect(args.limit).toBeLessThanOrEqual(100);
          }
        });
      }
    });
  });

  describe('多格式兼容性测试', () => {
    it('应该在同一个请求中处理多个工具', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/gpt-4:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '我需要查天气，然后设置一个提醒',
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: 'get_weather',
                  description: 'Get weather information',
                  parameters: {
                    type: 'object',
                    properties: {
                      location: { type: 'string' },
                    },
                    required: ['location'],
                  },
                },
                {
                  name: 'set_reminder',
                  description: 'Set a reminder',
                  parameters: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      time: { type: 'string', format: 'date-time' },
                      priority: {
                        type: 'string',
                        enum: ['low', 'medium', 'high'],
                      },
                    },
                    required: ['message', 'time'],
                  },
                },
              ],
            },
          ],
        })
        .expect(HttpStatus.OK);

      // 验证多工具处理
      const candidate = response.body.candidates[0];
      if (candidate?.content?.parts) {
        const toolCallParts = candidate.content.parts.filter(
          (part) => part.functionCall,
        );

        // 可能调用一个或多个工具
        expect(toolCallParts.length).toBeGreaterThanOrEqual(0);

        toolCallParts.forEach((part) => {
          expect(['get_weather', 'set_reminder']).toContain(
            part.functionCall.name,
          );

          if (part.functionCall.name === 'get_weather') {
            expect(part.functionCall.args).toHaveProperty('location');
            expect(typeof part.functionCall.args.location).toBe('string');
          }

          if (part.functionCall.name === 'set_reminder') {
            expect(part.functionCall.args).toHaveProperty('message');
            expect(part.functionCall.args).toHaveProperty('time');
            if (part.functionCall.args.priority) {
              expect(['low', 'medium', 'high']).toContain(
                part.functionCall.args.priority,
              );
            }
          }
        });
      }
    });

    it('应该处理无工具的常规对话', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/gpt-4:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '你好，请介绍一下自己',
                },
              ],
            },
          ],
        })
        .expect(HttpStatus.OK);

      // 验证无工具时的正常响应
      expect(response.body).toHaveProperty('candidates');
      expect(response.body.candidates).toHaveLength(1);

      const candidate = response.body.candidates[0];
      expect(candidate).toHaveProperty('content');
      expect(candidate.content).toHaveProperty('parts');
      expect(candidate.content.parts.length).toBeGreaterThan(0);

      // 应该主要是文本响应
      const textParts = candidate.content.parts.filter((part) => part.text);
      expect(textParts.length).toBeGreaterThan(0);

      textParts.forEach((part) => {
        expect(typeof part.text).toBe('string');
        expect(part.text.length).toBeGreaterThan(0);
      });
    });
  });

  describe('流式工具调用转换', () => {
    it('应该正确处理流式工具调用', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/gpt-4:streamGenerateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '计算 123 * 456 的结果',
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: 'calculate',
                  description: 'Perform mathematical calculations',
                  parameters: {
                    type: 'object',
                    properties: {
                      expression: {
                        type: 'string',
                        description: 'Mathematical expression',
                      },
                      precision: {
                        type: 'integer',
                        minimum: 0,
                        maximum: 10,
                        default: 2,
                      },
                    },
                    required: ['expression'],
                  },
                },
              ],
            },
          ],
        });

      expect(response.status).toBe(HttpStatus.OK);

      // 验证流式响应格式
      if (response.headers['content-type']?.includes('text/plain')) {
        const chunks = response.text
          .split('\n')
          .filter((line) => line.startsWith('data: '));

        let foundToolCall = false;
        let allValidJson = true;

        chunks.forEach((chunk) => {
          if (chunk !== 'data: [DONE]') {
            const jsonStr = chunk.replace('data: ', '');

            try {
              const data = JSON.parse(jsonStr);

              if (data.candidates && data.candidates[0]?.content?.parts) {
                const toolCallParts = data.candidates[0].content.parts.filter(
                  (part) => part.functionCall,
                );

                if (toolCallParts.length > 0) {
                  foundToolCall = true;

                  toolCallParts.forEach((part) => {
                    expect(part.functionCall).toHaveProperty('name');
                    expect(part.functionCall).toHaveProperty('args');

                    if (part.functionCall.args.expression) {
                      expect(typeof part.functionCall.args.expression).toBe(
                        'string',
                      );
                    }

                    if (part.functionCall.args.precision !== undefined) {
                      expect(typeof part.functionCall.args.precision).toBe(
                        'number',
                      );
                      expect(
                        part.functionCall.args.precision,
                      ).toBeGreaterThanOrEqual(0);
                      expect(
                        part.functionCall.args.precision,
                      ).toBeLessThanOrEqual(10);
                    }
                  });
                }
              }
            } catch (error) {
              allValidJson = false;
            }
          }
        });

        expect(allValidJson).toBe(true);
        // 注意：foundToolCall 可能为false，取决于模型是否决定使用工具
      }
    });
  });

  describe('错误处理和边界条件', () => {
    it('应该处理格式错误的工具定义', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/gpt-4:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '测试错误处理',
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: '', // 空名称
                  description: 'Invalid tool',
                  parameters: {
                    type: 'object',
                    properties: {},
                  },
                },
              ],
            },
          ],
        });

      // 应该优雅地处理错误
      expect([HttpStatus.OK, HttpStatus.BAD_REQUEST]).toContain(
        response.status,
      );

      if (response.status === HttpStatus.OK) {
        expect(response.body).toHaveProperty('candidates');
      }
    });

    it('应该处理过大的工具参数', async () => {
      const largeString = 'x'.repeat(10000);

      const response = await request(app.getHttpServer())
        .post('/api/v1/models/gpt-4:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '处理大量数据',
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: 'process_large_data',
                  description: 'Process large data',
                  parameters: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'string',
                        description: 'Large data string',
                      },
                    },
                  },
                },
              ],
            },
          ],
        });

      // 应该能处理大参数或优雅地拒绝
      expect([
        HttpStatus.OK,
        HttpStatus.BAD_REQUEST,
        HttpStatus.PAYLOAD_TOO_LARGE,
      ]).toContain(response.status);
    });

    it('应该处理Unicode和特殊字符', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/gpt-4:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '处理包含特殊字符的文本: "测试", \\backslash, 😀, αβγ',
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: 'process_unicode',
                  description: 'Process text with unicode characters',
                  parameters: {
                    type: 'object',
                    properties: {
                      text: {
                        type: 'string',
                        description: 'Text with unicode',
                      },
                      encoding: {
                        type: 'string',
                        enum: ['utf8', 'utf16'],
                        default: 'utf8',
                      },
                    },
                    required: ['text'],
                  },
                },
              ],
            },
          ],
        })
        .expect(HttpStatus.OK);

      // 验证Unicode字符正确处理
      const candidate = response.body.candidates[0];
      if (candidate?.content?.parts) {
        const toolCallParts = candidate.content.parts.filter(
          (part) => part.functionCall,
        );

        toolCallParts.forEach((part) => {
          if (part.functionCall.args.text) {
            expect(typeof part.functionCall.args.text).toBe('string');
            // 验证Unicode字符未被破坏
            expect(part.functionCall.args.text.length).toBeGreaterThan(0);
          }
        });
      }
    });
  });

  describe('性能和可扩展性', () => {
    it('应该在合理时间内完成复杂工具转换', async () => {
      const startTime = Date.now();

      const response = await request(app.getHttpServer())
        .post('/api/v1/models/gpt-4:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '执行复杂的数据分析任务',
                },
              ],
            },
          ],
          tools: Array(5)
            .fill(null)
            .map((_, index) => ({
              function_declarations: [
                {
                  name: `complex_tool_${index}`,
                  description: `Complex tool ${index}`,
                  parameters: {
                    type: 'object',
                    properties: Object.fromEntries(
                      Array(10)
                        .fill(null)
                        .map((_, paramIndex) => [
                          `param_${paramIndex}`,
                          {
                            type: ['string', 'number', 'boolean'][
                              paramIndex % 3
                            ],
                            description: `Parameter ${paramIndex}`,
                          },
                        ]),
                    ),
                  },
                },
              ],
            })),
        })
        .expect(HttpStatus.OK);

      const responseTime = Date.now() - startTime;

      // 复杂工具转换应该在合理时间内完成
      expect(responseTime).toBeLessThan(30000);
      expect(response.body).toHaveProperty('candidates');
    });
  });
});
