import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { Readable } from 'stream';

describe('StreamingResponse (e2e)', () => {
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

  it('should stream a complete response', async () => {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Tell me a joke' }],
        },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/v1/models/gemini-pro/streamGenerateContent')
      .send(requestBody)
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);

    // Collect all chunks
    const chunks: string[] = [];
    await new Promise((resolve) => {
      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk.toString());
      });
      response.on('end', resolve);
    });

    // Should have received multiple chunks
    expect(chunks.length).toBeGreaterThan(0);

    // Verify SSE format
    chunks.forEach((chunk) => {
      expect(chunk.startsWith('data: ')).toBe(true);
      expect(chunk.endsWith('\n\n')).toBe(true);
    });

    // Parse chunks and verify they form a complete response
    const parsedChunks = chunks
      .filter((chunk) => chunk.trim() !== '')
      .map((chunk) => JSON.parse(chunk.slice(6))); // Remove 'data: ' prefix

    expect(parsedChunks.length).toBeGreaterThan(0);
    expect(parsedChunks[0]).toHaveProperty('candidates');
  });

  it('should handle streaming with large response', async () => {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Write a detailed explanation about quantum computing' },
          ],
        },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/v1/models/gemini-pro/streamGenerateContent')
      .send(requestBody)
      .expect(200);

    // Stream should continue for a reasonable time
    const chunks: string[] = [];
    const startTime = Date.now();

    await new Promise((resolve) => {
      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk.toString());
      });
      response.on('end', resolve);
    });

    const duration = Date.now() - startTime;
    expect(duration).toBeGreaterThan(100); // Should take some time to stream
    expect(chunks.length).toBeGreaterThan(5); // Should have multiple chunks
  });

  it('should handle streaming interruption gracefully', async () => {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Count to 100 very slowly' }],
        },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/v1/models/gemini-pro/streamGenerateContent')
      .send(requestBody)
      .expect(200);

    // Read only first few chunks then abort
    let chunkCount = 0;
    await new Promise((resolve) => {
      response.on('data', (chunk: Buffer) => {
        chunkCount++;
        if (chunkCount >= 3) {
          response.destroy();
          resolve(true);
        }
      });
      response.on('end', resolve);
      response.on('error', resolve);
    });

    // Should have received some chunks before interruption
    expect(chunkCount).toBeGreaterThan(0);
  });

  it('should maintain conversation context in streaming mode', async () => {
    const conversation = [
      { role: 'user', text: 'My favorite color is blue.' },
      { role: 'model', text: "I'll remember that you like blue!" },
      { role: 'user', text: 'What did I just tell you about my preferences?' },
    ];

    // First exchange
    const firstResponse = await request(app.getHttpServer())
      .post('/v1/models/gemini-pro/streamGenerateContent')
      .send({
        contents: [
          {
            role: 'user',
            parts: [{ text: conversation[0].text }],
          },
        ],
      })
      .expect(200);

    // Collect streaming response
    const chunks1: string[] = [];
    await new Promise((resolve) => {
      firstResponse.on('data', (chunk: Buffer) => {
        chunks1.push(chunk.toString());
      });
      firstResponse.on('end', resolve);
    });

    // Parse the complete response
    const modelResponse = JSON.parse(chunks1[chunks1.length - 1].slice(6));
    conversation[1].text = modelResponse.candidates[0].content.parts[0].text;

    // Follow-up question
    const secondResponse = await request(app.getHttpServer())
      .post('/v1/models/gemini-pro/streamGenerateContent')
      .send({
        contents: [
          {
            role: 'user',
            parts: [{ text: conversation[0].text }],
          },
          {
            role: 'model',
            parts: [{ text: conversation[1].text }],
          },
          {
            role: 'user',
            parts: [{ text: conversation[2].text }],
          },
        ],
      })
      .expect(200);

    const chunks2: string[] = [];
    await new Promise((resolve) => {
      secondResponse.on('data', (chunk: Buffer) => {
        chunks2.push(chunk.toString());
      });
      secondResponse.on('end', resolve);
    });

    const finalResponse = JSON.parse(chunks2[chunks2.length - 1].slice(6));
    expect(
      finalResponse.candidates[0].content.parts[0].text.toLowerCase(),
    ).toMatch(/blue/);
  });
});
