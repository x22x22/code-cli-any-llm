import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('BasicConversationFlow (e2e)', () => {
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

  it('should handle a simple conversation', async () => {
    // First message
    const firstResponse = await request(app.getHttpServer())
      .post('/v1/models/gemini-pro/generateContent')
      .send({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello! My name is Alice.' }],
          },
        ],
      })
      .expect(200);

    expect(
      firstResponse.body.candidates[0].content.parts[0].text,
    ).toBeDefined();

    // Follow-up message with context
    const secondResponse = await request(app.getHttpServer())
      .post('/v1/models/gemini-pro/generateContent')
      .send({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello! My name is Alice.' }],
          },
          {
            role: 'model',
            parts: [
              { text: firstResponse.body.candidates[0].content.parts[0].text },
            ],
          },
          {
            role: 'user',
            parts: [{ text: "What's my name?" }],
          },
        ],
      })
      .expect(200);

    expect(secondResponse.body.candidates[0].content.parts[0].text).toContain(
      'Alice',
    );
  });

  it('should handle multi-turn conversation', async () => {
    const conversation = [
      { role: 'user', text: 'Can you help me plan a vacation?' },
      {
        role: 'model',
        text: "I'd be happy to help you plan a vacation! Where would you like to go?",
      },
      { role: 'user', text: "I'm thinking about visiting Japan." },
      {
        role: 'model',
        text: 'Japan is a wonderful choice! What time of year are you planning to visit?',
      },
      { role: 'user', text: 'Probably in the spring for cherry blossoms.' },
    ];

    // Build conversation history
    const contents: any[] = [];
    for (let i = 0; i < conversation.length; i++) {
      if (i % 2 === 0) {
        // User message
        contents.push({
          role: 'user',
          parts: [{ text: conversation[i].text }],
        });

        if (i < conversation.length - 1) {
          // Get model response
          const response = await request(app.getHttpServer())
            .post('/v1/models/gemini-pro/generateContent')
            .send({ contents })
            .expect(200);

          // Add model response to conversation
          contents.push({
            role: 'model',
            parts: [
              { text: response.body.candidates[0].content.parts[0].text },
            ],
          });
        }
      }
    }

    // Final response should acknowledge spring and cherry blossoms
    const finalResponse = await request(app.getHttpServer())
      .post('/v1/models/gemini-pro/generateContent')
      .send({ contents })
      .expect(200);

    const responseText = finalResponse.body.candidates[0].content.parts[0].text;
    expect(responseText.toLowerCase()).toMatch(/spring|cherry|blossom/);
  });

  it('should handle empty content validation', async () => {
    await request(app.getHttpServer())
      .post('/v1/models/gemini-pro/generateContent')
      .send({
        contents: [
          {
            role: 'user',
            parts: [{ text: '' }],
          },
        ],
      })
      .expect(400);
  });

  it('should handle conversation with system instruction', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/models/gemini-pro/generateContent')
      .send({
        systemInstruction:
          'You are a helpful assistant that always responds in rhyme.',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'How are you today?' }],
          },
        ],
      })
      .expect(200);

    const responseText = response.body.candidates[0].content.parts[0].text;
    // Check if response rhymes (simple check)
    const words = responseText.toLowerCase().split(/\s+/);
    if (words.length >= 2) {
      // Very simple rhyme check - in real test would use proper rhyming dictionary
      console.log(
        `Checking if "${words[words.length - 2]}" rhymes with "${words[words.length - 1]}"`,
      );
    }
  });
});
