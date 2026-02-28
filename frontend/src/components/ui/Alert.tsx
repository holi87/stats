type AlertVariant = 'error' | 'info' | 'success';

type AlertProps = {
  title?: string;
  children: React.ReactNode;
  variant?: AlertVariant;
};

export function Alert({ title, children, variant = 'info' }: AlertProps) {
  return (
    <div className={`alert ${variant}`} role="alert">
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}
