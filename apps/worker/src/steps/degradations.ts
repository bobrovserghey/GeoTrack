// Collector for "we could not measure this" reasons that end up in
// StepResult.notes. A halted host produces one reason per remaining probe, so
// the raw list grows with the number of probes; here duplicates are counted
// instead of repeated and the number of distinct reasons is capped, keeping
// notes bounded without losing the information.

/** Distinct reasons kept before the rest is summarised as a count. */
export const DEFAULT_MAX_DISTINCT_REASONS = 10;

export class Degradations {
  private readonly counts = new Map<string, number>();
  private readonly suppressed = new Set<string>();
  private suppressedOccurrences = 0;

  constructor(private readonly maxDistinct: number = DEFAULT_MAX_DISTINCT_REASONS) {}

  push(reason: string): void {
    const seen = this.counts.get(reason);
    if (seen !== undefined) {
      this.counts.set(reason, seen + 1);
      return;
    }
    if (this.counts.size >= this.maxDistinct) {
      this.suppressed.add(reason);
      this.suppressedOccurrences++;
      return;
    }
    this.counts.set(reason, 1);
  }

  /** True when nothing degraded; drives StepResult.status. */
  get isEmpty(): boolean {
    return this.counts.size === 0 && this.suppressed.size === 0;
  }

  /** `degraded: <reason>` notes, repeats collapsed into `(x N)`. */
  toNotes(): string[] {
    const notes = [...this.counts].map(([reason, n]) =>
      n > 1 ? `degraded: ${reason} (x${n})` : `degraded: ${reason}`,
    );
    if (this.suppressed.size > 0) {
      notes.push(
        `degraded: ${this.suppressedOccurrences} further occurrences of ${this.suppressed.size} other reasons suppressed`,
      );
    }
    return notes;
  }
}
