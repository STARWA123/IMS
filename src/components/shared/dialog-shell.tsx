"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

type DialogShellProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  className?: string;
  role?: "dialog" | "alertdialog";
  showClose?: boolean;
};

export function DialogShell({
  title,
  description,
  children,
  onClose,
  closeDisabled = false,
  className = "",
  role = "dialog",
  showClose = true,
}: DialogShellProps): ReactNode {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const disabledRef = useRef(closeDisabled);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    closeRef.current = onClose;
    disabledRef.current = closeDisabled;
  }, [closeDisabled, onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialogRef.current?.contains(document.activeElement)) {
      dialogRef.current?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !disabledRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  function requestClose(): void {
    if (!closeDisabled) {
      onClose();
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={requestClose} role="presentation">
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`dialog-card${className ? ` ${className}` : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role={role}
        tabIndex={-1}
      >
        <div className="dialog-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          {showClose ? (
            <button
              aria-label="关闭"
              className="icon-button"
              disabled={closeDisabled}
              onClick={requestClose}
              type="button"
            >
              ×
            </button>
          ) : null}
        </div>
        {children}
      </section>
    </div>
  );
}
