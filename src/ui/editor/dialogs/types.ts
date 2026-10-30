/** Every editor dialog is controlled by EditorScreen through useEditorUi. */
export interface EditorDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}
