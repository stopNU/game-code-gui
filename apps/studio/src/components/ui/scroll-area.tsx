import type { HTMLAttributes } from 'react';
import { cn } from '@renderer/lib/utils';

export function ScrollArea({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('overflow-auto', className)} {...props} />;
}
