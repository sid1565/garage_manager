import { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes, randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums';
import { PasswordService } from '../../src/modules/auth/services/password.service';
import { User } from '../../src/modules/staff/entities/user.entity';
import { createTestApp } from './create-test-app';

const API = '/api/v1';
const PASSWORD = 'Garage2026';
const uniqueEmail = (tag: string): string =>
  `${tag}-${Date.now()}-${randomBytes(3).toString('hex')}@test.local`;

/** Contract checks over HTTP: guards → validation → service (cross-cutting rules only). */
describe('API contract (e2e)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication['getHttpServer']>;
  let adminToken: string;
  let mechanicToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    const reg = await request(http)
      .post(`${API}/auth/register`)
      .send({
        garageName: 'Contract Garage',
        garagePhone: '+912012345678',
        name: 'Owner',
        email: uniqueEmail('contract'),
        password: PASSWORD,
      })
      .expect(201);
    adminToken = reg.body.data.accessToken;

    const mechanicEmail = uniqueEmail('mech');
    await app
      .get(DataSource)
      .getRepository(User)
      .save({
        garageId: reg.body.data.user.garageId,
        name: 'Mech',
        email: mechanicEmail,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        role: UserRole.MECHANIC,
      });
    const login = await request(http)
      .post(`${API}/auth/login`)
      .send({ email: mechanicEmail, password: PASSWORD })
      .expect(200);
    mechanicToken = login.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const asAdmin = (req: request.Test): request.Test =>
    req.set('Authorization', `Bearer ${adminToken}`);

  it('valid request passes guards + validation and is served (201)', async () => {
    const res = await asAdmin(
      request(http)
        .post(`${API}/customers`)
        .send({
          name: 'Amit Deshmukh',
          phone: '+919876543210',
          preferredChannels: ['SMS'],
        }),
    ).expect(201);
    expect(res.body.data).toMatchObject({ phone: '+919876543210', duplicate: false });
  });

  it('mechanic is denied a MANAGE section before validation runs (403)', async () => {
    const res = await request(http)
      .post(`${API}/customers`)
      .set('Authorization', `Bearer ${mechanicToken}`)
      .send({})
      .expect(403);
    expect(res.body.errorCode).toBe('FORBIDDEN_SECTION');
  });

  it('rejects malformed input with field details (400)', async () => {
    const res = await asAdmin(
      request(http)
        .post(`${API}/customers`)
        .send({
          name: 'A',
          phone: '9876543210',
          preferredChannels: ['FAX'],
        }),
    ).expect(400);
    expect(res.body.errorCode).toBe('VALIDATION_FAILED');
    const fields = (res.body.details as { field: string }[]).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'phone', 'each']));
  });

  it('rejects unknown body fields — client-sent totals never reach the service (mass assignment)', async () => {
    const res = await asAdmin(
      request(http)
        .post(`${API}/job-cards/${randomUUID()}/estimates`)
        .send({
          items: [{ itemType: 'PART', description: 'Pads', quantity: '2', unitPrice: '500.00' }],
          total: '1.00',
        }),
    ).expect(400);
    expect(JSON.stringify(res.body.details)).toContain('total');
  });

  it('validates money and quantity strings', async () => {
    await asAdmin(
      request(http)
        .post(`${API}/job-cards/${randomUUID()}/estimates`)
        .send({
          items: [{ itemType: 'PART', description: 'Pads', quantity: '0', unitPrice: '5.123' }],
        }),
    ).expect(400);
    await asAdmin(
      request(http)
        .post(`${API}/invoices/${randomUUID()}/payments`)
        .send({ amount: '0.00', method: 'CASH' }),
    ).expect(400);
  });

  it('whitelists sort keys per endpoint (no raw column names into the ORM)', async () => {
    const bad = encodeURIComponent(JSON.stringify({ passwordHash: 'ASC' }));
    await asAdmin(request(http).get(`${API}/customers?order=${bad}`)).expect(400);
    const notJson = encodeURIComponent('{not json');
    await asAdmin(request(http).get(`${API}/customers?order=${notJson}`)).expect(400);
    const good = encodeURIComponent(JSON.stringify({ name: 'ASC' }));
    await asAdmin(request(http).get(`${API}/customers?order=${good}&limit=10`)).expect(200);
    await asAdmin(request(http).get(`${API}/customers?limit=500`)).expect(400);
  });

  it('validates UUID path params (400) before hitting the service', async () => {
    const res = await asAdmin(request(http).get(`${API}/vehicles/not-a-uuid`)).expect(400);
    expect(res.body.errorCode).toBe('VALIDATION_FAILED');
  });

  it('accepts repeated / comma-separated status filters on the job board', async () => {
    await asAdmin(
      request(http).get(`${API}/job-cards?status=IN_PROGRESS&status=APPROVED&openOnly=true`),
    ).expect(200);
    await asAdmin(request(http).get(`${API}/job-cards?status=IN_PROGRESS,NOPE`)).expect(400);
  });

  it('only manual statuses are accepted on POST /status (AWAITING_APPROVAL comes from estimates)', async () => {
    await asAdmin(
      request(http).post(`${API}/job-cards/${randomUUID()}/status`).send({ status: 'APPROVED' }),
    ).expect(400);
  });

  it('PLATFORM_ADMIN-only routes are closed to garage admins', async () => {
    const res = await asAdmin(request(http).get(`${API}/admin/garages`)).expect(403);
    expect(res.body.errorCode).toBe('FORBIDDEN_SECTION');
  });

  it('upload rejects disallowed file types before the service (400)', async () => {
    await asAdmin(
      request(http)
        .post(`${API}/job-cards/${randomUUID()}/attachments`)
        .attach('file', Buffer.from('MZ fake exe'), {
          filename: 'virus.exe',
          contentType: 'application/x-msdownload',
        }),
    ).expect(400);
    await asAdmin(
      request(http)
        .post(`${API}/job-cards/${randomUUID()}/attachments`)
        .field('caption', 'Front pad')
        .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), {
          filename: 'pad.jpg',
          contentType: 'image/jpeg',
        }),
    ).expect(404); // valid file, but the job card doesn't exist
  });

  it('portal routes are public but require a valid link token (404, not 401)', async () => {
    const token = randomBytes(32).toString('base64url');
    const res = await request(http).get(`${API}/portal/${token}`).expect(404);
    expect(res.body.errorCode).toBe('LINK_NOT_FOUND');
    // A staff JWT does not open the portal.
    await asAdmin(request(http).get(`${API}/portal/${token}`)).expect(404);
  });
});
