import type { PropsWithChildren, ReactNode } from "react";

interface ModalProps extends PropsWithChildren {
  open: boolean;
  title: ReactNode;
  maxWidth?: number;
  footer?: ReactNode;
  onClose: () => void;
}

export function Modal({ open, title, maxWidth = 560, footer, children, onClose }: ModalProps) {
  if (!open) return null;

  return (
    <div className="overlay open" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth }}>
        <div className="modal-hdr">
          <span className="modal-title">{title}</span>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
