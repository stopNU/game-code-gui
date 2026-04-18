import { LoaderCircle, Square, Play } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { Card } from '@renderer/components/ui/card';
import { Badge } from '@renderer/components/ui/badge';

interface GodotLauncherProps {
  projectName: string | null;
  projectPath: string | null;
  status: {
    status: 'running' | 'stopped' | 'crashed';
    projectPath?: string;
    exitCode?: number;
  };
  launching: boolean;
  stopping: boolean;
  onLaunch: () => Promise<void>;
  onStop: () => Promise<void>;
}

export function GodotLauncher({
  projectName,
  projectPath,
  status,
  launching,
  stopping,
  onLaunch,
  onStop,
}: GodotLauncherProps): JSX.Element {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Godot Runtime</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {projectName === null ? 'Select a Studio project to launch it from the renderer.' : projectName}
          </div>
        </div>
        <Badge>{status.status}</Badge>
      </div>
      <div className="rounded-2xl bg-background/40 p-3 text-xs text-muted-foreground">
        {projectPath ?? status.projectPath ?? 'No project selected'}
      </div>
      {status.exitCode !== undefined ? (
        <div className="mt-2 text-xs text-muted-foreground">Last exit code: {status.exitCode}</div>
      ) : null}
      <div className="mt-4 flex items-center gap-2">
        <Button onClick={() => void onLaunch()} disabled={projectPath === null || launching || status.status === 'running'}>
          {launching ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Launch
        </Button>
        <Button variant="outline" onClick={() => void onStop()} disabled={status.status !== 'running' || stopping}>
          {stopping ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
          Stop
        </Button>
      </div>
    </Card>
  );
}
