import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Focus-trapping dialog. Reserved for creation, review, and confirmation tasks. */
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key !== 'Tab') return;
      const list = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,a[href],[tabindex="0"]',
        ) ?? [],
      );
      const first = list[0],
        last = list.at(-1);
      if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === ref.current)
      ) {
        last?.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={'modal ' + (wide ? 'wide' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <strong>{title}</strong>
          <button className="icon-button" aria-label="Close dialog" onClick={close}>
            <X size={17} />
          </button>
        </div>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}
