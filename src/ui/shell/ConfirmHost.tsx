import { useRef } from 'react';
import { Button, Dialog, DialogContent } from '../kit';
import { useApp } from '../../store';

import { t } from '../../i18n';
/**
 * The in-app confirm dialog behind useApp().confirm / confirmDialog(). It
 * opens on the safe choice: Cancel when the action is destructive (so
 * Backspace then Enter never deletes anything), the confirm button otherwise.
 */
export function ConfirmHost() {
  const request = useApp((s) => s.confirmRequest);
  const resolve = useApp((s) => s.resolveConfirm);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && resolve(false)}>
      {request && (
        <DialogContent
          size="sm"
          title={request.title}
          description={request.message}
          // Focused here rather than with autoFocus: the dialog's focus trap then
          // knows the button, and keeps it when a closing menu grabs focus back.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (request.danger ? cancelRef : confirmRef).current?.focus();
          }}
          footer={
            <>
              <Button ref={cancelRef} variant="secondary" onClick={() => resolve(false)}>
                {request.cancelLabel ?? t('Cancel')}
              </Button>
              <Button ref={confirmRef} variant={request.danger ? 'danger' : 'primary'} onClick={() => resolve(true)}>
                {request.confirmLabel ?? t('Confirm')}
              </Button>
            </>
          }
        />
      )}
    </Dialog>
  );
}
