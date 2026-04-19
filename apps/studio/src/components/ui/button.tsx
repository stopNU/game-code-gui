import * as React from 'react';
import { cn } from '@renderer/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'default', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        size === 'default' && 'px-4 py-2',
        size === 'sm' && 'px-3 py-1.5 text-xs',
        variant === 'default' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'outline' && 'border border-border bg-card/50 text-foreground hover:bg-muted',
        variant === 'ghost' && 'text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
});
