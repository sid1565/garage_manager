import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AUDIT_ACTIONS } from '../../../common/constants/audit-actions';
import { SUCCESS } from '../../../common/constants/messages';
import { apiError } from '../../../common/helpers/api-error.helper';
import { IAuthUser, IPaginatedData, IServiceResult } from '../../../common/interfaces';
import { isUniqueViolation } from '../../../common/utils/db-error.util';
import {
  formatMinor,
  lineTotalMinor,
  parseMinor,
  percentOfMinor,
  sumMinor,
} from '../../../common/utils/money.util';
import { applyOrder, likeTerm } from '../../../common/utils/query.util';
import { normalizeRegistrationNumber } from '../../../common/utils/registration.util';
import { requireGarageId } from '../../../common/utils/tenant.util';
import { ActorType } from '../../audit/enums/actor-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { LinkPurpose } from '../../customer-links/enums/link-purpose.enum';
import { CustomerLinkService } from '../../customer-links/services/customer-link.service';
import { EstimateLineItem } from '../../estimates/entities/estimate-line-item.entity';
import { Estimate } from '../../estimates/entities/estimate.entity';
import { EstimateStatus } from '../../estimates/enums/estimate-status.enum';
import { LineItemApproval } from '../../estimates/enums/line-item-approval.enum';
import { Garage } from '../../garages/entities/garage.entity';
import { CounterType } from '../../garages/enums/counter-type.enum';
import { GarageCounterService } from '../../garages/services/garage-counter.service';
import { JobCardStatus } from '../../job-cards/enums/job-card-status.enum';
import { assertNotClosed, findJobInGarage } from '../../job-cards/utils/job-access.util';
import { NotificationType } from '../../notifications/enums/notification-type.enum';
import { NotificationsService } from '../../notifications/services/notifications.service';
import {
  CreateInvoiceDto,
  InvoiceDto,
  InvoiceSummaryDto,
  ListInvoicesQueryDto,
  RecordPaymentDto,
} from '../dto/invoice.dto';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { Invoice } from '../entities/invoice.entity';
import { Payment } from '../entities/payment.entity';
import { InvoiceStatus } from '../enums/invoice-status.enum';

const ORDER_COLUMNS = new Map([
  ['issuedAt', 'i.issuedAt'],
  ['createdAt', 'i.createdAt'],
  ['invoiceNumber', 'i.invoiceNumber'],
]);
/** Small allowance for client clock skew on receivedAt. */
const FUTURE_TOLERANCE_MS = 60_000;

const balanceOf = (i: Invoice): bigint => parseMinor(i.total) - parseMinor(i.amountPaid);

