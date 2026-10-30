import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blankProject } from '../../model/defaults';
import { selectActiveLayout, useEditor } from '../../store';
import { useEditorChrome } from './chrome';
import { useEditorUi } from './editorUi';

function idOf(kind: 'text' | 'device'): string {
  return selectActiveLayout(useEditor.getState())!.elements.find((e) => e.kind === kind)!.id;
}

beforeEach(() => {
  useEditor.getState().openProject(blankProject('Focus', ['iphone'], ['en-US']));
  useEditorChrome.getState().setRightOpen(true);
});

afterEach(() => {
  useEditor.getState().closeProject();
  useEditorUi.setState({ textFocus: null });
  useEditorChrome.getState().setRightOpen(true);
});

describe('text focus requests', () => {
  it('shows a hidden inspector, so the request is answered right away', () => {
    const text = idOf('text');
    useEditor.getState().select(text);
    useEditorChrome.getState().setRightOpen(false);
    useEditorUi.getState().requestTextFocus(text);
    expect(useEditorChrome.getState().rightOpen).toBe(true);
    expect(useEditorUi.getState().textFocus?.elementId).toBe(text);
  });

  it('is served once: the field takes it, and a newer request survives an older take', () => {
    const text = idOf('text');
    useEditor.getState().select(text);
    useEditorUi.getState().requestTextFocus(text);
    const first = useEditorUi.getState().textFocus!.nonce;
    useEditorUi.getState().requestTextFocus(text);
    const second = useEditorUi.getState().textFocus!.nonce;
    expect(second).not.toBe(first);
    useEditorUi.getState().takeTextFocus(first);
    expect(useEditorUi.getState().textFocus?.nonce).toBe(second);
    useEditorUi.getState().takeTextFocus(second);
    expect(useEditorUi.getState().textFocus).toBeNull();
  });

  it('is dropped when something else is selected, so it cannot steal focus later', () => {
    // The review's path: a request nobody answered, the phone clicked, then the text picked again.
    const text = idOf('text');
    useEditor.getState().select(text);
    useEditorUi.getState().requestTextFocus(text);
    useEditor.getState().select(idOf('device'));
    expect(useEditorUi.getState().textFocus).toBeNull();
    useEditor.getState().select(text);
    expect(useEditorUi.getState().textFocus).toBeNull();
  });

  it('survives edits that keep the selection, and dies with the deselect', () => {
    const text = idOf('text');
    const s = useEditor.getState();
    s.select(text);
    useEditorUi.getState().requestTextFocus(text);
    s.updateElement(s.activeSlideId!, s.activeFamily, text, { x: 0.4 });
    expect(useEditorUi.getState().textFocus?.elementId).toBe(text);
    useEditor.getState().select(null);
    expect(useEditorUi.getState().textFocus).toBeNull();
  });

  it('ignores requests for an element that is not selected', () => {
    useEditor.getState().select(idOf('device'));
    useEditorChrome.getState().setRightOpen(false);
    useEditorUi.getState().requestTextFocus(idOf('text'));
    expect(useEditorUi.getState().textFocus).toBeNull();
    expect(useEditorChrome.getState().rightOpen).toBe(false);
  });
});
