import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { AppModule } from '../../src/app.module';

describe('GenerateContentController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/v1/models/{model}:generateContent (POST) - should return Gemini format response', async () => {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello, how are you?' }],
        },
      ],
    };

    await supertest(app.getHttpServer())
      .post('/api/v1/v1/models/gemini-pro/generateContent')
      .send(requestBody)
      .expect(200)
      .expect((res) => {
        // Response should follow Gemini API format
        expect(res.body).toHaveProperty('candidates');
        expect(Array.isArray(res.body.candidates)).toBe(true);
        expect(res.body.candidates.length).toBeGreaterThan(0);
        expect(res.body.candidates[0]).toHaveProperty('content');
        expect(res.body.candidates[0].content).toHaveProperty('role');
        expect(res.body.candidates[0].content).toHaveProperty('parts');
      });
  });

  it('/v1/models/{model}:generateContent (POST) - should handle tools', async () => {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'What is the weather in Boston?' }],
        },
      ],
      tools: [
        {
          functionDeclarations: [
            {
              name: 'get_weather',
              description: 'Get weather information for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city and state, e.g. San Francisco, CA',
                  },
                },
                required: ['location'],
              },
            },
          ],
        },
      ],
    };

    await supertest(app.getHttpServer())
      .post('/api/v1/v1/models/gemini-pro/generateContent')
      .send(requestBody)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('candidates');
        // Should handle tool declarations without error
      });
  });

  it('/v1/models/{model}:generateContent (POST) - should validate required fields', async () => {
    const requestBody = {
      // Missing required 'contents' field
      generationConfig: {
        temperature: 0.7,
      },
    };

    await supertest(app.getHttpServer())
      .post('/api/v1/v1/models/gemini-pro/generateContent')
      .send(requestBody)
      .expect(400);
  });

  it('/v1/models/{model}:generateContent (POST) - should handle system instruction', async () => {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Help me write a poem' }],
        },
      ],
      systemInstruction: 'You are a helpful poetry assistant.',
    };

    await supertest(app.getHttpServer())
      .post('/api/v1/v1/models/gemini-pro/generateContent')
      .send(requestBody)
      .expect(200);
  });
});