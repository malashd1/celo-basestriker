// Stripe fiat-onramp handler. Two endpoints:
//   POST /api/stripe/checkout — create a checkout session for a single item
//   POST /api/stripe/webhook  — verify signature, mint NFT via PaymentRouter.relayerMint*
//
// We avoid bundling the official `stripe` SDK to keep deps tiny. Stripe webhook signatures
// are verified manually with HMAC-SHA256 over `${timestamp}.${rawBody}` against the secret.

import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { createPublicClient, createWalletClient, http, type Address, type Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { env, log } from './env.js';

const STRIPE_SECRET_KEY = env.stripeSecretKey;
const STRIPE_WEBHOOK_SECRET = env.stripeWebhookSecret;
const PAYMENT_ROUTER = env.paymentRouter as Address;
const RELAYER_KEY = env.relayerKey;
const CHAIN_ID = env.chainId;
const RPC_URL = env.rpcUrl;

const ROUTER_ABI = [
  { type: 'function', name: 'relayerMintShip', stateMutability: 'nonpayable',
    inputs: [{ name: 'buyer', type: 'address' }, { name: 'tier', type: 'uint8' }, { name: 'ref', type: 'bytes32' }],
    outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'relayerMintEquipment', stateMutability: 'nonpayable',
    inputs: [{ name: 'buyer', type: 'address' }, { name: 'id', type: 'uint32' }, { name: 'ref', type: 'bytes32' }],
    outputs: [] },
] as const;

const relayerAccount = privateKeyToAccount(RELAYER_KEY as `0x${string}`);
const chain = CHAIN_ID === 8453 ? base : baseSepolia;
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account: relayerAccount, chain, transport: http(RPC_URL) });

log.info('stripe.boot', { relayer: relayerAccount.address, chainId: CHAIN_ID });

// ---- Checkout session ----
// Frontend hits this with { wallet, itemKind, tier|equipmentId, priceUsd }.
// We call Stripe's checkout.sessions API and return the redirect URL.
//
// Stripe REST request:
//   POST https://api.stripe.com/v1/checkout/sessions
//   Authorization: Bearer ${STRIPE_SECRET_KEY}
//   Content-Type: application/x-www-form-urlencoded
export async function createCheckout(req: Request, res: Response) {
  if (!STRIPE_SECRET_KEY) return res.status(503).json({ error: 'stripe_not_configured' });
  const { wallet, itemKind, tier, equipmentId, priceUsdCents, successUrl, cancelUrl } = req.body ?? {};
  if (!wallet || typeof wallet !== 'string') return res.status(400).json({ error: 'bad_wallet' });
  if (itemKind !== 'ship' && itemKind !== 'equipment') return res.status(400).json({ error: 'bad_itemKind' });
  if (!Number.isInteger(priceUsdCents) || priceUsdCents < 100) return res.status(400).json({ error: 'bad_price' });

  const metadata: Record<string, string> = {
    wallet: wallet.toLowerCase(),
    itemKind,
  };
  if (itemKind === 'ship') metadata.tier = String(tier);
  else metadata.equipmentId = String(equipmentId);

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', successUrl ?? 'https://basestriker.xyz/?stripe=success');
  params.set('cancel_url',  cancelUrl  ?? 'https://basestriker.xyz/?stripe=cancel');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set('line_items[0][price_data][product_data][name]', itemKind === 'ship' ? `BaseStriker Ship Tier ${tier}` : `BaseStriker Equipment #${equipmentId}`);
  params.set('line_items[0][price_data][unit_amount]', String(priceUsdCents));
  params.set('line_items[0][quantity]', '1');
  for (const [k, v] of Object.entries(metadata)) params.set(`metadata[${k}]`, v);

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const json = await r.json() as any;
    if (!r.ok) return res.status(502).json({ error: 'stripe_create_failed', detail: json });
    return res.json({ id: json.id, url: json.url });
  } catch (e: any) {
    return res.status(500).json({ error: 'fetch_failed', detail: e.message });
  }
}

// ---- Webhook ----
// Stripe sends `Stripe-Signature: t=<ts>,v1=<sig>` headers. Verify with HMAC-SHA256.
export function verifyStripeSig(rawBody: string, sigHeader: string | undefined): boolean {
  if (!sigHeader || !STRIPE_WEBHOOK_SECRET) return false;
  const parts = sigHeader.split(',').map((p) => p.split('='));
  const t = parts.find((p) => p[0] === 't')?.[1];
  const v1 = parts.find((p) => p[0] === 'v1')?.[1];
  if (!t || !v1) return false;
  // Protect against replay >5 min old.
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (age > 300) return false;
  const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(`${t}.${rawBody}`).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1)); } catch { return false; }
}

export async function handleWebhook(req: Request, res: Response) {
  const raw = (req as any).rawBody as string | undefined;
  if (!raw) return res.status(400).send('no_raw_body');
  if (!verifyStripeSig(raw, req.header('stripe-signature'))) return res.status(400).send('bad_sig');

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return res.status(400).send('bad_json'); }

  if (evt.type !== 'checkout.session.completed') {
    return res.status(200).send('ignored');
  }

  const session = evt.data?.object;
  const meta = session?.metadata ?? {};
  const wallet: string | undefined = meta.wallet;
  const itemKind: string | undefined = meta.itemKind;
  if (!wallet || !itemKind) return res.status(400).send('missing_meta');

  // Use Stripe payment_intent id as a stable external reference for idempotency.
  const externalRef = '0x' + crypto.createHash('sha256').update(session.id ?? 'unknown').digest('hex').slice(0, 64);

  try {
    let hash: Hash;
    if (itemKind === 'ship') {
      const tier = Number(meta.tier);
      hash = await walletClient.writeContract({
        address: PAYMENT_ROUTER,
        abi: ROUTER_ABI,
        functionName: 'relayerMintShip',
        args: [wallet as Address, tier, externalRef as `0x${string}`],
      });
    } else {
      const id = Number(meta.equipmentId);
      hash = await walletClient.writeContract({
        address: PAYMENT_ROUTER,
        abi: ROUTER_ABI,
        functionName: 'relayerMintEquipment',
        args: [wallet as Address, id, externalRef as `0x${string}`],
      });
    }
    await publicClient.waitForTransactionReceipt({ hash });
    log.info('stripe.minted', { wallet, tx: hash });
    return res.status(200).send('ok');
  } catch (e: any) {
    log.error('stripe.mint_failed', { msg: e?.message });
    // Stripe will retry; we still return 500 so the failure is durable.
    return res.status(500).send('mint_failed');
  }
}
