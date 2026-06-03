// USDC payment helper — used by the shop and the settings ship/weapon catalogue.
//
// Flow:
//   1. If PaymentRouter is configured for the current network → route through
//      the contract. The contract pulls USDC via `transferFrom` and emits a
//      typed `ItemPaid(buyer, sku, qty, amount)` event that indexers (Talent
//      Protocol, The Graph, Basescan) can attribute to the buyer + item.
//      Adds one approve() tx on first purchase per allowance (cached).
//   2. If PaymentRouter is NOT set (legacy / Sepolia without deploy yet) →
//      fall back to a plain `USDC.transfer(treasury, amount)`. Same result
//      financially, no event semantic on-chain.
//
// Behaviour matrix (mirrors cosmic-seeker/skr.ts on the Solana side):
//   - No wallet              → returns { kind: 'no-wallet' }
//   - Treasury / USDC unset  → returns { kind: 'no-config' }
//   - Wrong chain            → walletClient.switchChain first; if it fails
//                              (user declines), the writeContract surfaces
//                              the exact reason in its error.
//   - Buyer has < amount     → wallet throws; caller surfaces error
//   - Happy path             → returns { kind: 'tx', hash }

import { parseUnits, keccak256, toBytes, type Hex } from 'viem';
import { walletClient, walletAddress, currentNetwork, publicClient } from './wallet';
import { NETWORKS } from './config';

export type BuyOutcome =
  | { kind: 'tx';        hash: Hex }
  | { kind: 'no-wallet' }
  | { kind: 'no-config' };

const USDC_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

