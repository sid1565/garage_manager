import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AUDIT_ACTIONS } from '../../../common/constants/audit-actions';
import { SUCCESS } from '../../../common/constants/messages';
import { apiError } from '../../../common/helpers/api-error.helper';
import { IAuthUser, IServiceResult } from '../../../common/interfaces';
import { requireGarageId } from '../../../common/utils/tenant.util';
import { ActorType } from '../../audit/enums/actor-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { EstimateLineItem } from '../../estimates/entities/estimate-line-item.entity';
import { Estimate } from '../../estimates/entities/estimate.entity';
import { EstimateStatus } from '../../estimates/enums/estimate-status.enum';
import { AttachmentDto } from '../dto/attachment.dto';
import { CreateProblemDto, ProblemDto, UpdateProblemDto } from '../dto/problem.dto';
import { Attachment } from '../entities/attachment.entity';
import { Problem } from '../entities/problem.entity';
import { JobCardStatus } from '../enums/job-card-status.enum';
import {
  applyStatusChange,
  assertDiagnosisWritable,
  findJobInGarage,
} from '../utils/job-access.util';
import { assertSystemTransition } from '../utils/job-status.machine';

export const toAttachmentDto = (a: Attachment): AttachmentDto => ({
  id: a.id,
  jobCardId: a.jobCardId,
  problemId: a.problemId,
  originalName: a.originalName,
  mimeType: a.mimeType,
  sizeBytes: a.sizeBytes,
  caption: a.caption,
  uploadedBy: { id: a.uploadedBy.id, name: a.uploadedBy.name },
  createdAt: a.createdAt,
});

/**
 * UC-9. Writes require a diagnosis-stage job (CHECKED_IN/DIAGNOSING/IN_PROGRESS) and, for
 * mechanics, assignment (AC-9.2). A problem quoted on a sent estimate is locked: the owner
 * has seen it, so it can't be silently edited or removed.
 */
@Injectable()
export class ProblemsService {
  private readonly logger = new Logger(ProblemsService.name);

