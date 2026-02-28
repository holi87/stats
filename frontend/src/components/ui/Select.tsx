import type { SelectHTMLAttributes } from 'react';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  hasError?: boolean;
};

export function Select({ className, hasError, ...props }: SelectProps) {
  const classes = ['select', hasError ? 'input-error' : '', className]
    .filter(Boolean)
    .join(' ');
  return <select {...props} className={classes} />;
}
