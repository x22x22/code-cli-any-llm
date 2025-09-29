import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import supertest, { SuperTest, Test as SupertestTest } from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Gemini API Gateway Comprehensive Tests', () => {
  let app: INestApplication;
  let request: ReturnType<typeof supertest>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    request = supertest(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  const MODEL = 'gemini-2.5-pro';

  describe('Health Check', () => {
    it('should return health status', async () => {
      await request
        .get('/api/v1/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status');
          expect(typeof res.body.status).toBe('string');
        });
    });
  });

  describe('Basic Conversation', () => {
    it('should handle basic conversation', async () => {
      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: '你好，请简单介绍一下你自己' }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 500,
        },
      };

      await request
        .post(`/api/v1/gemini/models/${MODEL}:generateContent`)
        .send(requestBody)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('candidates');
          expect(Array.isArray(res.body.candidates)).toBe(true);
          expect(res.body.candidates.length).toBeGreaterThan(0);
          expect(res.body.candidates[0]).toHaveProperty('content');
          expect(res.body.candidates[0].content).toHaveProperty('parts');
          expect(Array.isArray(res.body.candidates[0].content.parts)).toBe(
            true,
          );
          expect(res.body.candidates[0].content.parts[0]).toHaveProperty(
            'text',
          );
        });
    });
  });

  describe('Streaming Conversation', () => {
    it('should handle streaming conversation', async () => {
      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: '请用三个词描述人工智能的未来' }],
          },
        ],
      };

      await request
        .post(`/api/v1/gemini/models/${MODEL}:streamGenerateContent`)
        .send(requestBody)
        .expect(200)
        .expect('content-type', /text\/event-stream/)
        .expect((res) => {
          // Check that response is a stream
          expect(res.text).toContain('data:');
        });
    });
  });

  describe('System Instruction', () => {
    it('should handle system instruction', async () => {
      const requestBody = {
        systemInstruction:
          '你是一个专业的Python程序员，请用简洁的代码回答问题。',
        contents: [
          {
            role: 'user',
            parts: [{ text: '如何用Python实现一个快速排序？' }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 500,
        },
      };

      await request
        .post(`/api/v1/gemini/models/${MODEL}:generateContent`)
        .send(requestBody)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('candidates');
          expect(res.body.candidates.length).toBeGreaterThan(0);
        });
    });
  });

  describe('Multi-turn Conversation', () => {
    it('should maintain context in multi-turn conversation', async () => {
      // First turn
      const firstRequestBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: '你好，我叫张三' }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 500,
        },
      };

      const firstResponse = await request
        .post(`/api/v1/gemini/models/${MODEL}:generateContent`)
        .send(firstRequestBody)
        .expect(200);

      const aiReply = firstResponse.body.candidates[0].content.parts[0].text;

      // Second turn with context
      const secondRequestBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: '你好，我叫张三' }],
          },
          {
            role: 'model',
            parts: [{ text: aiReply }],
          },
          {
            role: 'user',
            parts: [{ text: '我叫什么名字？' }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 10,
        },
      };

      await request
        .post(`/api/v1/gemini/models/${MODEL}:generateContent`)
        .send(secondRequestBody)
        .expect(200)
        .expect((res) => {
          expect(res.body.candidates[0].content.parts[0].text).toContain(
            '张三',
          );
        });
    });
  });

  describe('Tool Calling', () => {
    it('should handle tool declarations', async () => {
      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: '北京现在的天气怎么样？' }],
          },
        ],
        tools: [
          {
            functionDeclarations: [
              {
                name: 'get_weather',
                description: '获取指定城市的天气信息',
                parameters: {
                  type: 'object',
                  properties: {
                    city: {
                      type: 'string',
                      description: '城市名称',
                    },
                  },
                  required: ['city'],
                },
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 500,
        },
      };

      await request
        .post(`/api/v1/gemini/models/${MODEL}:generateContent`)
        .send(requestBody)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('candidates');
          // Should handle tool declarations without error
        });
    });
  });

  describe('Error Handling', () => {
    it('should validate required fields', async () => {
      const requestBody = {
        // Missing required 'contents' field
        generationConfig: {
          temperature: 0.7,
        },
      };

      await request
        .post(`/api/v1/gemini/models/${MODEL}:generateContent`)
        .send(requestBody)
        .expect(400);
    });

    it('should handle invalid model', async () => {
      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }],
          },
        ],
      };

      await request
        .post('/api/v1/gemini/models/invalid-model:generateContent')
        .send(requestBody)
        .expect(404);
    });
  });

  describe('Generation Config', () => {
    it('should respect generation config', async () => {
      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: '请详细解释量子计算' }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 50,
          temperature: 0.7,
          topP: 0.9,
        },
      };

      await request
        .post(`/api/v1/gemini/models/${MODEL}:generateContent`)
        .send(requestBody)
        .expect(200)
        .expect((res) => {
          const responseText = res.body.candidates[0].content.parts[0].text;
          // Response should be relatively short due to maxOutputTokens
          expect(responseText.length).toBeLessThan(200);
        });
    });
  });
});
