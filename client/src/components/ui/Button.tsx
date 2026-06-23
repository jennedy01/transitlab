import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-signal text-chrome hover:bg-signal/90 font-medium',
  ghost: 'bg-transparent text-ink hover:bg-hairline/60 border border-hairline',
  danger: 'bg-transparent text-danger hover:bg-danger/10 border border-danger/40',
};

export function Button({ variant = 'ghost', className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`rounded-[3px] px-3 py-1.5 font-sans text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}
