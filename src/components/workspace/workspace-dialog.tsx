import type { ReactNode } from "react";
import { DialogShell } from "../shared/dialog-shell";

export function WorkspaceDialog({
  title,
  description,
  onClose,
  closeDisabled = false,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  children: ReactNode;
}): ReactNode {
  return (
    <DialogShell
      closeDisabled={closeDisabled}
      description={description}
      onClose={onClose}
      title={title}
    >
      {children}
    </DialogShell>
  );
}
