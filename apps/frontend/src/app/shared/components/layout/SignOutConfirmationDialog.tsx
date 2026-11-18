import { LogOut } from 'lucide-react';

import { Button } from '@shared/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog';

interface SignOutConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function SignOutConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
}: SignOutConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <LogOut className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle>¿Cerrar sesión?</DialogTitle>
          <DialogDescription>
            Tendrás que iniciar sesión nuevamente para volver a acceder.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Cerrar sesión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
