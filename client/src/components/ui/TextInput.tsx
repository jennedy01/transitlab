import type { InputHTMLAttributes } from 'react';

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function TextInput({ label, className = '', id, ...props }: TextInputProps) {
  const input = (
    <input
      id={id}
      {...props}
      className={`w-full rounded-[3px] border border-hairline bg-chrome px-2 py-1.5 font-sans text-xs text-ink placeholder:text-muted/60 focus:border-signal focus:outline-none ${className}`}
    />
  );
  if (!label) return input;
  return (
    <label className="block">
      <span className="mb-1 block font-sans text-2xs uppercase tracking-wider text-muted">
        {label}
      </span>
      {input}
    </label>
  );
}
