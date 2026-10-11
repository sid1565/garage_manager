import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { SECTION_KEY } from '../constants/metadata-keys';
import { SectionKey } from '../constants/section-permissions';

/** Declares the section an endpoint belongs to; checked by SectionGuard. */
export const Section = (section: SectionKey): CustomDecorator<string> =>
  SetMetadata(SECTION_KEY, section);
