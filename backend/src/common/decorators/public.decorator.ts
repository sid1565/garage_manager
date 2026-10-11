import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../constants/metadata-keys';

/** Marks a route as anonymous — UserAuthGuard and SectionGuard skip it. */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
