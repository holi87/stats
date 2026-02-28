type FormFieldProps = {
  label: string;
  htmlFor?: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
};

export function FormField({ label, htmlFor, error, children, className }: FormFieldProps) {
  return (
    <label className={['form-field', className].filter(Boolean).join(' ')} htmlFor={htmlFor}>
      <span>{label}</span>
      {children}
      {error ? <span className="error-text">{error}</span> : null}
    </label>
  );
}
