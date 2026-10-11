import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import request, { Response } from 'supertest';
import { DataSource } from 'typeorm';
import { REFRESH_COOKIE_NAME } from '../../src/common/constants/auth.constants';
import { Section } from '../../src/common/decorators';
import { EUserModule, UserRole } from '../../src/common/enums';
import { PasswordService } from '../../src/modules/auth/services/password.service';
import { CurrentCustomerLink } from '../../src/modules/customer-links/decorators/current-customer-link.decorator';
import { CustomerLinkAccess } from '../../src/modules/customer-links/decorators/customer-link-access.decorator';
import { LinkPurpose } from '../../src/modules/customer-links/enums/link-purpose.enum';
import { ICustomerLinkContext } from '../../src/modules/customer-links/interfaces/customer-link-context.interface';
import { CustomerLinksModule } from '../../src/modules/customer-links/customer-links.module';
import { CustomerLinkService } from '../../src/modules/customer-links/services/customer-link.service';
import { Customer } from '../../src/modules/customers/entities/customer.entity';
import { Estimate } from '../../src/modules/estimates/entities/estimate.entity';
import { JobCard } from '../../src/modules/job-cards/entities/job-card.entity';
import { User } from '../../src/modules/staff/entities/user.entity';
import { Vehicle } from '../../src/modules/vehicles/entities/vehicle.entity';
import { FuelType } from '../../src/modules/vehicles/enums/fuel-type.enum';
import { createTestApp } from './create-test-app';

/** Test-only routes exercising guards that real feature routes will use (stage 4+). */
@Controller('probe')
class ProbeController {
  @Get('any')
  any(): { ok: true } {
    return { ok: true };
  }

  @Section(EUserModule.STAFF_MANAGE)
  @Get('staff-manage')
  staffManage(): { ok: true } {
    return { ok: true };
  }

  @CustomerLinkAccess(LinkPurpose.VIEW_JOB, LinkPurpose.APPROVE_ESTIMATE)
  @Get('portal/:token')
  view(@CurrentCustomerLink() link: ICustomerLinkContext): ICustomerLinkContext {
    return link;
  }

  @CustomerLinkAccess(LinkPurpose.APPROVE_ESTIMATE)
  @Post('portal/:token/approve')
  @HttpCode(200)
  approve(@CurrentCustomerLink() link: ICustomerLinkContext): ICustomerLinkContext {
    return link;
  }
}

const API = '/api/v1';
const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Garage2026';

const uniqueEmail = (tag: string): string =>
  `${tag}-${Date.now()}-${randomBytes(3).toString('hex')}@test.local`;

const refreshCookie = (res: Response): string | undefined => {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
};
const cookiePair = (setCookie: string): string => setCookie.split(';')[0];

