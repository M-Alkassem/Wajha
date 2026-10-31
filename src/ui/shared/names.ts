/** Device family and language names in the interface language. */
import { t } from '../../i18n';
import { FAMILIES, languageInfo } from '../../model/catalog';
import type { FamilyId, LangCode } from '../../model/types';

/** "iPhone landscape", "Apple Watch". */
export const familyLabel = (family: FamilyId): string => t(FAMILIES[family]?.label ?? family);

/** The short form the family tabs use: "Android", "TV". */
export const familyShortLabel = (family: FamilyId): string => t(FAMILIES[family]?.shortLabel ?? family);

/** "English (US)", or its Arabic name in an Arabic interface. */
export const languageLabel = (code: LangCode): string => t(languageInfo(code).name);
