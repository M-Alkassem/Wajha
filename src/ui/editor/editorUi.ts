import { create } from 'zustand';
import { useEditor } from '../../store';
import { useEditorChrome } from './chrome';

/** Dialogs the editor can show; EditorScreen renders the one that is open. */
export type EditorDialog = 'export' | 'translations' | 'languages' | 'families' | 'saveTemplate' | 'shortcuts';

/** A request for the inspector to focus the text field of a text element. */
export interface TextFocusRequest {
  elementId: string;
  /** Unique per request. */
  nonce: number;
}

export interface EditorUiState {
  dialog: EditorDialog | null;
  /** The dialog that opened `dialog` and comes back when it closes (Translations > Manage languages). */
  returnTo: EditorDialog | null;
  /** Opens `dialog`; pass `returnTo` when another dialog opens it and should come back afterwards. */
  openDialog(dialog: EditorDialog, returnTo?: EditorDialog): void;
  /** Closes every dialog. */
  closeDialog(): void;
  /**
   * Pending request to focus the text field of the selected text element
   * (double-click on canvas text, a new text layer). One-shot: the field
   * takes it when it focuses, and selecting anything else drops it, so a
   * request can never steal focus later.
   */
  textFocus: TextFocusRequest | null;
  /** Asks for the text field of the selected element `elementId`, showing the inspector if it is hidden. */
  requestTextFocus(elementId: string): void;
  /** Marks the request `nonce` as served (a newer request stays). */
  takeTextFocus(nonce: number): void;
}

let lastNonce = 0;

/** Editor-only UI state that is not part of the project (and never undoable). */
export const useEditorUi = create<EditorUiState>()((set, get) => ({
  dialog: null,
  returnTo: null,
  openDialog: (dialog, returnTo) => set({ dialog, returnTo: returnTo ?? null }),
  closeDialog: () => set({ dialog: null, returnTo: null }),
  textFocus: null,
  requestTextFocus: (elementId) => {
    // Only the selected element has a text field to focus.
    if (useEditor.getState().selection !== elementId) return;
    set({ textFocus: { elementId, nonce: ++lastNonce } });
    // The field lives in the inspector: a hidden one would leave the request unanswered.
    useEditorChrome.getState().setRightOpen(true);
  },
  takeTextFocus: (nonce) => {
    if (get().textFocus?.nonce === nonce) set({ textFocus: null });
  },
}));

// A request belongs to the selection it was made for.
useEditor.subscribe((s, prev) => {
  if (s.selection === prev.selection) return;
  const request = useEditorUi.getState().textFocus;
  if (request && request.elementId !== s.selection) useEditorUi.setState({ textFocus: null });
});
