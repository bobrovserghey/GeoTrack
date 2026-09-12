import { describe, it, expect } from 'vitest';
import {
  transition,
  isTerminal,
  TransitionError,
  type AuditStatus,
  type TransitionEvent,
} from '../audit-status.js';

// --- allowed transitions ---

describe('allowed transitions', () => {
  it('queued + orchestrator_accepted → running', () => {
    expect(transition('queued', 'orchestrator_accepted')).toBe('running');
  });

  it('queued + admin_cancel → cancelled', () => {
    expect(transition('queued', 'admin_cancel')).toBe('cancelled');
  });

  it('running + waiting_for_category → waiting_category', () => {
    expect(transition('running', 'waiting_for_category')).toBe('waiting_category');
  });

  it('running + waiting_for_email → waiting_email', () => {
    expect(transition('running', 'waiting_for_email')).toBe('waiting_email');
  });

  it('running + steps_completed → completed', () => {
    expect(transition('running', 'steps_completed')).toBe('completed');
  });

  it('running + hard_budget_exceeded (paid) → needs_attention', () => {
    expect(transition('running', 'hard_budget_exceeded', { isPaid: true })).toBe('needs_attention');
  });

  it('running + hard_budget_exceeded (teaser) → failed', () => {
    expect(transition('running', 'hard_budget_exceeded', { isPaid: false })).toBe('failed');
  });

  it('running + step_failed (paid) → needs_attention', () => {
    expect(transition('running', 'step_failed', { isPaid: true })).toBe('needs_attention');
  });

  it('running + step_failed (teaser) → failed', () => {
    expect(transition('running', 'step_failed', { isPaid: false })).toBe('failed');
  });

  it('running + timeout_exceeded (paid) → needs_attention', () => {
    expect(transition('running', 'timeout_exceeded', { isPaid: true })).toBe('needs_attention');
  });

  it('running + timeout_exceeded (teaser) → failed', () => {
    expect(transition('running', 'timeout_exceeded', { isPaid: false })).toBe('failed');
  });

  it('running + admin_cancel → cancelled', () => {
    expect(transition('running', 'admin_cancel')).toBe('cancelled');
  });

  it('waiting_category + category_selected → running', () => {
    expect(transition('waiting_category', 'category_selected')).toBe('running');
  });

  it('waiting_category + admin_cancel → cancelled', () => {
    expect(transition('waiting_category', 'admin_cancel')).toBe('cancelled');
  });

  it('waiting_email + email_provided → running', () => {
    expect(transition('waiting_email', 'email_provided')).toBe('running');
  });

  it('waiting_email + email_timeout → completed', () => {
    expect(transition('waiting_email', 'email_timeout')).toBe('completed');
  });

  it('waiting_email + admin_cancel → cancelled', () => {
    expect(transition('waiting_email', 'admin_cancel')).toBe('cancelled');
  });

  it('completed + sent_to_review → in_review', () => {
    expect(transition('completed', 'sent_to_review')).toBe('in_review');
  });

  it('completed + admin_cancel → cancelled', () => {
    expect(transition('completed', 'admin_cancel')).toBe('cancelled');
  });

  it('in_review + review_approved → delivered', () => {
    expect(transition('in_review', 'review_approved')).toBe('delivered');
  });

  it('in_review + admin_cancel → cancelled', () => {
    expect(transition('in_review', 'admin_cancel')).toBe('cancelled');
  });

  it('needs_attention + admin_restart → running', () => {
    expect(transition('needs_attention', 'admin_restart')).toBe('running');
  });

  it('needs_attention + admin_deliver_partial → delivered', () => {
    expect(transition('needs_attention', 'admin_deliver_partial')).toBe('delivered');
  });

  it('needs_attention + admin_refund → failed', () => {
    expect(transition('needs_attention', 'admin_refund')).toBe('failed');
  });

  it('needs_attention + admin_cancel → cancelled', () => {
    expect(transition('needs_attention', 'admin_cancel')).toBe('cancelled');
  });
});

// --- terminal states forbid all transitions ---

describe('terminal states forbid all transitions', () => {
  const TERMINAL_STATUSES: AuditStatus[] = ['delivered', 'failed', 'cancelled'];
  const EVENTS: TransitionEvent[] = [
    'orchestrator_accepted',
    'waiting_for_category',
    'category_selected',
    'waiting_for_email',
    'email_provided',
    'email_timeout',
    'steps_completed',
    'sent_to_review',
    'review_approved',
    'hard_budget_exceeded',
    'step_failed',
    'timeout_exceeded',
    'admin_restart',
    'admin_deliver_partial',
    'admin_refund',
    'admin_cancel',
  ];

  for (const status of TERMINAL_STATUSES) {
    for (const event of EVENTS) {
      it(`${status} + ${event} throws TransitionError`, () => {
        expect(() => transition(status, event)).toThrow(TransitionError);
        expect(() => transition(status, event)).toThrow(`${status} + ${event}`);
      });
    }
  }
});

// --- specific invalid transitions from non-terminal states ---

describe('invalid transitions from non-terminal states', () => {
  it('queued + steps_completed throws', () => {
    expect(() => transition('queued', 'steps_completed')).toThrow(TransitionError);
  });

  it('queued + review_approved throws', () => {
    expect(() => transition('queued', 'review_approved')).toThrow(TransitionError);
  });

  it('running + orchestrator_accepted throws', () => {
    expect(() => transition('running', 'orchestrator_accepted')).toThrow(TransitionError);
  });

  it('running + review_approved throws', () => {
    expect(() => transition('running', 'review_approved')).toThrow(TransitionError);
  });

  it('waiting_category + steps_completed throws', () => {
    expect(() => transition('waiting_category', 'steps_completed')).toThrow(TransitionError);
  });

  it('completed + admin_restart throws', () => {
    expect(() => transition('completed', 'admin_restart')).toThrow(TransitionError);
  });

  it('in_review + admin_restart throws', () => {
    expect(() => transition('in_review', 'admin_restart')).toThrow(TransitionError);
  });

  it('needs_attention + steps_completed throws', () => {
    expect(() => transition('needs_attention', 'steps_completed')).toThrow(TransitionError);
  });
});

// --- isTerminal ---

describe('isTerminal', () => {
  it('delivered is terminal', () => expect(isTerminal('delivered')).toBe(true));
  it('failed is terminal', () => expect(isTerminal('failed')).toBe(true));
  it('cancelled is terminal', () => expect(isTerminal('cancelled')).toBe(true));
  it('queued is not terminal', () => expect(isTerminal('queued')).toBe(false));
  it('running is not terminal', () => expect(isTerminal('running')).toBe(false));
  it('completed is not terminal', () => expect(isTerminal('completed')).toBe(false));
  it('needs_attention is not terminal', () => expect(isTerminal('needs_attention')).toBe(false));
});

// --- TransitionError properties ---

describe('TransitionError', () => {
  it('carries fromStatus and event', () => {
    const err = new TransitionError('delivered', 'admin_cancel');
    expect(err.fromStatus).toBe('delivered');
    expect(err.event).toBe('admin_cancel');
    expect(err.name).toBe('TransitionError');
    expect(err).toBeInstanceOf(Error);
  });
});
