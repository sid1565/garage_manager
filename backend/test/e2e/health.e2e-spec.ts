import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { buildOpenApiDocument } from '../../src/app.setup';
import { createTestApp } from './create-test-app';

describe('Health (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health is public and reports the database as up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.data).toEqual({ database: 'up' });
  });

  it('unknown routes return the standard error envelope', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, errorCode: 'NOT_FOUND' });
  });

  it('the OpenAPI document builds (catches Swagger metadata errors that crash boot)', () => {
    const doc = buildOpenApiDocument(app);
    expect(Object.keys(doc.paths)).toContain('/api/v1/auth/login');
  });
});
