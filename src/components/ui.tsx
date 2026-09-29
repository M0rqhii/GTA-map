import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md';
  loading?: boolean;
};

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-sun text-ink-950 hover:bg-sun-strong border-sun',
  ghost: 'bg-transparent text-ink-100 border-ink-500 hover:border-sun hover:text-sun',
  danger: 'bg-transparent text-danger border-danger/60 hover:bg-danger hover:text-ink-950',
  subtle: 'bg-ink-700 text-ink-100 border-ink-600 hover:bg-ink-600',
};

export function Button({ variant = 'primary', size = 'md', loading, className = '', children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2 border font-display font-semibold uppercase tracking-[0.12em] transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-11 px-5 text-[15px]',
        VARIANTS[variant],
        className,
      ].join(' ')}
    >
      {loading ? <span className="inline-block h-3 w-3 animate-spin border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null; hint?: string };

export function TextField({ label, error, hint, className = '', ...rest }: FieldProps) {
  const id = useId();
  return (
    <label htmlFor={id} className={`block ${className}`}>
      <span className="label-caps">{label}</span>
      <input
        id={id}
        {...rest}
        className={[
          'mt-1.5 block h-11 w-full border bg-ink-950/70 px-3 font-mono text-[15px] text-ink-100 outline-none transition-colors',
          'placeholder:text-ink-500 focus:border-sun',
          error ? 'border-danger' : 'border-ink-600',
        ].join(' ')}
      />
      {error ? <span className="mt-1 block text-sm text-danger">{error}</span> : hint ? <span className="mt-1 block text-sm text-ink-400">{hint}</span> : null}
    </label>
  );
}

export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const text = size === 'lg' ? 'text-5xl' : size === 'md' ? 'text-3xl' : 'text-xl';
  return (
    <div className={`font-display font-extrabold uppercase leading-none tracking-[0.06em] ${text}`}>
      <span className="text-ink-100">Search</span>
      <span className="text-sun">Grid</span>
      <span className="ml-2 align-top font-mono text-[10px] font-normal tracking-[0.2em] text-ink-400">LS·SA</span>
    </div>
  );
}

export const NET_FLOW_URL = 'https://www.net-flow.pl';

// Subtle "powered by" credit.
export function Signature({ className = '' }: { className?: string }) {
  return (
    <a
      href={NET_FLOW_URL}
      target="_blank"
      rel="noopener"
      className={`group inline-flex items-baseline gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-500 transition-colors hover:text-ink-300 ${className}`}
      title="Net-Flow – strony, sklepy i systemy na zamówienie"
    >
      powered by
      <span className="font-display text-[12px] font-semibold tracking-[0.12em] text-ink-300 transition-colors group-hover:text-sun">Net-Flow</span>
    </a>
  );
}

export function Swatch({ color, size = 12, className = '' }: { color: string | null | undefined; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 border border-ink-950/60 ${className}`}
      style={{ width: size, height: size, background: color ?? 'transparent' }}
    />
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-display text-lg font-semibold uppercase tracking-[0.1em] text-ink-100">{children}</h2>
      {aside}
    </div>
  );
}

export function Splash({ text = 'Łączenie' }: { text?: string }) {
  return (
    <div className="grid h-full place-items-center bg-ink-900">
      <div className="text-center">
        <Wordmark size="md" />
        <div className="relative mx-auto mt-5 h-[2px] w-40 overflow-hidden bg-ink-700">
          <div className="absolute inset-y-0 w-1/2 animate-scan bg-sun" />
        </div>
        <p className="label-caps mt-3">{text}<span className="animate-blink">_</span></p>
      </div>
    </div>
  );
}
