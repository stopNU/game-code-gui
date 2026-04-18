import type { HTMLAttributes } from 'react';
import { cn } from '@renderer/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-border bg-card/85 shadow-glow', className)} {...props} />;
}
