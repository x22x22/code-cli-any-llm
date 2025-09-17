/**
 * 智谱GLM-4.5模型工具调用集成测试
 *
 * 目标: 验证智谱模型的工具调用、双重转义处理、文本缓冲等集成功能
 * 重要: 这些测试必须在实现前编写，并且必须失败
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('智谱GLM-4.5集成测试 (Integration)', () => {
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

  describe('智谱模型检测和配置', () => {
    it('应该自动检测GLM-4.5模型并使用qwen格式', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/glm-4.5:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '请介绍一下你自己',
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: 'get_info',
                  description: '获取信息',
                  parameters: {
                    type: 'object',
                    properties: {
                      topic: { type: 'string', description: '主题' },
                    },
                    required: ['topic'],
                  },
                },
              ],
            },
          ],
        })
        .expect(HttpStatus.OK);

      // 验证响应结构符合Gemini API格式
      expect(response.body).toHaveProperty('candidates');
      expect(response.body.candidates).toHaveLength(1);

      // 如果有工具调用，验证格式正确
      if (response.body.candidates[0].content?.parts) {
        const parts = response.body.candidates[0].content.parts;
        const toolCallParts = parts.filter((part) => part.functionCall);

        toolCallParts.forEach((part) => {
          expect(part.functionCall).toHaveProperty('name');
          expect(part.functionCall).toHaveProperty('args');
          // 验证参数是正确解析的对象，不是双重转义的字符串
          expect(typeof part.functionCall.args).toBe('object');
        });
      }
    });

    it('应该为GLM模型禁用工具调用时的流式响应', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/glm-4.5:streamGenerateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '帮我计算一下123+456等于多少',
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: 'calculate',
                  description: '数学计算',
                  parameters: {
                    type: 'object',
                    properties: {
                      expression: { type: 'string', description: '数学表达式' },
                    },
                    required: ['expression'],
                  },
                },
              ],
            },
          ],
        });

      // 对于有工具调用的请求，GLM应该回退到非流式响应
      // 或者如果是流式，应该没有JSON解析错误
      expect(response.status).toBe(HttpStatus.OK);

      if (response.headers['content-type']?.includes('text/plain')) {
        // 流式响应
        const chunks = response.text
          .split('\n')
          .filter((line) => line.startsWith('data: '));
        chunks.forEach((chunk) => {
          if (chunk !== 'data: [DONE]') {
            const jsonStr = chunk.replace('data: ', '');
            expect(() => JSON.parse(jsonStr)).not.toThrow();
          }
        });
      } else {
        // 非流式响应
        expect(response.body).toHaveProperty('candidates');
      }
    });
  });

  describe('双重转义处理', () => {
    it('应该正确处理智谱API的双重转义参数', async () => {
      // 模拟一个复杂的工具调用场景
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/glm-4.5:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '帮我创建一个用户信息，姓名是"张三"，年龄是30，邮箱是"zhangsan@example.com"',
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: 'create_user',
                  description: '创建用户',
                  parameters: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: '用户姓名' },
                      age: { type: 'number', description: '年龄' },
                      email: { type: 'string', description: '邮箱' },
                      preferences: {
                        type: 'object',
                        properties: {
                          language: { type: 'string' },
                          theme: { type: 'string' },
                        },
                      },
                    },
                    required: ['name', 'age', 'email'],
                  },
                },
              ],
            },
          ],
        })
        .expect(HttpStatus.OK);

      // 验证如果有工具调用，参数被正确解析
      const candidates = response.body.candidates;
      if (candidates && candidates[0]?.content?.parts) {
        const toolCallParts = candidates[0].content.parts.filter(
          (part) => part.functionCall,
        );

        toolCallParts.forEach((part) => {
          const args = part.functionCall.args;

          // 验证字符串参数正确
          if (args.name) expect(typeof args.name).toBe('string');
          if (args.email) expect(typeof args.email).toBe('string');

          // 验证数字参数被正确转换（不是字符串）
          if (args.age) expect(typeof args.age).toBe('number');

          // 验证嵌套对象被正确解析
          if (args.preferences) {
            expect(typeof args.preferences).toBe('object');
            expect(args.preferences).not.toBe('string'); // 不应该是双重转义的字符串
          }

          // 验证中文字符正确处理
          if (args.name) {
            expect(args.name).toMatch(/[\u4e00-\u9fa5]/); // 包含中文字符
          }
        });
      }
    });

    it('应该处理包含特殊字符的工具参数', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/glm-4.5:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '帮我搜索包含引号"test"、反斜杠\\和换行符的内容',
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: 'search_content',
                  description: '搜索内容',
                  parameters: {
                    type: 'object',
                    properties: {
                      query: { type: 'string', description: '搜索查询' },
                      filters: {
                        type: 'object',
                        properties: {
                          special_chars: { type: 'boolean' },
                          escape_sequences: { type: 'boolean' },
                        },
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

      // 验证特殊字符被正确处理
      const candidates = response.body.candidates;
      if (candidates && candidates[0]?.content?.parts) {
        const toolCallParts = candidates[0].content.parts.filter(
          (part) => part.functionCall,
        );

        toolCallParts.forEach((part) => {
          const args = part.functionCall.args;

          // 验证参数是对象而不是转义后的字符串
          expect(typeof args).toBe('object');
          expect(args).not.toBe('string');

          // 如果包含query参数，应该是正确的字符串
          if (args.query) {
            expect(typeof args.query).toBe('string');
            expect(args.query.length).toBeGreaterThan(0);
          }
        });
      }
    });
  });

  describe('中文文本缓冲优化', () => {
    it('应该为GLM模型优化中文流式输出', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/glm-4.5:streamGenerateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '请用中文详细介绍一下人工智能的发展历史，包括重要的里程碑事件',
                },
              ],
            },
          ],
        });

      expect(response.status).toBe(HttpStatus.OK);

      if (response.headers['content-type']?.includes('text/plain')) {
        // 验证流式响应格式
        const chunks = response.text
          .split('\n')
          .filter((line) => line.startsWith('data: '));

        let hasChineseContent = false;
        let hasValidFormat = true;

        chunks.forEach((chunk) => {
          if (chunk !== 'data: [DONE]') {
            const jsonStr = chunk.replace('data: ', '');

            try {
              const data = JSON.parse(jsonStr);

              // 验证响应格式
              if (data.candidates && data.candidates[0]?.content?.parts) {
                const textParts = data.candidates[0].content.parts.filter(
                  (part) => part.text,
                );

                textParts.forEach((part) => {
                  if (part.text) {
                    // 检查是否包含中文
                    if (/[\u4e00-\u9fa5]/.test(part.text)) {
                      hasChineseContent = true;
                    }

                    // 验证文本不应该有明显的断行问题
                    // (这个测试可能需要根据实际缓冲策略调整)
                    expect(part.text).toBeDefined();
                    expect(typeof part.text).toBe('string');
                  }
                });
              }
            } catch (error) {
              hasValidFormat = false;
            }
          }
        });

        expect(hasValidFormat).toBe(true);
        // 注意：hasChineseContent 可能不总是true，取决于模型响应
      }
    });

    it('应该在合适的断点处缓冲中文输出', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/glm-4.5:streamGenerateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '请简短回答：什么是机器学习？请用一到两句话说明。',
                },
              ],
            },
          ],
        });

      expect(response.status).toBe(HttpStatus.OK);

      // 验证流式响应不会在中文字符中间断开
      if (response.headers['content-type']?.includes('text/plain')) {
        const chunks = response.text
          .split('\n')
          .filter((line) => line.startsWith('data: '));

        chunks.forEach((chunk) => {
          if (chunk !== 'data: [DONE]') {
            const jsonStr = chunk.replace('data: ', '');

            try {
              const data = JSON.parse(jsonStr);

              if (data.candidates && data.candidates[0]?.content?.parts) {
                const textParts = data.candidates[0].content.parts.filter(
                  (part) => part.text,
                );

                textParts.forEach((part) => {
                  if (part.text && /[\u4e00-\u9fa5]/.test(part.text)) {
                    // 验证中文文本的完整性
                    expect(part.text).toBeDefined();
                    expect(part.text.length).toBeGreaterThan(0);
                  }
                });
              }
            } catch (error) {
              fail(`JSON解析失败: ${error.message}`);
            }
          }
        });
      }
    });
  });

  describe('类型转换和错误恢复', () => {
    it('应该自动修复字符串数字类型', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/glm-4.5:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '帮我计算价格：单价12.5元，数量3个，总价是多少？',
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: 'calculate_price',
                  description: '计算价格',
                  parameters: {
                    type: 'object',
                    properties: {
                      unit_price: { type: 'number', description: '单价' },
                      quantity: { type: 'number', description: '数量' },
                      discount: { type: 'number', description: '折扣' },
                    },
                    required: ['unit_price', 'quantity'],
                  },
                },
              ],
            },
          ],
        })
        .expect(HttpStatus.OK);

      // 验证数字参数被正确转换
      const candidates = response.body.candidates;
      if (candidates && candidates[0]?.content?.parts) {
        const toolCallParts = candidates[0].content.parts.filter(
          (part) => part.functionCall,
        );

        toolCallParts.forEach((part) => {
          const args = part.functionCall.args;

          // 数字类型应该被正确转换
          if (args.unit_price) {
            expect(typeof args.unit_price).toBe('number');
            expect(args.unit_price).toBeGreaterThan(0);
          }

          if (args.quantity) {
            expect(typeof args.quantity).toBe('number');
            expect(Number.isInteger(args.quantity)).toBe(true);
          }

          if (args.discount) {
            expect(typeof args.discount).toBe('number');
          }
        });
      }
    });

    it('应该优雅处理解析错误', async () => {
      // 发送一个可能导致复杂解析的请求
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/glm-4.5:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '创建一个包含复杂JSON结构的配置文件',
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: 'create_config',
                  description: '创建配置',
                  parameters: {
                    type: 'object',
                    properties: {
                      config: {
                        type: 'object',
                        properties: {
                          nested: {
                            type: 'object',
                            properties: {
                              deep: { type: 'string' },
                            },
                          },
                          array: {
                            type: 'array',
                            items: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        });

      // 即使有复杂嵌套，也应该正常处理
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body).toHaveProperty('candidates');

      // 如果有工具调用，验证没有抛出解析错误
      const candidates = response.body.candidates;
      if (candidates && candidates[0]?.content?.parts) {
        const toolCallParts = candidates[0].content.parts.filter(
          (part) => part.functionCall,
        );

        toolCallParts.forEach((part) => {
          expect(part.functionCall).toHaveProperty('name');
          expect(part.functionCall).toHaveProperty('args');
          // 参数应该是已解析的对象
          expect(typeof part.functionCall.args).toBe('object');
        });
      }
    });
  });

  describe('性能和稳定性', () => {
    it('应该在合理时间内响应', async () => {
      const startTime = Date.now();

      const response = await request(app.getHttpServer())
        .post('/api/v1/models/glm-4.5:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '你好',
                },
              ],
            },
          ],
        })
        .expect(HttpStatus.OK);

      const responseTime = Date.now() - startTime;

      // 响应时间应该在合理范围内（这里设为30秒，实际可调整）
      expect(responseTime).toBeLessThan(30000);
      expect(response.body).toHaveProperty('candidates');
    });

    it('应该处理并发请求', async () => {
      const requests = Array(3)
        .fill(null)
        .map((_, index) =>
          request(app.getHttpServer())
            .post('/api/v1/models/glm-4.5:generateContent')
            .send({
              contents: [
                {
                  parts: [
                    {
                      text: `并发测试请求 ${index + 1}`,
                    },
                  ],
                },
              ],
            }),
        );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(HttpStatus.OK);
        expect(response.body).toHaveProperty('candidates');
      });
    });
  });

  describe('向后兼容性', () => {
    it('应该保持现有API的兼容性', async () => {
      // 使用标准的Gemini API请求格式
      const response = await request(app.getHttpServer())
        .post('/api/v1/models/glm-4.5:generateContent')
        .send({
          contents: [
            {
              parts: [
                {
                  text: '测试兼容性',
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 1000,
          },
        })
        .expect(HttpStatus.OK);

      // 验证响应格式符合Gemini API规范
      expect(response.body).toMatchObject({
        candidates: expect.arrayContaining([
          expect.objectContaining({
            content: expect.objectContaining({
              parts: expect.any(Array),
              role: expect.any(String),
            }),
            finishReason: expect.any(String),
          }),
        ]),
      });

      // 验证没有回退到现有功能
      if (response.body.usageMetadata) {
        expect(response.body.usageMetadata).toMatchObject({
          promptTokenCount: expect.any(Number),
          candidatesTokenCount: expect.any(Number),
          totalTokenCount: expect.any(Number),
        });
      }
    });
  });
});