  constructor(
    private readonly i18n: I18nService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Problem) private readonly problemRepo: Repository<Problem>,
    @InjectRepository(Attachment) private readonly attachmentRepo: Repository<Attachment>,
    private readonly auditService: AuditService,
  ) {}

  async list(
    user: IAuthUser,
    jobCardId: string,
    lang: string,
  ): Promise<IServiceResult<ProblemDto[]>> {
    await findJobInGarage(this.dataSource.manager, requireGarageId(user), jobCardId);
    const problems = await this.problemRepo.find({
      where: { jobCardId },
      relations: { recordedBy: true },
      order: { createdAt: 'ASC' },
    });
    return {
      message: SUCCESS.RECORD_LIST_FETCHED('PROBLEM', this.i18n, lang),
      data: await this.toDtos(problems),
    };
  }

  async create(
    user: IAuthUser,
    jobCardId: string,
    dto: CreateProblemDto,
    lang: string,
  ): Promise<IServiceResult<ProblemDto>> {
    const garageId = requireGarageId(user);
    const problemId = await this.dataSource.transaction(async (manager) => {
      const job = await findJobInGarage(manager, garageId, jobCardId, true);
      assertDiagnosisWritable(user, job);
      const repo = manager.getRepository(Problem);
      const problem = await repo.save(
        repo.create({
          jobCardId,
          title: dto.title.trim(),
          description: dto.description ?? null,
          severity: dto.severity,
          category: dto.category,
          // Found during the repair → needs a new estimate version (UC-9 1b).
          requiresNewEstimate: job.status === JobCardStatus.IN_PROGRESS,
          recordedById: user.id,
        }),
      );
      if (job.status === JobCardStatus.CHECKED_IN) {
        assertSystemTransition(job.status, JobCardStatus.DIAGNOSING);
        await applyStatusChange(manager, job, JobCardStatus.DIAGNOSING, user.id); // AC-9.1
      }
      await this.audit(manager, user, AUDIT_ACTIONS.PROBLEM_RECORDED, problem.id, {
        jobCardId,
        title: problem.title,
        severity: problem.severity,
      });
      return problem.id;
    });
    return {
      message: SUCCESS.RECORD_CREATED('PROBLEM', this.i18n, lang),
      data: await this.loadDto(problemId),
    };
  }

  async update(
    user: IAuthUser,
    jobCardId: string,
    problemId: string,
    dto: UpdateProblemDto,
    lang: string,
  ): Promise<IServiceResult<ProblemDto>> {
    const garageId = requireGarageId(user);
    await this.dataSource.transaction(async (manager) => {
      const problem = await this.findWritableProblem(manager, user, garageId, jobCardId, problemId);
      if (dto.title !== undefined) problem.title = dto.title.trim();
      if (dto.description !== undefined) problem.description = dto.description;
      if (dto.severity !== undefined) problem.severity = dto.severity;
      if (dto.category !== undefined) problem.category = dto.category;
      if (dto.requiresNewEstimate !== undefined)
        problem.requiresNewEstimate = dto.requiresNewEstimate;
      await manager.getRepository(Problem).save(problem);
      await this.audit(manager, user, AUDIT_ACTIONS.PROBLEM_UPDATED, problemId, {
        fields: Object.keys(dto),
      });
    });
    return {
      message: SUCCESS.RECORD_UPDATED('PROBLEM', this.i18n, lang),
      data: await this.loadDto(problemId),
    };
  }

  /** Hard delete (UC-9 1a). Its photos stay on the job card (problem_id → NULL). */
  async remove(
    user: IAuthUser,
    jobCardId: string,
    problemId: string,
    _lang: string,
  ): Promise<void> {
    const garageId = requireGarageId(user);
    await this.dataSource.transaction(async (manager) => {
      const problem = await this.findWritableProblem(manager, user, garageId, jobCardId, problemId);
      await manager.getRepository(Problem).delete({ id: problem.id });
      await this.audit(manager, user, AUDIT_ACTIONS.PROBLEM_REMOVED, problemId, {
        title: problem.title,
      });
    });
  }

  private async findWritableProblem(
    manager: EntityManager,
    user: IAuthUser,
    garageId: string,
    jobCardId: string,
    problemId: string,
  ): Promise<Problem> {
    const job = await findJobInGarage(manager, garageId, jobCardId, true);
    assertDiagnosisWritable(user, job);
    const problem = await manager
      .getRepository(Problem)
      .findOne({ where: { id: problemId, jobCardId } });
    if (!problem) throw apiError('NOT_FOUND');
    if ((await this.lockedIds(manager, [problemId])).has(problemId))
      throw apiError('PROBLEM_LOCKED');
    return problem;
  }

  /** Problems referenced by any estimate that has left DRAFT. */
  private async lockedIds(manager: EntityManager, problemIds: string[]): Promise<Set<string>> {
    if (problemIds.length === 0) return new Set();
    const rows: { problem_id: string }[] = await manager
      .getRepository(EstimateLineItem)
      .createQueryBuilder('li')
      .innerJoin(Estimate, 'e', 'e.id = li.estimate_id')
      .select('DISTINCT li.problem_id', 'problem_id')
      .where({ problemId: In(problemIds) })
      .andWhere('e.status != :draft', { draft: EstimateStatus.DRAFT })
      .getRawMany();
    return new Set(rows.map((r) => r.problem_id));
  }

  private async loadDto(problemId: string): Promise<ProblemDto> {
    const problem = await this.problemRepo.findOneOrFail({
      where: { id: problemId },
      relations: { recordedBy: true },
    });
    return (await this.toDtos([problem]))[0];
  }

  private async toDtos(problems: Problem[]): Promise<ProblemDto[]> {
    const ids = problems.map((p) => p.id);
    const [attachments, locked] = await Promise.all([
      ids.length
        ? this.attachmentRepo.find({
            where: { problemId: In(ids) },
            relations: { uploadedBy: true },
            order: { createdAt: 'ASC' },
          })
        : Promise.resolve([]),
      this.lockedIds(this.dataSource.manager, ids),
    ]);
    return problems.map((p) => ({
      id: p.id,
      jobCardId: p.jobCardId,
      title: p.title,
      description: p.description,
      severity: p.severity,
      category: p.category,
      requiresNewEstimate: p.requiresNewEstimate,
      locked: locked.has(p.id),
      recordedBy: { id: p.recordedBy.id, name: p.recordedBy.name },
      attachments: attachments.filter((a) => a.problemId === p.id).map(toAttachmentDto),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  private audit(
    manager: EntityManager,
    user: IAuthUser,
    action: string,
    problemId: string,
    changes: Record<string, unknown>,
  ): Promise<void> {
    return this.auditService.record(
      {
        garageId: user.garageId,
        actorType: ActorType.STAFF,
        actorUserId: user.id,
        action,
        entityType: 'problem',
        entityId: problemId,
        changes,
      },
      manager,
    );
  }
}
