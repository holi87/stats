import type { InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean;
};

export function Input({ className, hasError, ...props }: InputProps) {
  const classes = ['input', hasError ? 'input-error' : '', className]
    .filter(Boolean)
    .join(' ');
  return <input {...props} className={classes} />;
}
