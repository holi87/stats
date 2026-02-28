import type { TextareaHTMLAttributes } from 'react';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  hasError?: boolean;
};

export function Textarea({ className, hasError, ...props }: TextareaProps) {
  const classes = ['textarea', hasError ? 'input-error' : '', className]
    .filter(Boolean)
    .join(' ');
  return <textarea {...props} className={classes} />;
}