/**
 * UC-15. Invoice = snapshot of every APPROVED estimate line on the job (original and
 * additional-work estimates) + extra items; discount before tax; tax at the garage's
 * current rate (snapshotted on the invoice). Payments lock the invoice row (AC-15.2/15.3).
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly i18n: I18nService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    private readonly counterService: GarageCounterService,
    private readonly linkService: CustomerLinkService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    user: IAuthUser,
    jobCardId: string,
    dto: CreateInvoiceDto,
    lang: string,
  ): Promise<IServiceResult<InvoiceDto>> {
    const garageId = requireGarageId(user);
    let invoiceId: string;
    try {
      invoiceId = await this.dataSource.transaction(async (manager) => {
        const job = await findJobInGarage(manager, garageId, jobCardId, true);
        assertNotClosed(job);
        if (job.status !== JobCardStatus.READY_FOR_PICKUP) throw apiError('JOB_NOT_READY');
        if (await manager.getRepository(Invoice).exist({ where: { jobCardId } })) {
          throw apiError('INVOICE_EXISTS'); // AC-15.5
        }

        const approved = await this.approvedEstimateLines(manager, jobCardId);
        const lines = [
          ...approved.map((li) => ({
            sourceEstimateLineItemId: li.id,
            itemType: li.itemType,
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            total: parseMinor(li.lineTotal),
          })),
          ...(dto.extraItems ?? []).map((x) => ({
            sourceEstimateLineItemId: null,
            itemType: x.itemType,
            description: x.description.trim(),
            quantity: x.quantity,
            unitPrice: x.unitPrice,
            total: lineTotalMinor(x.quantity, x.unitPrice),
          })),
        ];
        if (lines.length === 0) throw apiError('NOTHING_TO_INVOICE');

        const subtotal = sumMinor(lines.map((l) => l.total));
        const discount = parseMinor(dto.discount ?? '0');
        if (discount > subtotal) throw apiError('DISCOUNT_TOO_LARGE');
        const garage = await manager
          .getRepository(Garage)
          .findOneOrFail({ where: { id: garageId } });
        const tax = percentOfMinor(subtotal - discount, garage.taxRate);
        const total = subtotal - discount + tax;

        const invoiceNumber = await this.counterService.next(
          manager,
          garageId,
          CounterType.INVOICE,
          garage.timezone,
        );
        const repo = manager.getRepository(Invoice);
        const invoice = await repo.save(
          repo.create({
            garageId,
            jobCardId,
            invoiceNumber,
            status: InvoiceStatus.UNPAID,
            subtotal: formatMinor(subtotal),
            discount: formatMinor(discount),
            taxRate: garage.taxRate,
            taxAmount: formatMinor(tax),
            total: formatMinor(total),
            amountPaid: '0.00',
            issuedAt: new Date(),
            notes: dto.notes ?? null,
            createdById: user.id,
          }),
        );
        await manager.getRepository(InvoiceLineItem).insert(
          lines.map((l, index) => ({
            invoiceId: invoice.id,
            sourceEstimateLineItemId: l.sourceEstimateLineItemId,
            itemType: l.itemType,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: formatMinor(l.total),
            sortOrder: index,
          })),
        );
        await this.audit(manager, user, AUDIT_ACTIONS.INVOICE_CREATED, invoice.id, {
          jobCardId,
          invoiceNumber,
          total: invoice.total,
        });
        const link = await this.linkService.create(
          { garageId, jobCardId, purpose: LinkPurpose.VIEW_JOB },
          manager,
        );
        await this.notificationsService.enqueue(
          {
            garageId,
            type: NotificationType.INVOICE_ISSUED,
            customerId: job.customerId,
            jobCardId,
            linkUrl: link.url,
            templateData: { invoiceNumber, total: invoice.total, balanceDue: invoice.total },
          },
          manager,
        );
        return invoice.id;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'UQ_invoices_job_card')) throw apiError('INVOICE_EXISTS');
      throw error;
    }
    return {
      message: SUCCESS.RECORD_CREATED('INVOICE', this.i18n, lang),
      data: await this.loadDto(invoiceId),
    };
  }

  async list(
    user: IAuthUser,
    query: ListInvoicesQueryDto,
    lang: string,
  ): Promise<IServiceResult<IPaginatedData<InvoiceSummaryDto>>> {
    const garageId = requireGarageId(user);
    const qb = this.invoiceRepo
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.jobCard', 'j')
      .innerJoinAndSelect('j.customer', 'c')
      .innerJoinAndSelect('j.vehicle', 'v')
      .innerJoinAndSelect('i.garage', 'g')
      .where('i.garage_id = :garageId', { garageId });
    if (query.status) qb.andWhere('i.status = :status', { status: query.status });
    if (query.issuedFrom) qb.andWhere('i.issued_at >= :from::date', { from: query.issuedFrom });
    if (query.issuedTo) {
      qb.andWhere("i.issued_at < (:to::date + interval '1 day')", { to: query.issuedTo });
    }
    if (query.search) {
      const registration = normalizeRegistrationNumber(query.search);
      qb.andWhere(
        `(i.invoice_number ILIKE :term OR c.name ILIKE :term${registration ? ' OR v.registration_number LIKE :reg' : ''})`,
        { term: likeTerm(query.search), reg: likeTerm(registration) },
      );
    }
    applyOrder(qb, query.order, ORDER_COLUMNS, ['i.issuedAt', 'DESC']);
    const [rows, total] = await qb.skip(query.offset).take(query.limit).getManyAndCount();
    return {
      message: SUCCESS.RECORD_LIST_FETCHED('INVOICE', this.i18n, lang),
      data: { items: rows.map((i) => this.toSummary(i)), total },
    };
  }

  async findOne(
    user: IAuthUser,
    invoiceId: string,
    lang: string,
  ): Promise<IServiceResult<InvoiceDto>> {
    const exists = await this.invoiceRepo.exist({
      where: { id: invoiceId, garageId: requireGarageId(user) },
    });
    if (!exists) throw apiError('NOT_FOUND');
    return {
      message: SUCCESS.RECORD_FETCHED('INVOICE', this.i18n, lang),
      data: await this.loadDto(invoiceId),
    };
  }

  async recordPayment(
    user: IAuthUser,
    invoiceId: string,
    dto: RecordPaymentDto,
    lang: string,
  ): Promise<IServiceResult<InvoiceDto>> {
    const garageId = requireGarageId(user);
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    if (receivedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS)
      throw apiError('PAYMENT_IN_FUTURE');

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Invoice);
      const invoice = await repo.findOne({
        where: { id: invoiceId, garageId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invoice) throw apiError('NOT_FOUND');
      if (invoice.status === InvoiceStatus.VOID) throw apiError('INVOICE_VOID');
      const amount = parseMinor(dto.amount);
      if (amount > balanceOf(invoice)) throw apiError('AMOUNT_EXCEEDS_BALANCE'); // AC-15.3

      await manager.getRepository(Payment).insert({
        garageId,
        invoiceId,
        amount: formatMinor(amount),
        method: dto.method,
        reference: dto.reference?.trim() || null,
        receivedAt,
        receivedById: user.id,
      });
      const paid = parseMinor(invoice.amountPaid) + amount;
      const status =
        paid === parseMinor(invoice.total) ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
      await repo.update({ id: invoiceId }, { amountPaid: formatMinor(paid), status });
      await this.audit(manager, user, AUDIT_ACTIONS.PAYMENT_RECORDED, invoiceId, {
        amount: formatMinor(amount),
        method: dto.method,
        status,
      });
    });
    return {
      message: SUCCESS.RECORD_CREATED('PAYMENT', this.i18n, lang),
      data: await this.loadDto(invoiceId),
    };
  }

  private async approvedEstimateLines(
    manager: EntityManager,
    jobCardId: string,
  ): Promise<EstimateLineItem[]> {
    const estimates = await manager.getRepository(Estimate).find({
      where: {
        jobCardId,
        status: In([EstimateStatus.APPROVED, EstimateStatus.PARTIALLY_APPROVED]),
      },
      order: { version: 'ASC' },
    });
    if (estimates.length === 0) return [];
    const lines = await manager.getRepository(EstimateLineItem).find({
      where: {
        estimateId: In(estimates.map((e) => e.id)),
        approvalState: LineItemApproval.APPROVED,
      },
    });
    const order = new Map(estimates.map((e, index) => [e.id, index]));
    return lines.sort(
      (a, b) =>
        (order.get(a.estimateId) ?? 0) - (order.get(b.estimateId) ?? 0) ||
        a.sortOrder - b.sortOrder,
    );
  }

  private toSummary(i: Invoice): InvoiceSummaryDto {
    return {
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      jobCardId: i.jobCardId,
      jobNumber: i.jobCard.jobNumber,
      customer: { id: i.jobCard.customer.id, name: i.jobCard.customer.name },
      vehicleRegistration: i.jobCard.vehicle.registrationNumber,
      status: i.status,
      total: i.total,
      amountPaid: i.amountPaid,
      balanceDue: formatMinor(balanceOf(i)),
      currency: i.garage.currency,
      issuedAt: i.issuedAt,
    };
  }

  private async loadDto(invoiceId: string): Promise<InvoiceDto> {
    const invoice = await this.invoiceRepo.findOneOrFail({
      where: { id: invoiceId },
      relations: { jobCard: { customer: true, vehicle: true }, garage: true, createdBy: true },
    });
    const [items, payments] = await Promise.all([
      this.dataSource
        .getRepository(InvoiceLineItem)
        .find({ where: { invoiceId }, order: { sortOrder: 'ASC' } }),
      this.dataSource.getRepository(Payment).find({
        where: { invoiceId },
        relations: { receivedBy: true },
        order: { receivedAt: 'ASC' },
      }),
    ]);
    return {
      ...this.toSummary(invoice),
      subtotal: invoice.subtotal,
      discount: invoice.discount,
      taxRate: invoice.taxRate,
      taxAmount: invoice.taxAmount,
      notes: invoice.notes,
      items: items.map((l) => ({
        id: l.id,
        itemType: l.itemType,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        sourceEstimateLineItemId: l.sourceEstimateLineItemId,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        reference: p.reference,
        receivedAt: p.receivedAt,
        receivedBy: { id: p.receivedBy.id, name: p.receivedBy.name },
      })),
      createdBy: { id: invoice.createdBy.id, name: invoice.createdBy.name },
    };
  }

  private audit(
    manager: EntityManager,
    user: IAuthUser,
    action: string,
    invoiceId: string,
    changes: Record<string, unknown>,
  ): Promise<void> {
    return this.auditService.record(
      {
        garageId: user.garageId,
        actorType: ActorType.STAFF,
        actorUserId: user.id,
        action,
        entityType: 'invoice',
        entityId: invoiceId,
        changes,
      },
      manager,
    );
  }
}
