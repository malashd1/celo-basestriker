// Centralised, validated environment configuration.
//
// Fail-fast in production if anything critical is missing — better to refuse to
// boot than to silently sign claims with the well-known dev key on mainnet.

import { isAddress, isHex } from 'viem';

// Hardhat / Anvil deterministic test key, account index 1 (mnemonic:
// "test test test test test test test test test test test junk"). This is
// public knowledge used by every EVM dev toolchain — it's NOT a secret;
// any address derived from it on mainnet is drained continuously by bots.
// Only used as a local-dev fallback below; production refuses to boot if
// SIGNER_KEY is unset OR matches this constant (see signerKey check).
const DEV_SIGNER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const DEV_RELAYER_KEY = DEV_SIGNER_KEY;

function readBool(name: string, def = false): boolean {
  const v = process.env[name];
  if (v === undefined) return def;
  return /^(1|true|yes|on)$/i.test(v);
}

function readInt(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`env ${name} must be an integer; got ${v}`);
  return n;
}

function readList(name: string, def: string[] = []): string[] {
  const v = process.env[name];
  if (!v) return def;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export type NodeEnv = 'development' | 'production' | 'test';

export interface Env {
  nodeEnv: NodeEnv;
  port: number;
  chainId: number;
  rpcUrl: string;

  signerKey: `0x${string}`;
  relayerKey: `0x${string}`;
  rewardsContract: `0x${string}`;
  registryContract: `0x${string}`;
  paymentRouter: `0x${string}`;

  corsAllowlist: string[];          // empty = allow all (dev only)
  rateLimitRps: number;
  dbPath: string;

  stripeSecretKey: string;
  stripeWebhookSecret: string;

  discordClientId: string;
  discordClientSecret: string;
  twitterClientId: string;
  twitterClientSecret: string;
  publicBackendUrl: string;
  publicAppUrl: string;
}

function fail(reason: string): never {
  console.error(`[env] FATAL — ${reason}`);
  console.error('[env] refusing to boot. See backend/.env.example for required vars.');
  process.exit(1);
}

function requireAddr(name: string, value: string | undefined): `0x${string}` {
  if (!value || !isAddress(value)) fail(`${name} is not a valid address (got "${value ?? ''}")`);
  return value!.toLowerCase() as `0x${string}`;
}

function requireKey(name: string, value: string | undefined): `0x${string}` {
  if (!value || !isHex(value) || value.length !== 66) fail(`${name} is not a 0x-prefixed 32-byte hex key`);
  return value! as `0x${string}`;
}

export function loadEnv(): Env {
  const nodeEnv = (process.env.NODE_ENV as NodeEnv) ?? 'development';
  const isProd = nodeEnv === 'production';

  const signerKey  = (process.env.SIGNER_KEY  ?? (isProd ? '' : DEV_SIGNER_KEY)) as `0x${string}`;
  const relayerKey = (process.env.RELAYER_KEY ?? (isProd ? '' : DEV_RELAYER_KEY)) as `0x${string}`;

  if (isProd) {
    if (signerKey === DEV_SIGNER_KEY) fail('SIGNER_KEY is the well-known dev key. Provision a real one.');
    if (relayerKey === DEV_RELAYER_KEY) fail('RELAYER_KEY is the well-known dev key. Provision a real one.');
    requireKey('SIGNER_KEY', signerKey);
    requireKey('RELAYER_KEY', relayerKey);
    requireAddr('REWARDS_CONTRACT', process.env.REWARDS_CONTRACT);
    requireAddr('REGISTRY_CONTRACT', process.env.REGISTRY_CONTRACT);
    requireAddr('PAYMENT_ROUTER', process.env.PAYMENT_ROUTER);
    if (!process.env.RPC_URL) fail('RPC_URL is required in production');
    if (!process.env.CORS_ALLOWLIST) fail('CORS_ALLOWLIST is required in production (comma-separated origins)');
  }

  const chainId = readInt('CHAIN_ID', 84532);

  return {
    nodeEnv,
    port: readInt('PORT', 8787),
    chainId,
    rpcUrl: process.env.RPC_URL || (chainId === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org'),

    signerKey,
    relayerKey,
    rewardsContract:  (process.env.REWARDS_CONTRACT  ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    registryContract: (process.env.REGISTRY_CONTRACT ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    paymentRouter:    (process.env.PAYMENT_ROUTER    ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,

    corsAllowlist: readList('CORS_ALLOWLIST'),
    rateLimitRps: readInt('RATE_LIMIT_RPS', 30),
    dbPath: process.env.DB_PATH ?? 'basestriker.db',

    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',

    discordClientId: process.env.DISCORD_CLIENT_ID ?? '',
    discordClientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
    twitterClientId: process.env.TWITTER_CLIENT_ID ?? '',
    twitterClientSecret: process.env.TWITTER_CLIENT_SECRET ?? '',
    publicBackendUrl: process.env.PUBLIC_BACKEND_URL ?? `http://localhost:${readInt('PORT', 8787)}`,
    publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173',
  };
}

export const env = loadEnv();

/* eslint-disable no-console */
export const log = {
  info:  (msg: string, meta?: object) => console.log(JSON.stringify({ lvl: 'info',  t: new Date().toISOString(), msg, ...meta })),
  warn:  (msg: string, meta?: object) => console.warn(JSON.stringify({ lvl: 'warn',  t: new Date().toISOString(), msg, ...meta })),
  error: (msg: string, meta?: object) => console.error(JSON.stringify({ lvl: 'error', t: new Date().toISOString(), msg, ...meta })),
};
