import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { AppModule } from '../../src/app.module';
import { Readable } from 'stream';

describe('StreamGenerateContentController (e2e)', () => {
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

  it('/v1/models/{model}:streamGenerateContent (POST) - should return SSE stream', async () => {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Tell me a short story' }],
        },
      ],
    };

    const response = await supertest(app.getHttpServer())
      .post('/api/v1/gemini/models/gemini-pro:streamGenerateContent')
      .send(requestBody)
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);

    // Should receive SSE stream
    expect(response.headers['content-type']).toMatch(/text\/event-stream/);
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.headers['connection']).toBe('keep-alive');
  });

  it('/v1/models/{model}:streamGenerateContent (POST) - should stream multiple chunks', async () => {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Count from 1 to 5 slowly' }],
        },
      ],
    };

    const response = await supertest(app.getHttpServer())
      .post('/api/v1/gemini/models/gemini-pro:streamGenerateContent')
      .send(requestBody)
      .expect(200);

    // Collect streaming data
    const chunks: string[] = [];
    response.on('data', (chunk: Buffer) => {
      chunks.push(chunk.toString());
    });

    // Wait for stream to end
    await new Promise((resolve) => {
      response.on('end', resolve);
    });

    // Should have received multiple chunks
    expect(chunks.length).toBeGreaterThan(0);

    // Verify SSE format
    const firstChunk = chunks[0];
    expect(firstChunk).toMatch(/^data: /);
  });

  it('/v1/models/{model}:streamGenerateContent (POST) - should handle stream errors', async () => {
    const requestBody = {
      // Invalid request
      contents: 'invalid',
    };

    await supertest(app.getHttpServer())
      .post('/api/v1/gemini/models/gemini-pro:streamGenerateContent')
      .send(requestBody)
      .expect(400);
  });

  it('/v1/models/{model}:streamGenerateContent (POST) - should handle tool calls in stream', async () => {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Calculate 2 + 2' }],
        },
      ],
      tools: [
        {
          functionDeclarations: [
            {
              name: 'calculate',
              description: 'Perform mathematical calculations',
              parameters: {
                type: 'object',
                properties: {
                  expression: {
                    type: 'string',
                    description: 'Mathematical expression to calculate',
                  },
                },
                required: ['expression'],
              },
            },
          ],
        },
      ],
    };

    const response = await supertest(app.getHttpServer())
      .post('/api/v1/gemini/models/gemini-pro:streamGenerateContent')
      .send(requestBody)
      .expect(200);

    // Should handle streaming without error
    expect(response.headers['content-type']).toMatch(/text\/event-stream/);
  });
});