const PAYMENT_ROUTER_ABI = [
  {
    type: 'function',
    name: 'payForItem',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sku',    type: 'bytes32' },
      { name: 'qty',    type: 'uint32'  },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const ZERO = '0x0000000000000000000000000000000000000000' as const;

/**
 * Hash an arbitrary shop-item ID (string like `"extra-life"`) into the
 * 32-byte SKU the router expects. Deterministic, off-chain — no RPC.
 */
export function skuHash(itemId: string): Hex {
  return keccak256(toBytes(itemId));
}

/**
 * Best-effort chain switch — viem throws a confusing error otherwise. We
 * swallow user-rejection here; the subsequent writeContract surfaces a
 * clearer message if the chain still doesn't match.
 */
async function ensureChain(): Promise<void> {
  const wc = walletClient();
  if (!wc) return;
  const cfg = NETWORKS[currentNetwork()];
  try {
    const current = await wc.getChainId();
    if (current !== cfg.chain.id) {
      await wc.switchChain({ id: cfg.chain.id });
    }
  } catch (e) {
    console.warn('[pay] chain switch declined / failed', e);
  }
}

/**
 * Pre-flight check + balance comparison so MetaMask's confusing revert
 * preview ("ERC20: transfer amount exceeds balance") never reaches the
 * player. We throw a friendly error that the shop's try/catch surfaces.
 */
async function assertEnoughUsdc(amount: bigint, priceUsd: number, qty: number): Promise<void> {
  const me = walletAddress();
  if (!me) return;
  const cfg = NETWORKS[currentNetwork()];
  try {
    const pc = publicClient();
    const balance = (await pc.readContract({
      address: cfg.contracts.USDC,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [me],
    })) as bigint;
    if (balance < amount) {
      // Scale by the network's stablecoin decimals (6 for USDC, 18 for cUSD).
      const divisor = 10 ** cfg.stableDecimals;
      const have = Number(balance) / divisor;
      const need = priceUsd * qty * (cfg.priceMultiplier ?? 1);
      const symbol = cfg.stableSymbol ?? (cfg.stableDecimals === 18 ? 'cUSD' : 'USDC');
      throw new Error(`Need ${need.toFixed(4)} ${symbol}, you have ${have.toFixed(2)}.`);
    }
  } catch (e: any) {
    // Re-throw insufficient-balance; swallow other RPC errors so the
    // real on-chain call still gets a chance.
    if (String(e?.message ?? '').startsWith('Need ')) throw e;
    console.warn('[pay] balance pre-check failed (continuing anyway)', e);
  }
}

/**
 * Ensure the router has at least `amount` USDC allowance from the buyer.
 * If not, prompts a single approve(router, amount) for EXACTLY this
 * purchase amount.
 *
 * Why approve the exact amount instead of an "infinite" allowance:
 *   - Rabby / MetaMask / Trust Wallet show a red WARNING banner when the
 *     approval exceeds the wallet balance ("Approve 340 trillion USDC,
 *     Exceeds your current balance"). For non-crypto-native players this
 *     reads like phishing and they bail.
 *   - Exact-amount approve shows "Approve 0.50 USDC" — clear, expected,
 *     trivially safe (the router can never pull more than what was
 *     approved). 2 popups per purchase is the standard ERC-20 dApp UX.
 */
async function ensureAllowance(router: `0x${string}`, amount: bigint): Promise<void> {
  const me = walletAddress();
  const wc = walletClient();
  if (!me || !wc) return;
  const cfg = NETWORKS[currentNetwork()];
  const pc = publicClient();
  const current = (await pc.readContract({
    address: cfg.contracts.USDC,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: [me, router],
  })) as bigint;
  if (current >= amount) return;

  const approveHash = await wc.writeContract({
    address: cfg.contracts.USDC,
    abi: USDC_ABI,
    functionName: 'approve',
    args: [router, amount],
    account: me,
    chain: cfg.chain,
  });
  // Wait for the approval to be mined so the subsequent payForItem call
  // doesn't race the allowance update.
  await pc.waitForTransactionReceipt({ hash: approveHash });
}

/**
 * Send `priceUsd × qty` USDC. If a PaymentRouter is configured for the
 * current network, route through the contract; otherwise direct transfer.
 *
 * `priceUsd` is a dollar amount (1 = one USDC, 0.5 = fifty cents). We
 * convert to 6-decimal base units before submitting.
 *
 * `itemId` (default `"unknown"`) becomes the on-chain `sku` field —
 * passing the shop item's `id` lets indexers reconstruct what was bought.
 */
export async function payUsdc(priceUsd: number, qty: number, itemId: string = 'unknown'): Promise<BuyOutcome> {
  // restoreSession() can leave us in a partially-bound state: `_address`
  // restored from localStorage (HUD shows "Connected"), `_walletClient`
  // still null until silent reauth finishes (or fails). Without recovery
  // the shop would BUY-fail even though the HUD says we're connected.
  // Drive `connect()` first to rebind the walletClient — silent for
  // already-authorised injected wallets, prompts the picker otherwise.
  let me = walletAddress();
  let wc = walletClient();
  if (me && !wc) {
    const { connect } = await import('./wallet');
    try { await connect(); } catch { /* user dismissed */ }
    me = walletAddress();
    wc = walletClient();
  }
  if (!me || !wc) return { kind: 'no-wallet' };

  const cfg = NETWORKS[currentNetwork()];
  if (!cfg.contracts.USDC || cfg.contracts.USDC === ZERO) return { kind: 'no-config' };
  if (!cfg.contracts.Treasury || cfg.contracts.Treasury === ZERO) return { kind: 'no-config' };

  // USDC on Base = 6 decimals, cUSD on Celo = 18. parseUnits avoids float drift.
  // Toggle fractional precision so 18-decimal cUSD doesn't truncate small prices.
  // Apply network multiplier — e.g. Celo cuts shop prices by 20× via 0.05.
  const fracDigits = Math.min(cfg.stableDecimals, 6);
  const scaled = priceUsd * qty * (cfg.priceMultiplier ?? 1);
  const amount = parseUnits(scaled.toFixed(fracDigits), cfg.stableDecimals);

  await ensureChain();
  await assertEnoughUsdc(amount, priceUsd, qty);

  const router = cfg.contracts.PaymentRouter;
  const routerLive = router && router !== ZERO;

  // ─── Path 1: PaymentRouter (mainnet, indexable on-chain event) ──────
  if (routerLive) {
    await ensureAllowance(router, amount);
    const hash = await wc.writeContract({
      address: router,
      abi: PAYMENT_ROUTER_ABI,
      functionName: 'payForItem',
      args: [skuHash(itemId), qty, amount],
      account: me,
      chain: cfg.chain,
    });
    return { kind: 'tx', hash };
  }

  // ─── Path 2: Legacy direct USDC.transfer (Sepolia / pre-router) ─────
  const hash = await wc.writeContract({
    address: cfg.contracts.USDC,
    abi: USDC_ABI,
    functionName: 'transfer',
    args: [cfg.contracts.Treasury, amount],
    account: me,
    chain: cfg.chain,
  });
  return { kind: 'tx', hash };
}

/**
 * Read the connected wallet's USDC balance (in USDC, not base units).
 * Returns `null` when there's no wallet or USDC isn't configured.
 */
export async function readUsdcBalance(): Promise<number | null> {
  const me = walletAddress();
  if (!me) return null;
  const cfg = NETWORKS[currentNetwork()];
  if (!cfg.contracts.USDC || cfg.contracts.USDC === ZERO) return null;
  const pc = publicClient();
  const raw = await pc.readContract({
    address: cfg.contracts.USDC,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [me],
  });
  // Scale by configured decimals — 6 (USDC/Base) or 18 (cUSD/Celo).
  return Number(raw) / 10 ** cfg.stableDecimals;
}
