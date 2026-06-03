// Weekly LeaderboardCheckpoint poster.
//
// Once an hour the cron checks: "is there a finished week we haven't
// posted yet?" If yes, computes a keccak256 root over the top-100 rows
// for that week and posts a single tx:
//
//   LeaderboardCheckpoint.postCheckpoint(weekId, rowCount, root)
//
// Posted by the `signer` wallet (same one that signs run claims and
// badge mints). 1 tx/week → effectively free on Base (<$0.01 gas).
//
// The root scheme matches the contract's docs:
//   keccak256(abi.encodePacked(
//     weekId(u64),
//     for each row (sorted by rank):
//       player (20 bytes),
//       score  (u64 BE),
//       level  (u16 BE),
//       points (u64 BE)
//   ))
// Anyone can verify the on-chain root by re-hashing the public off-chain
// top-100 list — gives the leaderboard cryptographic integrity.

import { createWalletClient, http, keccak256, encodePacked, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import type Database from 'better-sqlite3';
import { currentWeekId, weeklyTopN } from './badge.js';

interface Env {
  signerKey: `0x${string}`;
  rpcUrl: string;
}
interface Logger {
  info(msg: string, meta?: object): void;
  warn(msg: string, meta?: object): void;
  error(msg: string, meta?: object): void;
}

/// LeaderboardCheckpoint contract on Base mainnet — verified.
const CHECKPOINT_CONTRACT: Address = '0xAdBD63254aaF3836cE8295E3E39B3B3f25aF1219';

const ABI = [
  {
    type: 'function',
    name: 'postCheckpoint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'weekId',   type: 'uint64'  },
      { name: 'rowCount', type: 'uint64'  },
      { name: 'root',     type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

const TOP_N = 100;

function rootFor(weekId: number, rows: ReturnType<typeof weeklyTopN>): `0x${string}` {
  const types: string[]   = ['uint64'];
  const values: unknown[] = [BigInt(weekId)];
  for (const r of rows) {
    types.push('address', 'uint64', 'uint16', 'uint64');
    values.push(r.player as Address, BigInt(r.score), Number(r.level), BigInt(r.points));
  }
  return keccak256(encodePacked(types as any, values as any));
}

export function ensureCheckpointSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkpoint_log (
      week_id     INTEGER PRIMARY KEY,
      row_count   INTEGER NOT NULL,
      root        TEXT    NOT NULL,
      tx_hash     TEXT    NOT NULL,
      posted_at   INTEGER NOT NULL
    )
  `);
}

export async function maybePostCheckpoint(
  db: Database.Database,
  env: Env,
  log: Logger,
): Promise<void> {
  // Post for the most-recently-finished week (current week minus 1).
  const target = currentWeekId() - 1;
  if (target < 0) return;

  const already = db.prepare(`SELECT week_id FROM checkpoint_log WHERE week_id = ?`).get(target) as any;
  if (already) return;

  const rows = weeklyTopN(db, target, TOP_N);
  if (rows.length === 0) {
    // Nothing to post — week had zero leaderboard activity. Still record
    // it so we don't keep trying.
    db.prepare(`INSERT INTO checkpoint_log (week_id, row_count, root, tx_hash, posted_at) VALUES (?,0,?,?,?)`).run(
      target, '0x0', 'empty', Date.now(),
    );
    log.info('checkpoint.skipped.empty', { week: target });
    return;
  }

  const root = rootFor(target, rows);
  const account = privateKeyToAccount(env.signerKey);
  const wc = createWalletClient({ account, chain: base, transport: http(env.rpcUrl) });

  try {
    const txHash = await wc.writeContract({
      address: CHECKPOINT_CONTRACT,
      abi: ABI,
      functionName: 'postCheckpoint',
      args: [BigInt(target), BigInt(rows.length), root],
    });
    db.prepare(`INSERT INTO checkpoint_log (week_id, row_count, root, tx_hash, posted_at) VALUES (?,?,?,?,?)`).run(
      target, rows.length, root, txHash, Date.now(),
    );
    log.info('checkpoint.posted', { week: target, rows: rows.length, root, txHash });
  } catch (e: any) {
    // Don't insert the row — retry next tick. Logs the actual reason.
    log.warn('checkpoint.post.failed', { week: target, msg: String(e?.shortMessage ?? e?.message ?? e) });
  }
}

/// Wire up an hourly poll. Cheap (just a SELECT until there's work).
export function startCheckpointCron(
  db: Database.Database,
  env: Env,
  log: Logger,
): void {
  ensureCheckpointSchema(db);
  // First check after 30s so the server is fully up.
  setTimeout(() => { void maybePostCheckpoint(db, env, log); }, 30_000);
  setInterval(() => { void maybePostCheckpoint(db, env, log); }, 60 * 60 * 1000);
  log.info('checkpoint.cron.started', { intervalMs: 3600_000 });
}
