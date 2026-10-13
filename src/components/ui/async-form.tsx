import * as React from "react";

type Props = Omit<React.FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => unknown;
};

/** Form that blocks double submission: while onSubmit is running, all fields/buttons are disabled. */
export const AsyncForm = React.forwardRef<HTMLFormElement, Props>(({ onSubmit, children, ...props }, ref) => {
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);
  const handle = async (e: React.FormEvent<HTMLFormElement>) => {
    if (lock.current) { e.preventDefault(); return; }
    lock.current = true; setBusy(true);
    try { await onSubmit(e); } finally { lock.current = false; setBusy(false); }
  };
  return (
    <form ref={ref} onSubmit={handle} aria-busy={busy} {...props}>
      <fieldset disabled={busy} className="contents">{children}</fieldset>
    </form>
  );
});
AsyncForm.displayName = "AsyncForm";
