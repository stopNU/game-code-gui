import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { trpc } from '@renderer/lib/trpc';

interface EvalSuggestionBannerProps {
  projectId: string;
  /**
   * Called when the user clicks "File as bug". The banner injects a templated chat message
   * starting with the `bug:` prefix so it routes through the iteration fast-path on Codex
   * and through the `plan_iteration` tool on Anthropic.
   */
  onSendMessage: (message: string) => void;
}

const DISMISSED_REPORTS_KEY = 'studio.eval-banner.dismissed';

/**
 * localStorage-backed set of dismissed `<projectId>:<reportId>` pairs. Keeping it as a single
 * key (instead of one entry per project) makes it trivial to clear or audit.
 */
function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_REPORTS_KEY);
    if (raw === null) return new Set<string>();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((x): x is string => typeof x === 'string'));
    }
    return new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function persistDismissed(set: Set<string>): void {
  try {
    localStorage.setItem(DISMISSED_REPORTS_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // Non-fatal — dismissal just won't survive a reload.
  }
}

export function EvalSuggestionBanner({ projectId, onSendMessage }: EvalSuggestionBannerProps): JSX.Element | null {
  // Polling is cheap (a single readdir + readFileSync of one JSON file), but we don't need
  // sub-second freshness here — eval runs take seconds at minimum. Poll every 5 s while the
  // banner is visible. This catches the common flow: user runs `run-evals`, mid-run the
  // banner shows up once the report file lands.
  const summaryQuery = trpc.projects.getEvalSummary.useQuery(
    { id: projectId },
    { refetchInterval: 5000 },
  );

  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());

  // Refresh the dismissed set when projectId changes — different project, different baseline.
  useEffect(() => {
    setDismissed(readDismissed());
  }, [projectId]);

  const summary = summaryQuery.data;
  if (summary === null || summary === undefined) return null;
  if (!summary.hasFailures) return null;

  const dismissalKey = `${projectId}:${summary.reportId}`;
  if (dismissed.has(dismissalKey)) return null;

  const layerList = summary.failedLayers.join(', ');
  // Templated message uses the `bug:` prefix so parseIterationIntent on the Codex path matches
  // it, and the Anthropic system prompt instructs the agent to call plan_iteration when it
  // sees bug filings. Both routes converge on plan_iteration.
  const ctaMessage =
    `bug: Eval run ${summary.reportId} failed on layer(s): ${layerList}. ` +
    `Plan targeted bug-fix tasks for these failures.`;

  const handleFile = (): void => {
    onSendMessage(ctaMessage);
    // Optimistically dismiss — the report is now being acted on.
    const next = new Set(dismissed);
    next.add(dismissalKey);
    setDismissed(next);
    persistDismissed(next);
  };

  const handleDismiss = (): void => {
    const next = new Set(dismissed);
    next.add(dismissalKey);
    setDismissed(next);
    persistDismissed(next);
  };

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border-1 bg-yellow-500/5 px-4 py-2">
      <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" />
      <div className="min-w-0 flex-1 text-xs">
        <span className="font-semibold text-foreground">Eval failed:</span>{' '}
        <span className="text-muted-foreground">{layerList}</span>
      </div>
      <Button variant="default" className="h-6 px-2 text-[11px]" onClick={handleFile}>
        File as bug
      </Button>
      <Button
        variant="ghost"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
        onClick={handleDismiss}
        title="Dismiss for this report"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