const b64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('Auth foundation (e2e)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication['getHttpServer']>;
  let dataSource: DataSource;

  interface IRegistered {
    email: string;
    accessToken: string;
    cookie: string;
    userId: string;
    garageId: string;
  }

  const register = async (): Promise<IRegistered> => {
    const email = uniqueEmail('admin');
    const res = await request(http)
      .post(`${API}/auth/register`)
      .send({
        garageName: 'Speed Garage',
        garagePhone: '+912012345678',
        name: 'Ravi Patil',
        email,
        password: PASSWORD,
      })
      .expect(201);
    return {
      email,
      accessToken: res.body.data.accessToken,
      cookie: cookiePair(refreshCookie(res) as string),
      userId: res.body.data.user.id,
      garageId: res.body.data.user.garageId,
    };
  };

  const login = (email: string, password = PASSWORD, mobile = false): request.Test =>
    request(http)
      .post(`${API}/auth/login`)
      .set('x-client-type', mobile ? 'mobile' : 'web')
      .send({ email, password });

  const createStaff = async (
    garageId: string,
    role: UserRole,
    mustChangePassword = false,
  ): Promise<string> => {
    const email = uniqueEmail(role.toLowerCase());
    const passwordHash = await app.get(PasswordService).hash(PASSWORD);
    await dataSource
      .getRepository(User)
      .save({ garageId, name: 'Staff', email, passwordHash, role, mustChangePassword });
    return email;
  };

  beforeAll(async () => {
    app = await createTestApp([ProbeController], [CustomerLinksModule]); // DB_MIGRATIONS_RUN=true applies migrations
    http = app.getHttpServer();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('register & login', () => {
    it('AC-1.1 registers a garage, sets a hardened refresh cookie, no refresh token in the body', async () => {
      const res = await request(http)
        .post(`${API}/auth/register`)
        .send({
          garageName: 'Cookie Garage',
          garagePhone: '+912012345678',
          name: 'Owner',
          email: uniqueEmail('cookie'),
          password: PASSWORD,
        })
        .expect(201);
      expect(res.body.data).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
      expect(res.body.data.refreshToken).toBeUndefined();
      expect(res.body.data.user.role).toBe(UserRole.GARAGE_ADMIN);
      const cookie = refreshCookie(res) as string;
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    });

    it('AC-1.2 rejects a duplicate email regardless of case with 409', async () => {
      const { email } = await register();
      const res = await request(http)
        .post(`${API}/auth/register`)
        .send({
          garageName: 'Dup',
          garagePhone: '+912012345678',
          name: 'Dup',
          email: email.toUpperCase(),
          password: PASSWORD,
        })
        .expect(409);
      expect(res.body.errorCode).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('AC-1.3 rejects a weak password with 400', async () => {
      await request(http)
        .post(`${API}/auth/register`)
        .send({
          garageName: 'Weak',
          garagePhone: '+912012345678',
          name: 'Weak',
          email: uniqueEmail('weak'),
          password: 'abc',
        })
        .expect(400);
    });

    it('AC-2.1 logs in (web) and the token works on /auth/me', async () => {
      const { email } = await register();
      const res = await login(email).expect(200);
      expect(refreshCookie(res)).toBeDefined();
      const me = await request(http)
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${res.body.data.accessToken}`)
        .expect(200);
      expect(me.body.data.email).toBe(email);
    });

    it('AC-2.2 wrong password and unknown email return the identical 401', async () => {
      const { email } = await register();
      const wrong = await login(email, 'Wrong12345').expect(401);
      const unknown = await login(uniqueEmail('nobody')).expect(401);
      expect(wrong.body.errorCode).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.message).toBe(wrong.body.message);
      expect(unknown.body.errorCode).toBe(wrong.body.errorCode);
    });

    it('locks the account after 5 failures — even the right password gets the same 401', async () => {
      const { email, userId } = await register();
      for (let i = 0; i < 5; i += 1) await login(email, 'Wrong12345').expect(401);
      const locked = await login(email).expect(401);
      expect(locked.body.errorCode).toBe('INVALID_CREDENTIALS');

      await dataSource
        .getRepository(User)
        .update({ id: userId }, { lockedUntil: new Date(Date.now() - 1000) });
      await login(email).expect(200);
    });
  });

  describe('access token verification', () => {
    it('401 UNAUTHENTICATED without a token, 401 TOKEN_INVALID for garbage', async () => {
      const none = await request(http).get(`${API}/auth/me`).expect(401);
      expect(none.body.errorCode).toBe('UNAUTHENTICATED');
      const bad = await request(http)
        .get(`${API}/auth/me`)
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);
      expect(bad.body.errorCode).toBe('TOKEN_INVALID');
    });

    it('rejects alg=none and HS256-signed-with-public-key tokens (algorithm confusion)', async () => {
      const { userId, garageId } = await register();
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        sub: userId,
        role: UserRole.GARAGE_ADMIN,
        gid: garageId,
        sid: randomUUID(),
        iat: now,
        exp: now + 600,
        iss: process.env.JWT_ISSUER,
        aud: process.env.JWT_AUDIENCE,
      };
      const noneToken = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(claims)}.`;
      const unsigned = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}`;
      const publicPem = Buffer.from(process.env.JWT_PUBLIC_KEY as string, 'base64').toString();
      const hsToken = `${unsigned}.${createHmac('sha256', publicPem).update(unsigned).digest('base64url')}`;

      for (const token of [noneToken, hsToken]) {
        const res = await request(http)
          .get(`${API}/auth/me`)
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
        expect(res.body.errorCode).toBe('TOKEN_INVALID');
      }
    });

    it('AC-19.1 suspended garage → 403 even with a still-valid access token', async () => {
      const { accessToken, garageId } = await register();
      await dataSource.query(`UPDATE garages SET status = 'SUSPENDED' WHERE id = $1`, [garageId]);
      const res = await request(http)
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      expect(res.body.errorCode).toBe('GARAGE_SUSPENDED');
    });

    it('AC-3.5 deactivated user → 403 immediately, and refresh no longer works', async () => {
      const { accessToken, cookie, userId } = await register();
      await dataSource.query(`UPDATE users SET status = 'INACTIVE' WHERE id = $1`, [userId]);
      const res = await request(http)
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      expect(res.body.errorCode).toBe('ACCOUNT_INACTIVE');
      await request(http)
        .post(`${API}/auth/refresh`)
        .set('x-client-type', 'web')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(401);
    });
  });

  describe('refresh rotation & CSRF', () => {
    it('requires x-client-type and an allow-listed Origin for cookie refresh', async () => {
      const { cookie } = await register();
      const noHeader = await request(http)
        .post(`${API}/auth/refresh`)
        .set('Cookie', cookie)
        .expect(400);
      expect(noHeader.body.errorCode).toBe('CLIENT_TYPE_REQUIRED');
      const evil = await request(http)
        .post(`${API}/auth/refresh`)
        .set('x-client-type', 'web')
        .set('Origin', 'https://evil.example')
        .set('Cookie', cookie)
        .expect(403);
      expect(evil.body.errorCode).toBe('CSRF_REJECTED');
    });

    it('AC-2.4 / AC-2.5 rotates, and replaying the old token kills the whole session', async () => {
      const { cookie: first } = await register();
      const rotated = await request(http)
        .post(`${API}/auth/refresh`)
        .set('x-client-type', 'web')
        .set('Origin', ORIGIN)
        .set('Cookie', first)
        .expect(200);
      const second = cookiePair(refreshCookie(rotated) as string);
      expect(second).not.toBe(first);
      const newAccess = rotated.body.data.accessToken as string;
      await request(http)
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${newAccess}`)
        .expect(200);

      // Attacker replays the stolen (already rotated) token.
      const replay = await request(http)
        .post(`${API}/auth/refresh`)
        .set('x-client-type', 'web')
        .set('Origin', ORIGIN)
        .set('Cookie', first)
        .expect(401);
      expect(replay.body.errorCode).toBe('SESSION_REVOKED');

      // The legitimate successor and its access token are dead too.
      await request(http)
        .post(`${API}/auth/refresh`)
        .set('x-client-type', 'web')
        .set('Origin', ORIGIN)
        .set('Cookie', second)
        .expect(401);
      const dead = await request(http)
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${newAccess}`)
        .expect(401);
      expect(dead.body.errorCode).toBe('SESSION_REVOKED');
    });

    it('mobile clients get the refresh token in the body and refresh without cookies', async () => {
      const { email } = await register();
      const res = await login(email, PASSWORD, true).expect(200);
      expect(refreshCookie(res)).toBeUndefined();
      const token = res.body.data.refreshToken as string;
      expect(token).toHaveLength(43);
      const refreshed = await request(http)
        .post(`${API}/auth/refresh`)
        .set('x-client-type', 'mobile')
        .send({ refreshToken: token })
        .expect(200);
      expect(refreshed.body.data.refreshToken).not.toBe(token);
    });

    it('logout revokes the session: the access token stops working immediately', async () => {
      const { accessToken } = await register();
      const res = await request(http)
        .post(`${API}/auth/logout`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(refreshCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
      const after = await request(http)
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
      expect(after.body.errorCode).toBe('SESSION_REVOKED');
    });
  });

  describe('sections & temporary passwords', () => {
    it('SectionGuard: mechanic is denied STAFF_MANAGE, garage admin is allowed', async () => {
      const admin = await register();
      const mechanicEmail = await createStaff(admin.garageId, UserRole.MECHANIC);
      const mechanic = await login(mechanicEmail).expect(200);

      const denied = await request(http)
        .get(`${API}/probe/staff-manage`)
        .set('Authorization', `Bearer ${mechanic.body.data.accessToken}`)
        .expect(403);
      expect(denied.body.errorCode).toBe('FORBIDDEN_SECTION');
      await request(http)
        .get(`${API}/probe/staff-manage`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
    });

    it('temporary password blocks everything except me/change-password; changing it revokes other sessions', async () => {
      const admin = await register();
      const email = await createStaff(admin.garageId, UserRole.SERVICE_ADVISOR, true);
      const sessionA = await login(email).expect(200);
      const sessionB = await login(email).expect(200);
      const tokenA = sessionA.body.data.accessToken as string;
      expect(sessionA.body.data.user.mustChangePassword).toBe(true);

      const blocked = await request(http)
        .get(`${API}/probe/any`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403);
      expect(blocked.body.errorCode).toBe('PASSWORD_CHANGE_REQUIRED');
      await request(http)
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const changed = await request(http)
        .post(`${API}/auth/change-password`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ currentPassword: PASSWORD, newPassword: 'NewPass2026' })
        .expect(200);
      await request(http)
        .get(`${API}/probe/any`)
        .set('Authorization', `Bearer ${changed.body.data.accessToken}`)
        .expect(200);
      await request(http)
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${sessionB.body.data.accessToken}`)
        .expect(401);
      await login(email, 'NewPass2026').expect(200);
    });
  });

  describe('customer links (UC-12, NFR-5)', () => {
    let links: CustomerLinkService;
    let jobCardId: string;
    let estimateId: string;
    let garageId: string;

    beforeAll(async () => {
      links = app.get(CustomerLinkService);
      const admin = await register();
      garageId = admin.garageId;
      const customer = await dataSource.getRepository(Customer).save({
        garageId,
        name: 'Owner',
        phone: `+9198${Date.now() % 1e8}`,
        preferredChannels: [],
      });
      const vehicle = await dataSource.getRepository(Vehicle).save({
        garageId,
        customerId: customer.id,
        registrationNumber: `MH12${randomBytes(3).toString('hex').toUpperCase()}`,
        make: 'Maruti',
        model: 'Swift',
        fuelType: FuelType.PETROL,
      });
      const job = await dataSource.getRepository(JobCard).save({
        garageId,
        vehicleId: vehicle.id,
        customerId: customer.id,
        jobNumber: `JOB-T-${Date.now() % 1e6}`,
        checkinOdometerKm: 1000,
        customerComplaints: 'Brake noise',
        openedById: admin.userId,
      });
      const estimate = await dataSource.getRepository(Estimate).save({
        jobCardId: job.id,
        version: 1,
        taxRate: '18.00',
        createdById: admin.userId,
      });
      jobCardId = job.id;
      estimateId = estimate.id;
    });

    it('AC-12.6 unknown or malformed tokens → 404', async () => {
      const random = randomBytes(32).toString('base64url');
      for (const token of [random, 'short']) {
        const res = await request(http).get(`${API}/probe/portal/${token}`).expect(404);
        expect(res.body.errorCode).toBe('LINK_NOT_FOUND');
      }
    });

    it('a VIEW_JOB link can view but not approve (AC-12.8)', async () => {
      const { token } = await links.create({ garageId, jobCardId, purpose: LinkPurpose.VIEW_JOB });
      const view = await request(http).get(`${API}/probe/portal/${token}`).expect(200);
      expect(view.body).toMatchObject({ jobCardId, garageId, purpose: LinkPurpose.VIEW_JOB });
      const approve = await request(http).post(`${API}/probe/portal/${token}/approve`).expect(403);
      expect(approve.body.errorCode).toBe('LINK_PURPOSE_MISMATCH');
    });

    it('an APPROVE_ESTIMATE link can view and approve, scoped to its estimate', async () => {
      const { token } = await links.create({
        garageId,
        jobCardId,
        estimateId,
        purpose: LinkPurpose.APPROVE_ESTIMATE,
      });
      await request(http).get(`${API}/probe/portal/${token}`).expect(200);
      const res = await request(http).post(`${API}/probe/portal/${token}/approve`).expect(200);
      expect(res.body.estimateId).toBe(estimateId);
    });

    it('AC-12.5 / AC-11.3 expired or revoked links → 410', async () => {
      const expired = await links.create({
        garageId,
        jobCardId,
        purpose: LinkPurpose.VIEW_JOB,
        expiresAt: new Date(Date.now() - 1000),
      });
      const res = await request(http).get(`${API}/probe/portal/${expired.token}`).expect(410);
      expect(res.body.errorCode).toBe('LINK_EXPIRED');

      const approval = await links.create({
        garageId,
        jobCardId,
        estimateId,
        purpose: LinkPurpose.APPROVE_ESTIMATE,
      });
      await links.revokeForEstimate(estimateId);
      await request(http).post(`${API}/probe/portal/${approval.token}/approve`).expect(410);
    });

    it('stores only the SHA-256 hash of the token', async () => {
      const { token, link } = await links.create({
        garageId,
        jobCardId,
        purpose: LinkPurpose.VIEW_JOB,
      });
      expect(link.tokenHash).toHaveLength(64);
      expect(link.tokenHash).not.toContain(token);
    });
  });
});
