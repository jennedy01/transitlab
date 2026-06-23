import type { SelectHTMLAttributes } from 'react';

interface Option {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  options: Option[];
}

export function Select({ label, options, className = '', ...props }: SelectProps) {
  const select = (
    <select
      {...props}
      className={`w-full rounded-[3px] border border-hairline bg-chrome px-2 py-1.5 font-sans text-xs text-ink focus:border-signal focus:outline-none ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  if (!label) return select;
  return (
    <label className="block">
      <span className="mb-1 block font-sans text-2xs uppercase tracking-wider text-muted">
        {label}
      </span>
      {select}
    </label>
  );
}
