/**
 * Per-language type. One layout serves every language, but scripts differ:
 * Arabic needs taller lines than Latin, CJK reads better in its own face.
 * A language may name one font for all of its text (weights stay per text,
 * so headlines stay bold) and a line-spacing factor applied to every text's
 * own line height. Absent settings leave each text as styled.
 */
import type { LangCode, LanguageTypography, Project, TextStyle } from './types';

/** The type settings of `lang`, or null when it has none. */
export function languageTypography(project: Pick<Project, 'typography'> | null | undefined, lang: LangCode): LanguageTypography | null {
  const all = project?.typography;
  if (!all || typeof all !== 'object' || !Object.prototype.hasOwnProperty.call(all, lang)) return null;
  const own = all[lang];
  return own && typeof own === 'object' ? own : null;
}

/** A text style as drawn in a language with `type` settings. */
export function styleForLanguage(style: TextStyle, type: LanguageTypography | null | undefined): TextStyle {
  if (!type) return style;
  const font = typeof type.font === 'string' && type.font ? type.font : null;
  const spacing = typeof type.lineSpacing === 'number' && Number.isFinite(type.lineSpacing) ? type.lineSpacing : 1;
  if (!font && spacing === 1) return style;
  const out = { ...style };
  if (font) out.font = font;
  if (spacing !== 1 && typeof style.lineHeight === 'number') out.lineHeight = style.lineHeight * spacing;
  return out;
}
