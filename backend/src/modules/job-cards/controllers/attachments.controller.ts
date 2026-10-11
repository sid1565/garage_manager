import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { MAX_UPLOAD_BYTES } from '../../../common/constants/upload.constants';
import { ApiEnvelope, ApiErrors, CurrentUser, Section } from '../../../common/decorators';
import { EUserModule } from '../../../common/enums';
import { toStreamableFile } from '../../../common/helpers/download.helper';
import { ResponseHelper } from '../../../common/helpers/response.helper';
import { IApiResponse, IAuthUser } from '../../../common/interfaces';
import { UUIDValidationPipe } from '../../../common/pipes/uuid-validation.pipe';
import { AttachmentDto, UploadAttachmentDto } from '../dto/attachment.dto';
import { AttachmentsService } from '../services/attachments.service';

const PROTECTED_ERRORS = [HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN] as const;

/** First-pass file checks; the service verifies magic bytes (declared type can be forged). */
const uploadPipe = new ParseFilePipeBuilder()
  .addFileTypeValidator({ fileType: /^(image\/jpeg|image\/png|image\/webp|application\/pdf)$/ })
  .addMaxSizeValidator({ maxSize: MAX_UPLOAD_BYTES })
  .build({ errorHttpStatusCode: HttpStatus.BAD_REQUEST });

/** Photo / PDF evidence on a job card (UC-9, NFR-8). */
@ApiTags('Job Cards — Attachments')
@ApiBearerAuth()
@Controller('job-cards/:job_card_id/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  @Section(EUserModule.DIAGNOSIS_RECORD)
  @HttpCode(HttpStatus.CREATED)
  // Multer rejects oversize bodies before buffering them fully; one file per request.
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 4 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'jpeg/png/webp/pdf, ≤ 5 MB' },
        problemId: { type: 'string', format: 'uuid' },
        caption: { type: 'string', maxLength: 255 },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a photo or PDF, optionally linked to a problem' })
  @ApiEnvelope(AttachmentDto, { status: HttpStatus.CREATED })
  @ApiErrors(
    HttpStatus.BAD_REQUEST,
    ...PROTECTED_ERRORS,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
    HttpStatus.PAYLOAD_TOO_LARGE,
  )
  async upload(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @UploadedFile(uploadPipe) file: Express.Multer.File,
    @Body() dto: UploadAttachmentDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<AttachmentDto>> {
    const result = await this.attachmentsService.upload(user, jobCardId, file, dto, lang);
    return ResponseHelper.success(result.message, result.data, HttpStatus.CREATED);
  }

  @Get()
  @Section(EUserModule.JOB_CARDS_VIEW)
  @ApiOperation({ summary: 'List attachments of a job card' })
  @ApiEnvelope(AttachmentDto, { isArray: true })
  @ApiErrors(...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async list(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<AttachmentDto[]>> {
    const result = await this.attachmentsService.list(user, jobCardId, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Get(':attachment_id/download')
  @Section(EUserModule.JOB_CARDS_VIEW)
  @ApiOperation({ summary: 'Download the file (always Content-Disposition: attachment)' })
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiErrors(...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async download(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Param('attachment_id', UUIDValidationPipe) attachmentId: string,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.attachmentsService.download(user, jobCardId, attachmentId));
  }

  @Delete(':attachment_id')
  @Section(EUserModule.DIAGNOSIS_RECORD)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an attachment' })
  @ApiNoContentResponse()
  @ApiErrors(...PROTECTED_ERRORS, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async remove(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Param('attachment_id', UUIDValidationPipe) attachmentId: string,
    @Headers('accept-language') lang: string,
  ): Promise<void> {
    await this.attachmentsService.remove(user, jobCardId, attachmentId, lang);
  }
}
