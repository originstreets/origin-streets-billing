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

// Big, plain buttons: black for the main action, white for the others, red
// only for the one action that matters most on a screen (or to cancel).
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
  const baseStyles =
    'inline-flex items-center justify-center font-bold transition-colors duration-150 select-none focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-os-accent disabled:opacity-40 disabled:cursor-not-allowed';

  const sizeStyles = {
    sm: 'text-sm px-3 gap-1.5 h-9',
    md: 'text-base px-4 gap-2 h-11',
    lg: 'text-lg px-6 gap-2.5 h-14',
  };

  const variantStyles = {
    primary: 'bg-os-ink text-white border border-os-ink hover:bg-black',
    secondary: 'bg-os-paper text-os-ink border border-os-line hover:border-os-ink',
    outline: 'bg-transparent text-os-ink border border-os-ink hover:bg-os-soft',
    ghost: 'bg-transparent text-os-ink border border-transparent hover:bg-os-soft',
    danger: 'bg-os-paper text-status-red border border-status-redBorder hover:bg-status-redBg',
    accent: 'bg-os-accent text-white border border-os-accent hover:bg-os-accent-dark',
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
