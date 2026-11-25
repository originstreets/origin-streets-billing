import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  helperText?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, prefix, suffix, className, id, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id || autoId;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="label">
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {prefix && (
            <div className="absolute left-3 flex items-center pointer-events-none text-os-muted">{prefix}</div>
          )}

          <input
            ref={ref}
            id={inputId}
            className={twMerge(
              clsx(
                'w-full h-12 bg-os-paper text-os-ink placeholder:text-[#8C8C8C] text-base px-3.5 border-2 border-os-line focus:border-os-accent focus:outline-none transition-colors rounded-none',
                prefix && 'pl-10',
                suffix && 'pr-10',
                error && 'border-status-red focus:border-status-red',
                className
              )
            )}
            {...props}
          />

          {suffix && (
            <div className="absolute right-3 flex items-center pointer-events-none text-os-muted">{suffix}</div>
          )}
        </div>

        {error ? (
          <span className="text-sm text-status-red font-semibold">{error}</span>
        ) : helperText ? (
          <span className="text-sm text-os-muted">{helperText}</span>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
