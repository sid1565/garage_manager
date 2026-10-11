import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, In, Not } from 'typeorm';
import { SUCCESS } from '../../../common/constants/messages';
import { apiError } from '../../../common/helpers/api-error.helper';
import { IFileDownload, IServiceResult } from '../../../common/interfaces';
import { formatMinor, parseMinor } from '../../../common/utils/money.util';
import { LinkPurpose } from '../../customer-links/enums/link-purpose.enum';
import { ICustomerLinkContext } from '../../customer-links/interfaces/customer-link-context.interface';
import { EstimateDecisionDto } from '../../estimates/dto/estimate.dto';
import { EstimateLineItem } from '../../estimates/entities/estimate-line-item.entity';
import { Estimate } from '../../estimates/entities/estimate.entity';
import { EstimateStatus } from '../../estimates/enums/estimate-status.enum';
import { EstimatesService } from '../../estimates/services/estimates.service';
import { Garage } from '../../garages/entities/garage.entity';
import { Invoice } from '../../invoices/entities/invoice.entity';
import { Attachment } from '../../job-cards/entities/attachment.entity';
import { JobCard } from '../../job-cards/entities/job-card.entity';
import { JobStatusHistory } from '../../job-cards/entities/job-status-history.entity';
import { Problem } from '../../job-cards/entities/problem.entity';
import { StorageService } from '../../storage/services/storage.service';
import { PortalEstimateDto, PortalJobViewDto } from '../dto/portal-view.dto';

/**
 * UC-12 for the vehicle owner (ACT-4). link-scoped: every query is keyed by
 * link.garageId + link.jobCardId (+ link.estimateId); request ids (attachments) must
 * belong to that job or the answer is 404. Output DTOs omit all staff-internal data.
 */
@Injectable()
export class CustomerPortalService {
  private readonly logger = new Logger(CustomerPortalService.name);

  constructor(
    private readonly i18n: I18nService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly estimatesService: EstimatesService,
    private readonly storage: StorageService,
  ) {}

  async getJobView(
    link: ICustomerLinkContext,
    lang: string,
  ): Promise<IServiceResult<PortalJobViewDto>> {
    const m = this.dataSource.manager;
    const job = await m.getRepository(JobCard).findOne({
      where: { id: link.jobCardId, garageId: link.garageId },
      relations: { vehicle: true, customer: true },
    });
    if (!job) throw apiError('NOT_FOUND');
    const garage = await m.getRepository(Garage).findOneOrFail({ where: { id: link.garageId } });
    const [problems, attachments, history, invoice] = await Promise.all([
      m.getRepository(Problem).find({ where: { jobCardId: job.id }, order: { createdAt: 'ASC' } }),
      m
        .getRepository(Attachment)
        .find({ where: { jobCardId: job.id }, order: { createdAt: 'ASC' } }),
      m
        .getRepository(JobStatusHistory)
        .find({ where: { jobCardId: job.id }, order: { createdAt: 'ASC' } }),
      m.getRepository(Invoice).findOne({ where: { jobCardId: job.id } }),
    ]);

    return {
      message: SUCCESS.RECORD_FETCHED('JOB_CARD', this.i18n, lang),
      data: {
        linkPurpose: link.purpose,
        garage: {
          name: garage.name,
          phone: garage.phone,
          address: [garage.addressLine, garage.city].filter(Boolean).join(', ') || null,
        },
        customerFirstName: job.customer.name.split(' ')[0],
        vehicle: {
          registrationNumber: job.vehicle.registrationNumber,
          make: job.vehicle.make,
          model: job.vehicle.model,
        },
        jobNumber: job.jobNumber,
        status: job.status,
        checkedInAt: job.createdAt,
        promisedDeliveryAt: job.promisedDeliveryAt,
        problems: problems.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          severity: p.severity,
          category: p.category,
          photos: attachments
            .filter((a) => a.problemId === p.id)
            .map((a) => ({
              id: a.id,
              caption: a.caption,
              mimeType: a.mimeType,
              path: `attachments/${a.id}`,
            })),
        })),
        estimate: await this.estimateFor(link, garage.currency),
        timeline: history.map((h) => ({ status: h.toStatus, at: h.createdAt })),
        invoice: invoice
          ? {
              invoiceNumber: invoice.invoiceNumber,
              total: invoice.total,
              amountPaid: invoice.amountPaid,
              balanceDue: formatMinor(parseMinor(invoice.total) - parseMinor(invoice.amountPaid)),
            }
          : null,
      },
    };
  }

  async downloadAttachment(
    link: ICustomerLinkContext,
    attachmentId: string,
  ): Promise<IFileDownload> {
    const attachment = await this.dataSource
      .getRepository(Attachment)
      .findOne({ where: { id: attachmentId, jobCardId: link.jobCardId } });
    if (!attachment) throw apiError('NOT_FOUND');
    return {
      stream: await this.storage.openRead(attachment.storageKey),
      mimeType: attachment.mimeType,
      fileName: attachment.originalName,
      sizeBytes: attachment.sizeBytes,
    };
  }

  async respondToEstimate(
    link: ICustomerLinkContext,
    dto: EstimateDecisionDto,
    lang: string,
  ): Promise<IServiceResult<PortalEstimateDto>> {
    const result = await this.estimatesService.respondViaLink(link, dto, lang);
    const garage = await this.dataSource
      .getRepository(Garage)
      .findOneOrFail({ where: { id: link.garageId } });
    const estimate = await this.estimateFor(link, garage.currency);
    if (!estimate) throw apiError('NOT_FOUND');
    return { message: result.message, data: estimate };
  }

  /** The link's own estimate; for VIEW_JOB links, the latest one the owner has been sent. */
  private async estimateFor(
    link: ICustomerLinkContext,
    currency: string,
  ): Promise<PortalEstimateDto | null> {
    const repo = this.dataSource.getRepository(Estimate);
    const estimate = link.estimateId
      ? await repo.findOne({ where: { id: link.estimateId, jobCardId: link.jobCardId } })
      : await repo.findOne({
          where: {
            jobCardId: link.jobCardId,
            status: Not(In([EstimateStatus.DRAFT, EstimateStatus.SUPERSEDED])),
          },
          order: { version: 'DESC' },
        });
    if (!estimate) return null;
    const items = await this.dataSource
      .getRepository(EstimateLineItem)
      .find({ where: { estimateId: estimate.id }, order: { sortOrder: 'ASC' } });
    const canRespond =
      link.purpose === LinkPurpose.APPROVE_ESTIMATE &&
      link.estimateId === estimate.id &&
      estimate.status === EstimateStatus.SENT &&
      (!estimate.validUntil || estimate.validUntil > new Date());
    return {
      id: estimate.id,
      version: estimate.version,
      status: estimate.status,
      currency,
      items: items.map((i) => ({
        id: i.id,
        itemType: i.itemType,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
        approvalState: i.approvalState,
        problemId: i.problemId,
      })),
      subtotal: estimate.subtotal,
      taxRate: estimate.taxRate,
      taxAmount: estimate.taxAmount,
      total: estimate.total,
      approvedTotal: estimate.approvedTotal,
      validUntil: estimate.validUntil,
      respondedAt: estimate.respondedAt,
      canRespond,
    };
  }
}
