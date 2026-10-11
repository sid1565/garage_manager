import { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Notification } from '../../src/modules/notifications/entities/notification.entity';
import { NotificationStatus } from '../../src/modules/notifications/enums/notification-status.enum';
import { SMS_PROVIDER } from '../../src/modules/notifications/providers/notification-provider.interface';
import { NotificationsWorker } from '../../src/modules/notifications/services/notifications-worker.service';
import { ServiceReminderService } from '../../src/modules/notifications/services/service-reminder.service';
import { createTestApp } from './create-test-app';

const API = '/api/v1';
const PASSWORD = 'Garage2026';
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

const uid = (): string => `${Date.now()}${randomBytes(2).toString('hex')}`;
const email = (tag: string): string => `${tag}-${uid()}@test.local`;
const phone = (): string =>
  `+9198${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
const reg = (): string =>
  `MH 12 ${randomBytes(2).toString('hex').toUpperCase()} ${Math.floor(Math.random() * 9000 + 1000)}`;

/** SMS provider that always fails — drives the retry/FAILED path (AC-10.3). */
const failingSms = { send: jest.fn().mockRejectedValue(new Error('SMS gateway down')) };

/**
 * Full garage journey through the HTTP API against a real database (stage-5 verification):
 * check-in → diagnosis → notify → estimate → owner approval by link → repair → invoice →
 * payment → delivery, plus tenant isolation, worker delivery and reminders.
 */
describe('Garage repair flow (e2e)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication['getHttpServer']>;
  let db: DataSource;

  interface IClient {
    get(path: string): request.Test;
    post(path: string, body?: object): request.Test;
    patch(path: string, body: object): request.Test;
  }

  const call = (token: string): IClient => ({
    get: (path: string): request.Test =>
      request(http).get(`${API}${path}`).set('Authorization', `Bearer ${token}`),
    post: (path: string, body?: object): request.Test =>
      request(http)
        .post(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body ?? {}),
    patch: (path: string, body: object): request.Test =>
      request(http).patch(`${API}${path}`).set('Authorization', `Bearer ${token}`).send(body),
  });

  const registerGarage = async (): Promise<{ token: string; garageId: string; userId: string }> => {
    const res = await request(http)
      .post(`${API}/auth/register`)
      .send({
        garageName: `Garage ${uid()}`,
        garagePhone: '+912012345678',
        name: 'Owner Admin',
        email: email('admin'),
        password: PASSWORD,
      })
      .expect(201);
    return {
      token: res.body.data.accessToken,
      garageId: res.body.data.user.garageId,
      userId: res.body.data.user.id,
    };
  };

  /** Admin creates staff (temp password) → staff logs in → changes password → usable token. */
  const createStaff = async (
    adminToken: string,
    role: string,
  ): Promise<{ token: string; id: string; email: string }> => {
    const staffEmail = email(role.toLowerCase());
    const created = await call(adminToken)
      .post('/staff', {
        name: `${role} Person`,
        email: staffEmail,
        role,
        temporaryPassword: 'Temp12345',
      })
      .expect(201);
    expect(created.body.data.mustChangePassword).toBe(true);
    const login = await request(http)
      .post(`${API}/auth/login`)
      .send({ email: staffEmail, password: 'Temp12345' })
      .expect(200);
    const changed = await call(login.body.data.accessToken)
      .post('/auth/change-password', { currentPassword: 'Temp12345', newPassword: PASSWORD })
      .expect(200);
    return { token: changed.body.data.accessToken, id: created.body.data.id, email: staffEmail };
  };

  const latestToken = async (jobCardId: string, type: string): Promise<string> => {
    const n = await db.getRepository(Notification).findOneOrFail({
      where: { jobCardId, type: type as Notification['type'] },
      order: { createdAt: 'DESC' },
    });
    const match = /\/portal\/([A-Za-z0-9_-]{43})/.exec(n.body);
    if (!match) throw new Error(`no link in ${type} notification`);
    return match[1];
  };

  beforeAll(async () => {
    app = await createTestApp([], [], (b) => b.overrideProvider(SMS_PROVIDER).useValue(failingSms));
    http = app.getHttpServer();
    db = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('happy path with business rules', () => {
    let admin: { token: string; garageId: string; userId: string };
    let advisor: { token: string; id: string; email: string };
    let mechanic: { token: string; id: string; email: string };
    let customerId: string;
    let vehicleId: string;
    let jobId: string;
    let problemId: string;
    let estimateId: string;
    let invoiceId: string;
    let lineItemIds: string[];

    beforeAll(async () => {
      admin = await registerGarage();
      await call(admin.token).patch('/garages/current', { taxRate: '18.00' }).expect(200);
      advisor = await createStaff(admin.token, 'SERVICE_ADVISOR');
      mechanic = await createStaff(admin.token, 'MECHANIC');
    });

    it('UC-4/AC-4.2: registers an owner; same phone returns the existing one (200, duplicate)', async () => {
      const body = {
        name: 'Amit Deshmukh',
        phone: phone(),
        email: 'amit@example.com',
        preferredChannels: ['SMS', 'EMAIL'],
      };
      const first = await call(advisor.token).post('/customers', body).expect(201);
      customerId = first.body.data.id;
      const dup = await call(advisor.token).post('/customers', body).expect(200);
      expect(dup.body.data).toMatchObject({ id: customerId, duplicate: true });
      await call(advisor.token)
        .post('/customers', {
          ...body,
          phone: phone(),
          email: undefined,
          preferredChannels: ['EMAIL'],
        })
        .expect(400);
    });

    it('UC-5/AC-5.1/5.2: adds a vehicle with a normalised registration; duplicates → 409', async () => {
      const registration = reg();
      const res = await call(advisor.token)
        .post('/vehicles', {
          customerId,
          registrationNumber: registration.toLowerCase(),
          make: 'Maruti',
          model: 'Swift',
          fuelType: 'PETROL',
          odometerKm: 40000,
        })
        .expect(201);
      vehicleId = res.body.data.id;
      expect(res.body.data.registrationNumber).toBe(registration.replace(/\s/g, ''));
      const dup = await call(advisor.token)
        .post('/vehicles', {
          customerId,
          registrationNumber: registration,
          make: 'X',
          model: 'Y',
          fuelType: 'DIESEL',
        })
        .expect(409);
      expect(dup.body.errorCode).toBe('REGISTRATION_EXISTS');
      const search = await call(mechanic.token)
        .get(`/vehicles?search=${encodeURIComponent(registration.slice(3, 9))}`)
        .expect(200);
      expect(search.body.data.map((v: { id: string }) => v.id)).toContain(vehicleId);
    });

    it('UC-8: opens a job card (number, history, owner notified); rejects a second open job and a lower odometer', async () => {
      await call(advisor.token)
        .post('/job-cards', { vehicleId, checkinOdometerKm: 39000, customerComplaints: 'x' })
        .expect(400)
        .expect((r) => expect(r.body.errorCode).toBe('ODOMETER_DECREASED'));
      const res = await call(advisor.token)
        .post('/job-cards', {
          vehicleId,
          checkinOdometerKm: 42150,
          customerComplaints: 'Brake noise; AC weak',
          assignedMechanicId: mechanic.id,
        })
        .expect(201);
      jobId = res.body.data.id;
      expect(res.body.data).toMatchObject({
        status: 'CHECKED_IN',
        assignedMechanic: { id: mechanic.id },
      });
      expect(res.body.data.jobNumber).toMatch(/^JOB-\d{4}-\d{6}$/);
      const queued = await db
        .getRepository(Notification)
        .count({ where: { jobCardId: jobId, type: 'JOB_CHECKED_IN' as Notification['type'] } });
      expect(queued).toBe(2); // SMS + EMAIL preference
      const again = await call(advisor.token)
        .post('/job-cards', { vehicleId, checkinOdometerKm: 42150, customerComplaints: 'again' })
        .expect(409);
      expect(again.body.errorCode).toBe('OPEN_JOB_EXISTS');
    });

    it('UC-9: assigned mechanic records a problem (→ DIAGNOSING); an unassigned mechanic is refused', async () => {
      const other = await createStaff(admin.token, 'MECHANIC');
      const denied = await call(other.token)
        .post(`/job-cards/${jobId}/problems`, {
          title: 'Pads',
          severity: 'HIGH',
          category: 'BRAKES',
        })
        .expect(403);
      expect(denied.body.errorCode).toBe('NOT_ASSIGNED_MECHANIC');
      const res = await call(mechanic.token)
        .post(`/job-cards/${jobId}/problems`, {
          title: 'Front brake pads worn',
          description: '2 mm left',
          severity: 'HIGH',
          category: 'BRAKES',
        })
        .expect(201);
      problemId = res.body.data.id;
      const job = await call(advisor.token).get(`/job-cards/${jobId}`).expect(200);
      expect(job.body.data.status).toBe('DIAGNOSING');
    });

    it('UC-9 photos: upload (type from magic bytes), list and download as attachment', async () => {
      const up = await request(http)
        .post(`${API}/job-cards/${jobId}/attachments`)
        .set('Authorization', `Bearer ${mechanic.token}`)
        .field('problemId', problemId)
        .field('caption', 'Front left pad')
        .attach('file', TINY_JPEG, { filename: '../../etc/passwd.jpg', contentType: 'image/jpeg' })
        .expect(201);
      expect(up.body.data).toMatchObject({
        mimeType: 'image/jpeg',
        originalName: 'passwd.jpg',
        problemId,
      });
      const dl = await request(http)
        .get(`${API}/job-cards/${jobId}/attachments/${up.body.data.id}/download`)
        .set('Authorization', `Bearer ${advisor.token}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(dl.headers['content-disposition']).toMatch(/^attachment;/);
      expect(Buffer.compare(dl.body as Buffer, TINY_JPEG)).toBe(0);
    });

    it('UC-10: notifies the owner on both channels (202); link tokens are masked in the log', async () => {
      const res = await call(advisor.token)
        .post(`/job-cards/${jobId}/notifications`, {
          type: 'PROBLEMS_FOUND',
          message: 'Please call us',
        })
        .expect(202);
      expect(res.body.data.notifications).toHaveLength(2);
      expect(res.body.data.notifications[0].body).toContain('/portal/•••');
      expect(res.body.data.notifications[0].body).toContain('Front brake pads worn (HIGH)');
    });

    it('AC-11.1/11.2: estimate totals are computed server-side; sending moves the job to AWAITING_APPROVAL', async () => {
      const created = await call(advisor.token)
        .post(`/job-cards/${jobId}/estimates`, {
          items: [
            {
              itemType: 'PART',
              description: 'Brake pads (set)',
              quantity: '2',
              unitPrice: '500.00',
              problemId,
            },
            { itemType: 'LABOUR', description: 'Fitting', quantity: '1', unitPrice: '300.00' },
          ],
        })
        .expect(201);
      estimateId = created.body.data.id;
      expect(created.body.data).toMatchObject({
        status: 'DRAFT',
        subtotal: '1300.00',
        taxAmount: '234.00',
        total: '1534.00',
      });
      lineItemIds = created.body.data.items.map((i: { id: string }) => i.id);

      const sent = await call(advisor.token).post(`/estimates/${estimateId}/send`, {}).expect(200);
      expect(sent.body.data).toMatchObject({ status: 'SENT', notificationsQueued: 2 });
      const job = await call(advisor.token).get(`/job-cards/${jobId}`).expect(200);
      expect(job.body.data.status).toBe('AWAITING_APPROVAL');
      const locked = await call(mechanic.token)
        .patch(`/job-cards/${jobId}/problems/${problemId}`, { title: 'changed' })
        .expect(409);
      expect(['PROBLEM_LOCKED', 'JOB_NOT_EDITABLE']).toContain(locked.body.errorCode);
    });

    it('UC-12: the owner sees a staff-free view and partially approves via the link', async () => {
      const token = await latestToken(jobId, 'ESTIMATE_SENT');
      const view = await request(http).get(`${API}/portal/${token}`).expect(200);
      expect(view.body.data).toMatchObject({
        linkPurpose: 'APPROVE_ESTIMATE',
        status: 'AWAITING_APPROVAL',
        customerFirstName: 'Amit',
      });
      expect(view.body.data.estimate).toMatchObject({
        id: estimateId,
        canRespond: true,
        total: '1534.00',
        currency: 'INR',
      });
      expect(view.body.data.problems[0].photos).toHaveLength(1);
      const json = JSON.stringify(view.body);
      expect(json).not.toMatch(/passwordHash|@test\.local|mechanic|createdBy/i);
      await request(http)
        .get(`${API}/portal/${token}/${view.body.data.problems[0].photos[0].path}`)
        .expect(200);

      const incomplete = await request(http)
        .post(`${API}/portal/${token}/estimate/response`)
        .send({ decisions: [{ lineItemId: lineItemIds[0], approved: true }] })
        .expect(400);
      expect(incomplete.body.errorCode).toBe('DECISIONS_INCOMPLETE');

      const res = await request(http)
        .post(`${API}/portal/${token}/estimate/response`)
        .send({
          decisions: [
            { lineItemId: lineItemIds[0], approved: true },
            { lineItemId: lineItemIds[1], approved: false },
          ],
          remark: 'Pads only please',
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        status: 'PARTIALLY_APPROVED',
        approvedTotal: '1180.00',
        canRespond: false,
      });
      const again = await request(http)
        .post(`${API}/portal/${token}/estimate/response`)
        .send({ decisions: lineItemIds.map((id) => ({ lineItemId: id, approved: true })) })
        .expect(409);
      expect(again.body.errorCode).toBe('ESTIMATE_ALREADY_RESPONDED');
      const job = await call(advisor.token).get(`/job-cards/${jobId}`).expect(200);
      expect(job.body.data.status).toBe('APPROVED');
    });

    it('UC-13: role-limited status moves; READY_FOR_PICKUP notifies the owner', async () => {
      const mechDenied = await call(mechanic.token)
        .post(`/job-cards/${jobId}/status`, { status: 'IN_PROGRESS' })
        .expect(403);
      expect(mechDenied.body.errorCode).toBe('MECHANIC_TRANSITION_NOT_ALLOWED');
      await call(advisor.token)
        .post(`/job-cards/${jobId}/status`, { status: 'IN_PROGRESS' })
        .expect(200);
      await call(mechanic.token)
        .post(`/job-cards/${jobId}/status`, { status: 'QUALITY_CHECK' })
        .expect(200);
      await call(mechanic.token)
        .post(`/job-cards/${jobId}/status`, { status: 'READY_FOR_PICKUP' })
        .expect(403);
      const bad = await call(advisor.token)
        .post(`/job-cards/${jobId}/status`, { status: 'DIAGNOSING' })
        .expect(409);
      expect(bad.body.errorCode).toBe('INVALID_STATUS_TRANSITION');
      const ready = await call(advisor.token)
        .post(`/job-cards/${jobId}/status`, { status: 'READY_FOR_PICKUP' })
        .expect(200);
      expect(ready.body.data.status).toBe('READY_FOR_PICKUP');
      expect(
        await db
          .getRepository(Notification)
          .count({ where: { jobCardId: jobId, type: 'READY_FOR_PICKUP' as Notification['type'] } }),
      ).toBe(2);
      const history = await call(advisor.token)
        .get(`/job-cards/${jobId}/status-history`)
        .expect(200);
      expect(history.body.data.map((h: { toStatus: string }) => h.toStatus)).toEqual([
        'CHECKED_IN',
        'DIAGNOSING',
        'AWAITING_APPROVAL',
        'APPROVED',
        'IN_PROGRESS',
        'QUALITY_CHECK',
        'READY_FOR_PICKUP',
      ]);
    });

    it('UC-15: invoice (approved lines + extras − discount + tax), payments, delivery rules', async () => {
      await call(advisor.token).post(`/job-cards/${jobId}/deliver`, {}).expect(409);
      const inv = await call(advisor.token)
        .post(`/job-cards/${jobId}/invoice`, {
          extraItems: [
            { itemType: 'PART', description: 'Wiper fluid', quantity: '1', unitPrice: '150.00' },
          ],
          discount: '100.00',
        })
        .expect(201);
      invoiceId = inv.body.data.id;
      // (1000 approved + 150 extra − 100 discount) × 1.18 = 1239.00
      expect(inv.body.data).toMatchObject({
        subtotal: '1150.00',
        discount: '100.00',
        taxAmount: '189.00',
        total: '1239.00',
        status: 'UNPAID',
        balanceDue: '1239.00',
      });
      expect(inv.body.data.invoiceNumber).toMatch(/^INV-\d{4}-000001$/);
      expect(inv.body.data.items).toHaveLength(2);
      await call(advisor.token).post(`/job-cards/${jobId}/invoice`, {}).expect(409);

      const over = await call(advisor.token)
        .post(`/invoices/${invoiceId}/payments`, { amount: '1300.00', method: 'CASH' })
        .expect(400);
      expect(over.body.errorCode).toBe('AMOUNT_EXCEEDS_BALANCE');
      const part = await call(advisor.token)
        .post(`/invoices/${invoiceId}/payments`, {
          amount: '1000.00',
          method: 'UPI',
          reference: 'UPI-1',
        })
        .expect(201);
      expect(part.body.data).toMatchObject({ status: 'PARTIALLY_PAID', balanceDue: '239.00' });
      const notPaid = await call(advisor.token).post(`/job-cards/${jobId}/deliver`, {}).expect(409);
      expect(notPaid.body.errorCode).toBe('INVOICE_NOT_PAID');
      const paid = await call(advisor.token)
        .post(`/invoices/${invoiceId}/payments`, { amount: '239.00', method: 'CASH' })
        .expect(201);
      expect(paid.body.data).toMatchObject({ status: 'PAID', balanceDue: '0.00' });
      expect(paid.body.data.payments).toHaveLength(2);

      const delivered = await call(advisor.token)
        .post(`/job-cards/${jobId}/deliver`, { nextServiceDate: '2027-04-08' })
        .expect(200);
      expect(delivered.body.data).toMatchObject({ status: 'DELIVERED', deliveredOnCredit: false });
      const vehicle = await call(advisor.token).get(`/vehicles/${vehicleId}`).expect(200);
      expect(vehicle.body.data).toMatchObject({
        nextServiceDate: '2027-04-08',
        openJobCard: null,
        odometerKm: 42150,
      });
    });

    it('AC-6.3: service history lists the closed job with its invoice total', async () => {
      const res = await call(mechanic.token)
        .get(`/vehicles/${vehicleId}/service-history`)
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0]).toMatchObject({
        jobCardId: jobId,
        invoiceTotal: '1239.00',
        problemTitles: ['Front brake pads worn'],
      });
    });

    it('UC-17 / AC-17.2: revenue only for the garage admin', async () => {
      const adminDash = await call(admin.token).get('/dashboard/summary').expect(200);
      expect(adminDash.body.data.revenue).toMatchObject({
        today: '1239.00',
        thisMonth: '1239.00',
        currency: 'INR',
      });
      expect(adminDash.body.data.topProblemCategories[0]).toEqual({ category: 'BRAKES', count: 1 });
      const advisorDash = await call(advisor.token).get('/dashboard/summary').expect(200);
      expect(advisorDash.body.data).not.toHaveProperty('revenue');
    });

    it('NFR-7: actions are audited and visible to the admin only', async () => {
      const res = await call(admin.token).get(`/audit-logs?entityId=${jobId}&limit=50`).expect(200);
      const actions = res.body.data.map((a: { action: string }) => a.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'job_card.opened',
          'job_card.status_changed',
          'job_card.delivered',
        ]),
      );
      await call(advisor.token).get('/audit-logs').expect(403);
    });

    it('AC-8.4: concurrent check-ins in one garage get distinct sequential job numbers', async () => {
      const vehicles = await Promise.all(
        [0, 1, 2].map(() =>
          call(advisor.token)
            .post('/vehicles', {
              customerId,
              registrationNumber: reg(),
              make: 'Tata',
              model: 'Nexon',
              fuelType: 'ELECTRIC',
            })
            .expect(201),
        ),
      );
      const jobs = await Promise.all(
        vehicles.map((v) =>
          call(advisor.token)
            .post('/job-cards', {
              vehicleId: v.body.data.id,
              checkinOdometerKm: 10,
              customerComplaints: 'Service',
            })
            .expect(201),
        ),
      );
      const numbers = jobs.map((j) => Number(String(j.body.data.jobNumber).slice(-6))).sort();
      expect(new Set(numbers).size).toBe(3);
      expect(numbers).toEqual([2, 3, 4]); // job 1 was the first check-in above

      const cancelled = await call(advisor.token)
        .post(`/job-cards/${jobs[0].body.data.id}/cancel`, { reason: 'Owner took it elsewhere' })
        .expect(200);
      expect(cancelled.body.data.status).toBe('CANCELLED');
    });

    it('AC-3.4: an admin cannot deactivate themselves; deactivated staff are locked out at once', async () => {
      const self = await call(admin.token)
        .patch(`/staff/${admin.userId}/status`, { status: 'INACTIVE' })
        .expect(400);
      expect(self.body.errorCode).toBe('CANNOT_DEACTIVATE_SELF');
      await call(admin.token)
        .patch(`/staff/${mechanic.id}/status`, { status: 'INACTIVE' })
        .expect(200);
      // Sessions are revoked with the deactivation → the live token dies immediately…
      const out = await call(mechanic.token).get('/job-cards').expect(401);
      expect(out.body.errorCode).toBe('SESSION_REVOKED');
      // …and a fresh login is refused.
      const relogin = await request(http)
        .post(`${API}/auth/login`)
        .send({ email: mechanic.email, password: PASSWORD })
        .expect(403);
      expect(relogin.body.errorCode).toBe('ACCOUNT_INACTIVE');
    });

    describe('AC-NFR-3: tenant isolation', () => {
      let other: { token: string };

      beforeAll(async () => {
        other = await registerGarage();
      });

      it.each([
        ['customer', (): string => `/customers/${customerId}`],
        ['vehicle', (): string => `/vehicles/${vehicleId}`],
        ['job card', (): string => `/job-cards/${jobId}`],
        ['estimate', (): string => `/estimates/${estimateId}`],
        ['invoice', (): string => `/invoices/${invoiceId}`],
        ['problems', (): string => `/job-cards/${jobId}/problems`],
      ])('another garage gets 404 for a %s', async (_name, path) => {
        const res = await call(other.token).get(path()).expect(404);
        expect(res.body.errorCode).toBe('NOT_FOUND');
      });

      it('lists never include another garage’s rows; writes are refused with 404', async () => {
        const list = await call(other.token).get('/customers?limit=100').expect(200);
        expect(list.body.data.map((c: { id: string }) => c.id)).not.toContain(customerId);
        await call(other.token)
          .post(`/invoices/${invoiceId}/payments`, { amount: '1.00', method: 'CASH' })
          .expect(404);
        await call(other.token)
          .post(`/job-cards/${jobId}/notifications`, { type: 'PROBLEMS_FOUND' })
          .expect(404);
      });
    });

    describe('notification delivery (worker) and reminders', () => {
      it('AC-10.3 / AC-16.1: SMS fails 3× → FAILED; email is SENT; FAILED can be retried', async () => {
        const worker = app.get(NotificationsWorker);
        const repo = db.getRepository(Notification);
        for (let attempt = 0; attempt < 3; attempt += 1) {
          await repo
            .createQueryBuilder()
            .update()
            .set({ nextAttemptAt: () => 'now()' })
            .where({ jobCardId: jobId, status: NotificationStatus.QUEUED })
            .execute();
          while ((await worker.processDueBatch()) > 0) {
            // drain everything due right now
          }
        }
        const sms = await repo.find({
          where: { jobCardId: jobId, channel: 'SMS' as Notification['channel'] },
        });
        const email = await repo.find({
          where: { jobCardId: jobId, channel: 'EMAIL' as Notification['channel'] },
        });
        expect(sms.every((n) => n.status === NotificationStatus.FAILED && n.attempts === 3)).toBe(
          true,
        );
        expect(sms[0].lastError).toContain('SMS gateway down');
        expect(email.every((n) => n.status === NotificationStatus.SENT)).toBe(true);

        const retried = await call(admin.token)
          .post(`/notifications/${sms[0].id}/retry`)
          .expect(202);
        expect(retried.body.data).toMatchObject({ status: 'QUEUED', attempts: 0 });
        const notFailed = await call(admin.token)
          .post(`/notifications/${email[0].id}/retry`)
          .expect(409);
        expect(notFailed.body.errorCode).toBe('NOT_FAILED');
      });

      it('AC-18.1: one reminder per vehicle per service date, even if the sweep runs twice', async () => {
        const due = new Date(Date.now() + 3 * 86400 * 1000).toISOString().slice(0, 10);
        await call(admin.token)
          .patch(`/vehicles/${vehicleId}`, { nextServiceDate: due })
          .expect(200);
        const reminders = app.get(ServiceReminderService);
        const first = await reminders.sendDueReminders(new Date(), {
          ignoreHour: true,
          garageId: admin.garageId,
        });
        const second = await reminders.sendDueReminders(new Date(), {
          ignoreHour: true,
          garageId: admin.garageId,
        });
        expect(first).toBe(1);
        expect(second).toBe(0);
      });
    });
  });
});
