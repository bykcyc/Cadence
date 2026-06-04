import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent-500 text-white hover:bg-accent-600 active:bg-accent-700 shadow-sm',
  secondary:
    'bg-white text-neutral-800 ring-1 ring-neutral-200 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-700 dark:hover:bg-neutral-700',
  ghost:
    'text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-700/60',
  danger: 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700 shadow-sm'
}

export function Button({ variant = 'secondary', className, children, ...props }: ButtonProps): ReactNode {
  return (
    <button
      className={cn(
        'app-no-drag inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium',
        'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400',
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function IconButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>): ReactNode {
  return (
    <button
      className={cn(
        'app-no-drag inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500',
        'transition-colors hover:bg-neutral-200/70 hover:text-neutral-800',
        'dark:text-neutral-400 dark:hover:bg-neutral-700/70 dark:hover:text-neutral-100',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-40',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }): ReactNode {
  return (
    <div
      className={cn(
        'rounded-2xl bg-white ring-1 ring-neutral-200/80 dark:bg-neutral-800/60 dark:ring-neutral-700/60',
        className
      )}
    >
      {children}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'green' | 'amber' | 'muted'
  className?: string
}): ReactNode {
  const tones: Record<string, string> = {
    neutral: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-200',
    accent: 'bg-accent-50 text-accent-700 dark:bg-accent-500/20 dark:text-accent-100',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
    muted: 'bg-neutral-100/70 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500'
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

export function Toggle({
  checked,
  onChange,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'app-no-drag relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50',
        checked ? 'bg-accent-500' : 'bg-neutral-300 dark:bg-neutral-600'
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

export function Spinner({ className }: { className?: string }): ReactNode {
  return (
    <span
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className
      )}
    />
  )
}
