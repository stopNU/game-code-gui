import { createHash, randomUUID } from 'crypto';
import type { ApprovalDecisionMessage, StreamEvent } from '../../shared/protocol.js';

export type ToolRiskLevel = 'low' | 'medium' | 'high';
type ApprovalDecisionStatus = 'approved' | 'denied' | 'timeout' | 'aborted';

interface PendingApprovalDecision {
  decision: ApprovalDecisionStatus;
  scope?: 'once' | 'conversation' | 'project';
}

export interface ApprovalGateBridge {
  requestApprovalRecord(args: {
    conversationId: string;
    toolCallId: string;
    toolName: string;
    args: unknown;
    argsHash: string;
    projectId?: string | null;
    riskLevel: ToolRiskLevel;
    rationale: string;
  }): Promise<{
    id: string;
    status: 'pending' | 'approved' | 'denied' | 'timeout' | 'aborted';
  }>;
  findReusableDecision(args: {
    conversationId: string;
    toolName: string;
    argsHash: string;
    projectId?: string | null;
  }): Promise<{
    id: string;
    status: 'approved' | 'denied' | 'timeout' | 'aborted' | 'pending';
  } | null>;
  resolveApproval(args: {
    approvalId: string;
    status: 'approved' | 'denied' | 'timeout' | 'aborted';
    scope?: 'once' | 'conversation' | 'project';
  }): Promise<void>;
  emit(event: StreamEvent): void;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

export function hashToolArgs(args: unknown): string {
  return createHash('sha256').update(stableStringify(args)).digest('hex');
}

export class ApprovalGate {
  private readonly pendingDecisions = new Map<
    string,
    (decision: PendingApprovalDecision) => void
  >();

  public constructor(private readonly bridge: ApprovalGateBridge) {}

  public async ensureApproved(args: {
    conversationId: string;
    toolCallId: string;
    toolName: string;
    input: unknown;
    projectId?: string | null;
    riskLevel: ToolRiskLevel;
    rationale: string;
    signal: AbortSignal;
  }): Promise<'approved' | 'denied' | 'aborted' | 'timeout'> {
    if (args.riskLevel !== 'high') {
      return 'approved';
    }

    const argsHash = hashToolArgs(args.input);
    const reusableApproval = await this.bridge.findReusableDecision({
      conversationId: args.conversationId,
      toolName: args.toolName,
      argsHash,
      ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
    });
    if (reusableApproval?.status === 'approved') {
      return 'approved';
    }

    const approval = await this.bridge.requestApprovalRecord({
      conversationId: args.conversationId,
      toolCallId: args.toolCallId,
      toolName: args.toolName,
      args: args.input,
      argsHash,
      ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
      riskLevel: args.riskLevel,
      rationale: args.rationale,
    });

    this.bridge.emit({
      type: 'approval-required',
      conversationId: args.conversationId,
      approvalId: approval.id,
      toolName: args.toolName,
      args: args.input,
      riskLevel: args.riskLevel,
      rationale: args.rationale,
    });

    return await new Promise<'approved' | 'denied' | 'aborted' | 'timeout'>((resolve) => {
      const onAbort = () => {
        void this.bridge.resolveApproval({
          approvalId: approval.id,
          status: 'aborted',
        });
        this.pendingDecisions.delete(approval.id);
        this.bridge.emit({
          type: 'approval-resolved',
          conversationId: args.conversationId,
          approvalId: approval.id,
          decision: 'aborted',
        });
        resolve('aborted');
      };

      args.signal.addEventListener('abort', onAbort, { once: true });

      this.pendingDecisions.set(approval.id, (decision) => {
        args.signal.removeEventListener('abort', onAbort);
        this.pendingDecisions.delete(approval.id);
        void this.bridge.resolveApproval({
          approvalId: approval.id,
          status: decision.decision,
          ...(decision.scope !== undefined ? { scope: decision.scope } : {}),
        });
        this.bridge.emit({
          type: 'approval-resolved',
          conversationId: args.conversationId,
          approvalId: approval.id,
          decision: decision.decision,
        });
        resolve(decision.decision);
      });
    });
  }

  public resolveDecision(message: ApprovalDecisionMessage): void {
    const pending = this.pendingDecisions.get(message.approvalId);
    if (pending === undefined) {
      return;
    }

    pending({
      decision: message.decision,
      ...(message.scope !== undefined ? { scope: message.scope } : {}),
    });
  }

  public abortAll(): void {
    for (const approvalId of [...this.pendingDecisions.keys()]) {
      const pending = this.pendingDecisions.get(approvalId);
      if (pending !== undefined) {
        pending({
          decision: 'aborted',
        });
      }
    }
  }

  public createToolCallId(): string {
    return randomUUID();
  }
}
