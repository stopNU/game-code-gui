import type { HTMLAttributes } from 'react';
import { cn } from '@renderer/lib/utils';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('animate-pulse rounded-2xl bg-muted/70', className)} {...props} />;
}
