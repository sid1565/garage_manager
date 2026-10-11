import { registerDecorator, ValidationArguments } from 'class-validator';

/**
 * Class decorator for list query DTOs extending FindAllQueryDto: restricts the
 * inherited `order` object to whitelisted keys and ASC/DESC values, without
 * redefining the field. Raw client keys never reach TypeORM (auth design §5).
 *
 *   @AllowedOrderKeys(['createdAt', 'name'])
 *   export class ListCustomersQueryDto extends FindAllQueryDto { … }
 */
export const AllowedOrderKeys =
  (keys: readonly string[]): ClassDecorator =>
  (target) => {
    registerDecorator({
      name: 'allowedOrderKeys',
      target,
      propertyName: 'order',
      constraints: [keys],
      options: { message: `order may only use keys [${keys.join(', ')}] with ASC or DESC` },
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (value === undefined) return true;
          if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
          const allowed = args.constraints[0] as readonly string[];
          const entries = Object.entries(value as Record<string, unknown>);
          return (
            entries.length > 0 &&
            entries.length <= 2 &&
            entries.every(
              ([key, dir]) => allowed.includes(key) && (dir === 'ASC' || dir === 'DESC'),
            )
          );
        },
      },
    });
  };
