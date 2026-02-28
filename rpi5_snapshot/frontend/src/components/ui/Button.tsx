import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className, ...props },
  ref
) {
  const classes = ['button', variant !== 'primary' ? variant : 'primary', className]
    .filter(Boolean)
    .join(' ');

  return <button {...props} ref={ref} className={classes} />;
});
