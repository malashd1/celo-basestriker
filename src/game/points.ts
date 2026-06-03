// ── Lifetime POINTS ledger ──────────────────────────────────────────
// Distinct from in-run `player.score`. Points never reset; they accumulate
// from level clears and shop purchases (300 PTS per $1 USDC spent).
// Stored in localStorage for the dev/playtest build; production will mirror
// onto the backend so they survive across devices once wallet is connected.

const KEY = 'basestriker.points';

export function getPoints(): number {
  try {
    const v = Number(localStorage.getItem(KEY) ?? '0');
    return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  } catch { return 0; }
}

export function addPoints(delta: number): number {
  if (!Number.isFinite(delta) || delta <= 0) return getPoints();
  const next = getPoints() + Math.floor(delta);
  try { localStorage.setItem(KEY, String(next)); } catch { /* private mode */ }
  notify(next);
  return next;
}

/// POINTS-per-dollar exchange rate for shop purchases.
export const POINTS_PER_USD = 300;

export function pointsForUsd(usd: number): number {
  return Math.max(0, Math.floor(usd * POINTS_PER_USD));
}

// ── Live update subscription (HUD listens) ──────────────────────────
type Listener = (total: number) => void;
const listeners = new Set<Listener>();
function notify(total: number) { for (const fn of listeners) fn(total); }

export function onPointsChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
