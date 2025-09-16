import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('ToolCalling (e2e)', () => {
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

  it('should handle function declarations', async () => {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: "What's the weather like in London?" }],
        },
      ],
      tools: [
        {
          functionDeclarations: [
            {
              name: 'get_current_weather',
              description: 'Get the current weather for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city and state, e.g. San Francisco, CA',
                  },
                  unit: {
                    type: 'string',
                    enum: ['celsius', 'fahrenheit'],
                    default: 'celsius',
                  },
                },
                required: ['location'],
              },
            },
          ],
        },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/v1/models/gemini-pro/generateContent')
      .send(requestBody)
      .expect(200);

    // Should either call the function or ask for clarification
    const candidate = response.body.candidates[0];
    if (candidate.content.parts[0].functionCall) {
      expect(candidate.content.parts[0].functionCall.name).toBe(
        'get_current_weather',
      );
    } else {
      // Should ask for more information or acknowledge the request
      expect(candidate.content.parts[0].text).toBeDefined();
    }
  });

  it('should handle function responses', async () => {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: "What's the weather like in London?" }],
        },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'get_current_weather',
                args: {
                  location: 'London',
                  unit: 'celsius',
                },
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'get_current_weather',
                response: {
                  temperature: 15,
                  condition: 'Cloudy',
                  humidity: 80,
                },
              },
            },
          ],
        },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/v1/models/gemini-pro/generateContent')
      .send(requestBody)
      .expect(200);

    // Should provide a natural language response based on function result
    const text = response.body.candidates[0].content.parts[0].text;
    expect(text.toLowerCase()).toMatch(/15|cloudy|london/);
  });

  it('should handle multiple function calls in streaming mode', async () => {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Compare the weather in London, Paris, and Tokyo' }],
        },
      ],
      tools: [
        {
          functionDeclarations: [
            {
              name: 'get_current_weather',
              description: 'Get the current weather for a location',
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

    const response = await request(app.getHttpServer())
      .post('/v1/models/gemini-pro:streamGenerateContent')
      .send(requestBody)
      .expect(200);

    // Collect streaming chunks
    const chunks: string[] = [];
    await new Promise((resolve) => {
      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk.toString());
      });
      response.on('end', resolve);
    });

    // Parse chunks to look for function calls
    const functionCalls: any[] = [];
    chunks.forEach((chunk) => {
      if (chunk.startsWith('data: ') && chunk.trim() !== '') {
        try {
          const data = JSON.parse(chunk.slice(6));
          if (
            data.candidates &&
            data.candidates[0].content.parts[0].functionCall
          ) {
            functionCalls.push(
              data.candidates[0].content.parts[0].functionCall,
            );
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    });

    // Should have at least one function call
    expect(functionCalls.length).toBeGreaterThan(0);
  });

  it('should handle tool choice parameter', async () => {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Just say hello to me' }],
        },
      ],
      tools: [
        {
          functionDeclarations: [
            {
              name: 'get_current_weather',
              description: 'Get the current weather for a location',
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
      toolConfig: {
        functionCallingConfig: {
          mode: 'NONE',
        },
      },
    };

    const response = await request(app.getHttpServer())
      .post('/v1/models/gemini-pro/generateContent')
      .send(requestBody)
      .expect(200);

    // Should not call any function
    const parts = response.body.candidates[0].content.parts;
    expect(parts[0].text).toBeDefined();
    expect(parts[0].functionCall).toBeUndefined();
  });

  it('should validate function parameters', async () => {
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Get the weather' }],
        },
      ],
      tools: [
        {
          functionDeclarations: [
            {
              name: 'get_current_weather',
              description: 'Get the current weather for a location',
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

    const response = await request(app.getHttpServer())
      .post('/v1/models/gemini-pro/generateContent')
      .send(requestBody)
      .expect(200);

    // Should ask for the required location parameter
    const text = response.body.candidates[0].content.parts[0].text;
    expect(text.toLowerCase()).toMatch(/location|where|which city/);
  });
});
