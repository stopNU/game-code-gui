import { ScrollText } from 'lucide-react';
import { Card } from '@renderer/components/ui/card';
import { ScrollArea } from '@renderer/components/ui/scroll-area';

interface GodotLogProps {
  logs: Array<{
    id: string;
    line: string;
    stream: 'stdout' | 'stderr';
    timestamp: number;
  }>;
}

export function GodotLog({ logs }: GodotLogProps): JSX.Element {
  return (
    <Card className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <ScrollText className="h-4 w-4 text-primary" />
        Godot Log
      </div>
      <ScrollArea className="min-h-0 flex-1 rounded-2xl bg-background/35 p-3">
        <div className="space-y-2 text-xs text-muted-foreground">
          {logs.length === 0 ? (
            <div>No runtime logs yet. Launch a project and stdout/stderr will stream here.</div>
          ) : (
            logs.slice(-60).map((entry) => (
              <div key={entry.id}>
                <span className={entry.stream === 'stderr' ? 'text-amber-300' : 'text-primary/80'}>
                  [{entry.stream}]
                </span>{' '}
                {entry.line}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
