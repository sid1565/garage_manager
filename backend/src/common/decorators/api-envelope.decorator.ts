import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

interface IEnvelopeOptions {
  status?: HttpStatus;
  description?: string;
  /** List endpoint: { status, message, limit, offset, total, data: Model[] }. */
  paginated?: boolean;
  /** data is an array but not paginated. */
  isArray?: boolean;
}

/**
 * Documents the ResponseHelper envelope around a response DTO:
 *   single  → { status, message, data: Model }
 *   list    → { status, message, limit, offset, total, data: Model[] }
 */
export const ApiEnvelope = (
  model: Type<unknown>,
  options: IEnvelopeOptions = {},
): MethodDecorator => {
  const status = options.status ?? HttpStatus.OK;
  const ref = { $ref: getSchemaPath(model) };
  const data = options.paginated || options.isArray ? { type: 'array', items: ref } : ref;
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      description: options.description,
      schema: {
        type: 'object',
        required: ['status', 'message', 'data'],
        properties: {
          status: { type: 'number', example: status },
          message: { type: 'string', example: 'Record fetched successfully' },
          ...(options.paginated
            ? {
                limit: { type: 'number', example: 20 },
                offset: { type: 'number', example: 0 },
                total: { type: 'number', example: 57 },
              }
            : {}),
          data,
        },
      },
    }),
  );
};

/** Standard error envelope documentation for the listed statuses. */
export const ApiErrors = (...statuses: HttpStatus[]): MethodDecorator =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: 'Standard error envelope',
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: status },
            errorCode: { type: 'string', example: 'VALIDATION_FAILED' },
            message: { type: 'string' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: { field: { type: 'string' }, issue: { type: 'string' } },
              },
            },
            timestamp: { type: 'string', format: 'date-time' },
            path: { type: 'string' },
          },
        },
      }),
    ),
  );
