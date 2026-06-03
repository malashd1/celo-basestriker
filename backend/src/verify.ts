// Score verification. Three layers:
//   1. Structural sanity (length, kills, damage bounds).
//   2. Headless replay-bound check — deterministic per-level upper bound on score.
//   3. Input-stream plausibility (fire ratio, frame drift).
// The full per-frame replay is a planned upgrade; the current bound is tight enough
// to catch every realistic class of cheating.

import type { RunResult } from './shared/types.js';
import { maxScoreFor, isRunPlausible } from './shared/replay.js';

// 5 s minimum — a player who dies on the first wave on LV 1 still earns a
// leaderboard slot. The previous 10 s cutoff silently rejected most quick
// deaths, which made the leaderboard look empty even when players were
// finishing runs.
// 1 s minimum — a player who collides with the first enemy on LV 1 in
// under 5 s still earns a leaderboard slot. Anything shorter than 60
// frames is almost certainly a replay-skip exploit, but a real player
// dying instantly to the first dive is a legitimate run.
const MIN_FRAMES_PER_LEVEL = 60;
const MAX_FRAMES_PER_LEVEL = 60 * 60 * 8;  // 8 minutes

const STRK_REWARD_LEVEL = (level: number) => Math.round(5 + (75 * (level - 1)) / 99);

export interface Verdict {
  ok: boolean;
  reason?: string;
  rewardStrk: number;
}

export function verifyRun(run: RunResult): Verdict {
  // Basic structural checks.
  if (run.levelId < 1 || run.levelId > 100)
    return reject('bad_level');
  if (run.framesElapsed < MIN_FRAMES_PER_LEVEL)
    return reject('too_fast');
  if (run.framesElapsed > MAX_FRAMES_PER_LEVEL)
    return reject('too_slow');
  if (run.score < 0) return reject('neg_score');
  if (run.duration < 0 || run.duration > MAX_FRAMES_PER_LEVEL / 60 + 5)
    return reject('bad_duration');
  if (!Array.isArray(run.inputs)) return reject('no_inputs');
  // Don't reject on short input streams — a quick death is still a real
  // run. We only reject if inputs are wildly mis-sized vs. frames.
  if (run.inputs.length > run.framesElapsed + 4)
    return reject('input_overrun');
  // Damage sanity.
  if (run.damageDealt > 100_000) return reject('damage_dealt_impossible');
  if (run.damageTaken > 1_000) return reject('damage_taken_impossible');
  if (run.enemiesKilled < 0 || run.enemiesKilled > 5000) return reject('kills_impossible');

  // Bossable levels require some kills (otherwise the run skipped content).
  if (run.levelId >= 10 && run.enemiesKilled < 3) return reject('skipped_content');

  // Tight per-level score bound (replaces the old constant-per-frame cap).
  const bound = maxScoreFor(run.levelId);
  const plausibility = isRunPlausible(run, bound);
  if (!plausibility.ok) return reject(plausibility.reason ?? 'replay_implausible');

  return { ok: true, rewardStrk: STRK_REWARD_LEVEL(run.levelId) };
}

function reject(reason: string): Verdict {
  return { ok: false, reason, rewardStrk: 0 };
}
