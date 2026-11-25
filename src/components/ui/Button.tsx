import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

// Big, plain buttons: black for the main action, white for the others, the
// accent for the one action that matters most on a screen.
export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  fullWidth = false,
  className,
  disabled,
  ...props
}) => {
  // Things you press are pills (Origin's one shape rule); panels stay square.
  const baseStyles =
    'inline-flex items-center justify-center rounded-full font-semibold tracking-[0.005em] transition-[background-color,color,box-shadow,transform] duration-150 select-none focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-os-accent active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-y-0';

  const sizeStyles = {
    sm: 'text-sm px-3.5 gap-1.5 h-9',
    md: 'text-[0.9375rem] px-5 gap-2 h-11',
    lg: 'text-lg px-7 gap-2.5 h-14',
  };

  const variantStyles = {
    primary: 'bg-os-ink text-white hover:bg-os-ink/80',
    secondary: 'bg-os-paper text-os-ink ring-1 ring-inset ring-os-line hover:ring-os-ink',
    outline: 'bg-transparent text-os-ink ring-2 ring-inset ring-os-ink hover:bg-os-ink hover:text-white',
    ghost: 'bg-transparent text-os-ink hover:bg-os-soft',
    danger: 'bg-status-redBg text-status-red hover:bg-status-red hover:text-white',
    accent: 'bg-os-accent text-white hover:bg-os-accent-dark',
  };

  return (
    <button
      className={twMerge(clsx(baseStyles, sizeStyles[size], variantStyles[variant], fullWidth && 'w-full', className))}
      disabled={disabled}
      {...props}
    >
      {icon && iconPosition === 'left' && <span className="flex-shrink-0">{icon}</span>}
      {children !== undefined && children !== null && children !== false && <span>{children}</span>}
      {icon && iconPosition === 'right' && <span className="flex-shrink-0">{icon}</span>}
    </button>
  );
};
