/**
 * Messages whose placeholders hold React elements (a <bdi> around a name, a
 * <kbd>): tx() returns the translated text with each element put in its
 * place. With only plain values it is the same as t().
 */
import { Fragment, createElement, isValidElement, type ReactNode } from 'react';
import { t } from './index';

export function tx(text: string, vars?: Record<string, unknown>): ReactNode {
  if (!vars || !Object.values(vars).some((v) => isValidElement(v) || Array.isArray(v))) return t(text, vars);
  // Translate with markers in place of the elements, then put the elements back.
  const marks: Record<string, unknown> = {};
  const nodes = new Map<string, unknown>();
  for (const [name, value] of Object.entries(vars)) {
    if (isValidElement(value) || Array.isArray(value)) {
      const mark = `\uE000${name}\uE000`;
      marks[name] = mark;
      nodes.set(mark, value);
    } else marks[name] = value;
  }
  const parts = t(text, marks).split(/(\uE000\w+\uE000)/);
  return createElement(
    Fragment,
    null,
    ...parts.filter((p) => p !== '').map((p, i) => createElement(Fragment, { key: i }, (nodes.get(p) as ReactNode | undefined) ?? p)),
  );
}
