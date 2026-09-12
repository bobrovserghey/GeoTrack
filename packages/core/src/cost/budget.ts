import type { AuditProfile } from '@geotrack/config';
import type { Budget, UsageRecord } from '../contracts/step.js';

export type BudgetStatus = 'ok' | 'soft_exceeded' | 'hard_exceeded';

export function createBudget(profile: AuditProfile): Budget {
  return {
    softCeilingUsd: profile.costSoftCeilingUsd,
    hardCeilingUsd: profile.costHardCeilingUsd,
    spentUsd: 0,
    remainingSoftUsd: profile.costSoftCeilingUsd,
    remainingHardUsd: profile.costHardCeilingUsd,
  };
}

export function checkBudget(budget: Budget): BudgetStatus {
  if (budget.spentUsd >= budget.hardCeilingUsd) return 'hard_exceeded';
  if (budget.spentUsd >= budget.softCeilingUsd) return 'soft_exceeded';
  return 'ok';
}

export function recordUsage(
  budget: Budget,
  record: UsageRecord,
): { budget: Budget; status: BudgetStatus } {
  const newSpent = budget.spentUsd + record.costUsd;
  const newBudget: Budget = {
    softCeilingUsd: budget.softCeilingUsd,
    hardCeilingUsd: budget.hardCeilingUsd,
    spentUsd: newSpent,
    remainingSoftUsd: budget.softCeilingUsd - newSpent,
    remainingHardUsd: budget.hardCeilingUsd - newSpent,
  };
  return { budget: newBudget, status: checkBudget(newBudget) };
}
