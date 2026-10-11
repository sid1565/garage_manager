import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, Repository } from 'typeorm';
import { AUDIT_ACTIONS } from '../../../common/constants/audit-actions';
import { SUCCESS } from '../../../common/constants/messages';
import { MAX_ATTACHMENTS_PER_PROBLEM } from '../../../common/constants/upload.constants';
import { apiError } from '../../../common/helpers/api-error.helper';
import { IAuthUser, IFileDownload, IServiceResult } from '../../../common/interfaces';
import { requireGarageId } from '../../../common/utils/tenant.util';
import { ActorType } from '../../audit/enums/actor-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { StorageService } from '../../storage/services/storage.service';
import { AttachmentDto, UploadAttachmentDto } from '../dto/attachment.dto';
import { Attachment } from '../entities/attachment.entity';
import { Problem } from '../entities/problem.entity';
import { assertDiagnosisWritable, findJobInGarage } from '../utils/job-access.util';
import { detectMimeType, safeFileName } from '../utils/file-signature.util';
import { toAttachmentDto } from './problems.service';

/**
 * UC-9 photos / NFR-8. The stored type is the one DETECTED from magic bytes; the client
 * mimetype and file name are display-only. Files are written before the DB row and removed
 * again if the insert fails, so the DB never points at a missing file.
 */
@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly i18n: I18nService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Attachment) private readonly attachmentRepo: Repository<Attachment>,
    private readonly storage: StorageService,
    private readonly auditService: AuditService,
  ) {}

  async upload(
    user: IAuthUser,
    jobCardId: string,
    file: Express.Multer.File,
    dto: UploadAttachmentDto,
    lang: string,
  ): Promise<IServiceResult<AttachmentDto>> {
    const garageId = requireGarageId(user);
    const mimeType = detectMimeType(file.buffer);
    if (!mimeType) throw apiError('UNSUPPORTED_FILE_TYPE');

    // Validate before touching storage (cheap rejects, no orphan files).
    const job = await findJobInGarage(this.dataSource.manager, garageId, jobCardId);
    assertDiagnosisWritable(user, job);
    const stored = await this.storage.put(garageId, file.buffer, mimeType);

    try {
      const id = await this.dataSource.transaction(async (manager) => {
        const locked = await findJobInGarage(manager, garageId, jobCardId, true);
        assertDiagnosisWritable(user, locked); // re-check under lock
        if (dto.problemId) {
          const problem = await manager
            .getRepository(Problem)
            .findOne({ where: { id: dto.problemId, jobCardId } });
          if (!problem) throw apiError('INVALID_PROBLEM_REFERENCE');
          const count = await manager
            .getRepository(Attachment)
            .count({ where: { problemId: problem.id } });
          if (count >= MAX_ATTACHMENTS_PER_PROBLEM) throw apiError('TOO_MANY_ATTACHMENTS');
        }
        const repo = manager.getRepository(Attachment);
        const attachment = await repo.save(
          repo.create({
            jobCardId,
            problemId: dto.problemId ?? null,
            storageKey: stored.key,
            originalName: safeFileName(file.originalname),
            mimeType,
            sizeBytes: stored.sizeBytes,
            caption: dto.caption?.trim() || null,
            uploadedById: user.id,
          }),
        );
        await this.auditService.record(
          {
            garageId,
            actorType: ActorType.STAFF,
            actorUserId: user.id,
            action: AUDIT_ACTIONS.ATTACHMENT_UPLOADED,
            entityType: 'attachment',
            entityId: attachment.id,
            changes: {
              jobCardId,
              problemId: attachment.problemId,
              mimeType,
              sizeBytes: stored.sizeBytes,
            },
          },
          manager,
        );
        return attachment.id;
      });
      const saved = await this.attachmentRepo.findOneOrFail({
        where: { id },
        relations: { uploadedBy: true },
      });
      return {
        message: SUCCESS.RECORD_CREATED('ATTACHMENT', this.i18n, lang),
        data: toAttachmentDto(saved),
      };
    } catch (error) {
      await this.storage.remove(stored.key);
      throw error;
    }
  }

  async list(
    user: IAuthUser,
    jobCardId: string,
    lang: string,
  ): Promise<IServiceResult<AttachmentDto[]>> {
    await findJobInGarage(this.dataSource.manager, requireGarageId(user), jobCardId);
    const rows = await this.attachmentRepo.find({
      where: { jobCardId },
      relations: { uploadedBy: true },
      order: { createdAt: 'ASC' },
    });
    return {
      message: SUCCESS.RECORD_LIST_FETCHED('ATTACHMENT', this.i18n, lang),
      data: rows.map(toAttachmentDto),
    };
  }

  async download(user: IAuthUser, jobCardId: string, attachmentId: string): Promise<IFileDownload> {
    await findJobInGarage(this.dataSource.manager, requireGarageId(user), jobCardId);
    const attachment = await this.attachmentRepo.findOne({
      where: { id: attachmentId, jobCardId },
    });
    if (!attachment) throw apiError('NOT_FOUND');
    return {
      stream: await this.storage.openRead(attachment.storageKey),
      mimeType: attachment.mimeType,
      fileName: attachment.originalName,
      sizeBytes: attachment.sizeBytes,
    };
  }

  /** Row deleted in the transaction; the file only after commit (a rollback keeps both). */
  async remove(
    user: IAuthUser,
    jobCardId: string,
    attachmentId: string,
    _lang: string,
  ): Promise<void> {
    const garageId = requireGarageId(user);
    const storageKey = await this.dataSource.transaction(async (manager) => {
      const job = await findJobInGarage(manager, garageId, jobCardId, true);
      assertDiagnosisWritable(user, job);
      const attachment = await manager
        .getRepository(Attachment)
        .findOne({ where: { id: attachmentId, jobCardId } });
      if (!attachment) throw apiError('NOT_FOUND');
      await manager.getRepository(Attachment).delete({ id: attachment.id });
      await this.auditService.record(
        {
          garageId,
          actorType: ActorType.STAFF,
          actorUserId: user.id,
          action: AUDIT_ACTIONS.ATTACHMENT_REMOVED,
          entityType: 'attachment',
          entityId: attachment.id,
          changes: { jobCardId, originalName: attachment.originalName },
        },
        manager,
      );
      return attachment.storageKey;
    });
    await this.storage.remove(storageKey);
  }
}
