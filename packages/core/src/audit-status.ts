export type AuditStatus =
  | 'queued'
  | 'running'
  | 'waiting_category'
  | 'waiting_email'
  | 'completed'
  | 'in_review'
  | 'delivered'
  | 'needs_attention'
  | 'failed'
  | 'cancelled';

export type TransitionEvent =
  | 'orchestrator_accepted'  // queued → running
  | 'waiting_for_category'   // running → waiting_category
  | 'category_selected'      // waiting_category → running (user or auto)
  | 'waiting_for_email'      // running → waiting_email
  | 'email_provided'         // waiting_email → running
  | 'email_timeout'          // waiting_email → completed
  | 'steps_completed'        // running → completed
  | 'sent_to_review'         // completed → in_review (paid only, enforced by caller)
  | 'review_approved'        // in_review → delivered
  | 'hard_budget_exceeded'   // running → needs_attention (paid) | failed (teaser)
  | 'step_failed'            // running → needs_attention (paid) | failed (teaser)
  | 'timeout_exceeded'       // running → needs_attention (paid) | failed (teaser)
  | 'admin_restart'          // needs_attention → running
  | 'admin_deliver_partial'  // needs_attention → delivered
  | 'admin_refund'           // needs_attention → failed
  | 'admin_cancel';          // any non-terminal → cancelled

export type TransitionContext = { isPaid: boolean };

type Outcome = AuditStatus | { paid: AuditStatus; free: AuditStatus };

const TRANSITIONS: Partial<Record<AuditStatus, Partial<Record<TransitionEvent, Outcome>>>> = {
  queued: {
    orchestrator_accepted: 'running',
    admin_cancel: 'cancelled',
  },
  running: {
    waiting_for_category: 'waiting_category',
    waiting_for_email: 'waiting_email',
    steps_completed: 'completed',
    hard_budget_exceeded: { paid: 'needs_attention', free: 'failed' },
    step_failed: { paid: 'needs_attention', free: 'failed' },
    timeout_exceeded: { paid: 'needs_attention', free: 'failed' },
    admin_cancel: 'cancelled',
  },
  waiting_category: {
    category_selected: 'running',
    admin_cancel: 'cancelled',
  },
  waiting_email: {
    email_provided: 'running',
    email_timeout: 'completed',
    admin_cancel: 'cancelled',
  },
  completed: {
    sent_to_review: 'in_review',
    admin_cancel: 'cancelled',
  },
  in_review: {
    review_approved: 'delivered',
    admin_cancel: 'cancelled',
  },
  needs_attention: {
    admin_restart: 'running',
    admin_deliver_partial: 'delivered',
    admin_refund: 'failed',
    admin_cancel: 'cancelled',
  },
  // delivered, failed, cancelled: terminal — no transitions defined
};

export class TransitionError extends Error {
  constructor(
    public readonly fromStatus: AuditStatus,
    public readonly event: TransitionEvent,
  ) {
    super(`Forbidden transition: ${fromStatus} + ${event}`);
    this.name = 'TransitionError';
  }
}

export function transition(
  status: AuditStatus,
  event: TransitionEvent,
  context: TransitionContext = { isPaid: false },
): AuditStatus {
  const row = TRANSITIONS[status];
  if (!row) throw new TransitionError(status, event);
  const outcome = row[event];
  if (outcome === undefined) throw new TransitionError(status, event);
  if (typeof outcome === 'string') return outcome;
  return context.isPaid ? outcome.paid : outcome.free;
}

export function isTerminal(status: AuditStatus): boolean {
  return status === 'delivered' || status === 'failed' || status === 'cancelled';
}
