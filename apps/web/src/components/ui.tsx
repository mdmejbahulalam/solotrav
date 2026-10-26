import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'coral' | 'success';
/** Design system buttons: 48 px high, 12 px radius, 15/600. Coral is the single creation accent (navy text on coral). */
const base = 'inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold whitespace-nowrap transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-pressed',
  secondary: 'border-[1.5px] border-primary bg-surface text-primary hover:bg-primary-soft',
  ghost: 'text-primary hover:bg-primary-soft',
  danger: 'bg-bad text-white hover:opacity-90',
  coral: 'bg-coral text-[#102A43] hover:brightness-95',
  success: 'bg-ok text-white hover:opacity-90',
};

export const buttonClass = (variant: Variant = 'primary', extra?: string) => cx(base, variants[variant], extra);

export function Button({ variant = 'primary', loading, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || loading} aria-busy={loading || undefined} className={cx(base, variants[variant], className)}>
      {loading && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = 'primary', className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx(base, variants[variant], className)}>
      {children}
    </Link>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('overflow-hidden rounded-[20px] border border-line bg-surface', className)}>{children}</div>;
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'ok' | 'warn' | 'bad' | 'coral' | 'teal' }) {
  const tones = {
    neutral: 'bg-fill text-body', blue: 'bg-primary-soft text-primary-pressed', ok: 'bg-ok-soft text-ok', warn: 'bg-[#fff4d6] text-[#8a5a00]',
    bad: 'bg-[#fde8e2] text-[#9a3412]', coral: 'bg-coral-soft text-coral-text', teal: 'bg-teal-soft text-teal-text',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold', tones[tone])}>{children}</span>;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'error' | 'ok' }) {
  const tones = {
    info: 'bg-primary-soft text-ink',
    warn: 'bg-[#fff4d6] text-[#5c3b00]',
    error: 'bg-[#fde8e2] text-bad',
    ok: 'border border-ok bg-ok-soft text-ink',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-2xl px-4 py-3 text-sm leading-[19px]', tones[tone])}>
      {children}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12 text-center">
      <div aria-hidden className="mx-auto mb-4 flex size-16 items-center justify-center rounded-[20px] bg-primary-soft text-primary"><Icon name="explore" size={32} /></div>
      <h2 className="text-lg font-extrabold text-navy">{title}</h2>
      {children && <p className="mt-1 mb-4 text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}

/** Progress is green (completed), tracked as a solid fill. */
export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  return (
    <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Progress'} className="h-2.5 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full bg-ok-fill transition-all" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Segmented progress: one segment per stop (green = done, blue = current, grey = upcoming). */
export function Segments({ total, done, current, label }: { total: number; done: number; current?: number; label?: string }) {
  return (
    <div role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label={label ?? `${done} of ${total}`} className="flex gap-1">
      {Array.from({ length: total }, (_, i) => <span key={i} className={cx('h-2 flex-1 rounded', i < done ? 'bg-ok-fill' : current === i ? 'bg-primary' : 'bg-line')} />)}
    </div>
  );
}

const AVATAR_BG = ['bg-[#19b5a5]', 'bg-[#e6a23c]', 'bg-[#b9c3d3]', 'bg-[#ff7657]', 'bg-[#c9d6e8]'];
export function Avatar({ name, src, size = 40, gradient }: { name: string; src?: string | null; size?: number; gradient?: boolean }) {
  const initials = name.split(/[\s._]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
  if (src) {
    return <img src={src} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_BG.length;
  return (
    <span aria-hidden className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-bold', gradient ? 'bg-gradient-to-br from-primary to-teal text-white' : cx(AVATAR_BG[idx], 'text-[#102A43]'))} style={{ width: size, height: size, fontSize: Math.max(11, size * 0.34) }}>
      {initials}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

export function ConfigNotice({ what, vars }: { what: string; vars: string[] }) {
  return (
    <Notice tone="warn">
      <p className="font-bold">{what} is not configured</p>
      <p className="mt-1">
        Set {vars.map((v, i) => (<span key={v}>{i > 0 && ', '}<code className="rounded bg-white/60 px-1">{v}</code></span>))} in <code className="rounded bg-white/60 px-1">.env.local</code> and restart. See docs/SETUP.md.
      </p>
    </Notice>
  );
}

/** 48 px input, 1 px control border; focus = blue border with a soft 4 px ring. */
export const inputClass = 'h-12 w-full rounded-xl border border-control bg-surface px-3.5 text-[15px] text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/20 aria-[invalid=true]:border-bad';
export const textareaClass = 'min-h-24 w-full rounded-xl border border-control bg-surface px-3.5 py-3 text-[15px] text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/20 aria-[invalid=true]:border-bad';

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string | null; hint?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-semibold">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${htmlFor}-error`} role="alert" className="text-xs font-semibold text-bad">{error}</p>}
    </div>
  );
}

const ICONS: Record<string, { d?: string[]; c?: [number, number, number][] }> = {
  home: { d: ['M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'] },
  explore: { c: [[12, 12, 9]], d: ['M15.5 8.5l-2 5-5 2 2-5z'] },
  trips: { d: ['M6 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.5 17.5H14a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h5.5'] },
  user: { d: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0'] },
  users: { d: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M19 20a6 6 0 0 0-3-5'] },
  search: { c: [[11, 11, 7]], d: ['M20 20l-4-4'] },
  bell: { d: ['M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16zM10 21h4'] },
  chat: { d: ['M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z'] },
  back: { d: ['M15 6l-6 6 6 6'] },
  chevR: { d: ['M9 6l6 6-6 6'] },
  chevD: { d: ['M6 9l6 6 6-6'] },
  chevU: { d: ['M6 15l6-6 6 6'] },
  close: { d: ['M6 6l12 12M18 6L6 18'] },
  plus: { d: ['M12 5v14M5 12h14'] },
  check: { d: ['M5 12.5l4.5 4.5L19 7'] },
  pin: { c: [[12, 10, 2.5]], d: ['M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z'] },
  lock: { d: ['M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3'] },
  globe: { c: [[12, 12, 9]], d: ['M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18'] },
  bookmark: { d: ['M6 3h12v18l-6-4-6 4z'] },
  share: { d: ['M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5'] },
  heart: { d: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'] },
  map: { d: ['M9 4l6 2 6-2v14l-6 2-6-2-6 2V6zM9 4v14M15 6v14'] },
  copy: { d: ['M9 9h10v10H9zM5 15V5h10'] },
  settings: { c: [[8, 7, 2], [16, 17, 2]], d: ['M4 7h2M10 7h10M4 17h10M18 17h2'] },
  edit: { d: ['M4 20h4L19 9l-4-4L4 16zM13 7l4 4'] },
  camera: { c: [[12, 13, 3.5]], d: ['M4 8h3l2-3h6l2 3h3v11H4z'] },
  star: { d: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'] },
  flag: { d: ['M5 21V4M5 4h11l-2 4 2 4H5'] },
  logout: { d: ['M10 4H5v16h5M15 8l4 4-4 4M19 12H9'] },
};
export type IconName = keyof typeof ICONS;

/** Outline icons from the design system (24 px grid, 1.75 px stroke, rounded caps). */
export function Icon({ name, size = 24, className, fill }: { name: IconName; size?: number; className?: string; fill?: boolean }) {
  const def = ICONS[name]!;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {def.c?.map(([cx_, cy, r], i) => <circle key={i} cx={cx_} cy={cy} r={r} fill={fill ? 'currentColor' : 'none'} />)}
      {def.d?.map((d, i) => <path key={i} d={d} fill={fill ? 'currentColor' : 'none'} />)}
    </svg>
  );
}
