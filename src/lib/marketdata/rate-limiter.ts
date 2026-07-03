/**
 * Rate limiter en mémoire à fenêtre glissante (pattern team-lol-stats),
 * paramétré par provider. Valide pour un conteneur unique.
 */

export class RateLimiter {
  private timestamps: number[] = [];
  private queue: Array<() => void> = [];
  private draining = false;

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number
  ) {}

  /** Résout quand un slot est disponible. */
  acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.drain();
    });
  }

  private drain(): void {
    if (this.draining) return;
    this.draining = true;

    const tick = () => {
      const now = Date.now();
      this.timestamps = this.timestamps.filter(
        (t) => now - t < this.windowMs
      );
      while (
        this.queue.length > 0 &&
        this.timestamps.length < this.maxPerWindow
      ) {
        this.timestamps.push(now);
        this.queue.shift()!();
      }
      if (this.queue.length > 0) {
        const oldest = this.timestamps[0] ?? now;
        setTimeout(tick, Math.max(50, oldest + this.windowMs - now));
      } else {
        this.draining = false;
      }
    };
    tick();
  }
}
