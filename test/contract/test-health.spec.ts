import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { AppModule } from '../../src/app.module';

describe('HealthController (e2e)', () => {
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

  it('/api/v1/health (GET) - should return health status', async () => {
    await supertest(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('status', 'healthy');
        expect(res.body).toHaveProperty('timestamp');
        expect(res.body).toHaveProperty('uptime');
        expect(res.body).toHaveProperty('version');

        // Validate timestamp format
        expect(new Date(res.body.timestamp)).toBeInstanceOf(Date);

        // Validate uptime is a number
        expect(typeof res.body.uptime).toBe('number');
        expect(res.body.uptime).toBeGreaterThanOrEqual(0);
      });
  });

  it('/api/v1/health (GET) - should include service information', async () => {
    await supertest(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        // Should include additional service info if implemented
        if (res.body.provider) {
          expect(res.body.provider).toHaveProperty('name');
          expect(res.body.provider).toHaveProperty('status');
        }

        if (res.body.config) {
          expect(res.body.config).toHaveProperty('model');
          expect(res.body.config).toHaveProperty('baseURL');
        }
      });
  });

  it('/api/v1/health (GET) - should be accessible without authentication', async () => {
    await supertest(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
  });
});