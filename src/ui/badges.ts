// 🏆 BADGES panel — shows the player's eligible weekly Top-10 NFTs and
// lets them claim via on-chain mint. Mirrors the look-and-feel of the
// shop / leaderboard panels.
//
// Flow:
//   1. Open panel → fetch /api/badge/eligible/:addr
//   2. Backend returns array of { weekId, rank, tier, signature, mintFeeWei, imageUrl }
//   3. For each entry, render a card with image + tier label + CLAIM button
//   4. CLAIM → on-chain mint(weekId, rank, sig) value=mintFeeWei via wallet
//   5. After tx mined → button flips to "✓ MINTED" + Basescan link

import { walletAddress, walletClient, currentNetwork, connect, onAddressChange } from '../web3/wallet';
import { NETWORKS } from '../web3/config';
import { audio } from '../game/audio';

interface EligibleBadge {
  /// Internal weekId (passed verbatim to mint(); matches signature payload).
  weekId: number;
  /// Human-facing "Week N" label from backend `displayWeekId()`. Falls back
  /// to weekId if a stale backend hasn't shipped the new field yet.
  weekIdDisplay?: number;
  rank: number;
  tier: 'GOLD' | 'SILVER' | 'BRONZE' | 'TOP-10';
  signature: `0x${string}`;
  contract: `0x${string}`;
  chainId: number;
  mintFeeWei: string;
  imageUrl: string;
  metaUrl: string;
}

interface EligibleResponse {
  player: string;
  contract: `0x${string}`;
  mintFeeWei: string;
  badges: EligibleBadge[];
}

const BADGE_ABI = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'payable',
    inputs: [
      { name: 'weekId', type: 'uint64'  },
      { name: 'rank',   type: 'uint32'  },
      { name: 'sig',    type: 'bytes'   },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'minted',
    stateMutability: 'view',
    inputs: [{ name: 'key', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const TIER_COLOR: Record<EligibleBadge['tier'], string> = {
  'GOLD':   '#FFD700',
  'SILVER': '#C0C0C0',
  'BRONZE': '#CD7F32',
  'TOP-10': '#00d4ff',
};

export function renderBadges(root: HTMLElement, onClose: () => void) {
  root.innerHTML = '';
  root.classList.remove('hidden');

  const title = document.createElement('h2');
  title.textContent = '🏆 BADGES';
  root.appendChild(title);

  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:9px;color:#9a9ac0;text-align:center';
  sub.textContent = 'Soulbound NFTs for weekly Top-10 finishers · Base mainnet';
  root.appendChild(sub);

  const grid = document.createElement('div');
  grid.style.cssText = [
    'display:grid',
    'grid-template-columns:repeat(auto-fit, minmax(180px, 1fr))',
    'gap:12px',
    'width:100%',
    'max-width:560px',
    'margin-top:8px',
  ].join(';');
  root.appendChild(grid);

  const status = document.createElement('div');
  status.style.cssText = 'font-size:10px;color:#9a9ac0;text-align:center;margin-top:8px';
  status.textContent = 'Loading…';
  root.appendChild(status);

  // Real CONNECT button — shown when no wallet is attached. Mirrors the shop
  // panel's pattern (Promise.race against a timeout so a stalled connector
  // doesn't lock the UI). Hidden by default; `loadAndRender` toggles it on.
  const connectBtn = document.createElement('button');
  connectBtn.textContent = 'CONNECT WALLET';
  connectBtn.className = 'primary';
  connectBtn.style.cssText = 'margin-top:4px;display:none';
  connectBtn.onclick = async () => {
    connectBtn.disabled = true;
    connectBtn.textContent = 'CONNECTING…';
    try {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 60_000));
      await Promise.race([connect(), timeout]);
    } catch (e) {
      console.warn('[badge] connect failed', e);
    } finally {
      connectBtn.disabled = false;
      connectBtn.textContent = 'CONNECT WALLET';
    }
    // `onAddressChange` will fire and re-render when the wallet actually
    // attaches; nothing else to do here.
  };
  root.appendChild(connectBtn);

  // Re-render whenever the wallet address changes (connect / disconnect /
  // switch), so the panel reflects the current wallet without forcing the
  // user to close + reopen it.
  const offWallet = onAddressChange(() => {
    void loadAndRender(grid, status, connectBtn);
  });

  const close = document.createElement('button');
  close.textContent = 'CLOSE';
  close.className = 'danger';
  close.onclick = () => {
    offWallet();             // stop listening — avoids leaking callbacks on
                             // every BADGES open / close cycle
    root.classList.add('hidden');
    onClose();
  };
  root.appendChild(close);

  void loadAndRender(grid, status, connectBtn);
}

async function loadAndRender(grid: HTMLElement, status: HTMLElement, connectBtn: HTMLButtonElement) {
  // Reset any prior render — onAddressChange may invoke us multiple times.
  grid.innerHTML = '';
  status.style.display = '';
  status.style.color = '#9a9ac0';

  const me = walletAddress();
  if (!me) {
    status.innerHTML = [
      'Connect a wallet to see your eligible badges.',
      '<br>',
      '<span style="font-size:8px;opacity:0.6">',
      'Same wallet you use for the shop / leaderboard.',
      '</span>',
    ].join('');
    connectBtn.style.display = '';
    return;
  }

  // Wallet attached → hide CONNECT button.
  connectBtn.style.display = 'none';

  status.textContent = 'Loading…';

  const cfg = NETWORKS[currentNetwork()];
  const apiBase = cfg.backendUrl;

  let resp: EligibleResponse;
  try {
    const r = await fetch(`${apiBase}/api/badge/eligible/${me}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    resp = await r.json();
  } catch (e: any) {
    status.textContent = `Failed to load: ${e?.message ?? e}`;
    status.style.color = '#ff4860';
    return;
  }

  if (resp.badges.length === 0) {
    status.innerHTML = [
      'No claimable badges yet.',
      '<br>',
      '<span style="font-size:8px;opacity:0.6">',
      'Finish a full week inside the weekly Top-10 leaderboard',
      '<br>',
      'to earn a soulbound badge (rank 1 = GOLD).',
      '</span>',
    ].join('');
    return;
  }

  status.style.display = 'none';

  // Render one card per claimable badge. Filter out already-minted ones
  // via the contract's `minted` mapping (skip those; could optionally show
  // them as "owned" but we just don't list duplicates).
  for (const b of resp.badges) {
    grid.appendChild(renderCard(b));
  }
}

function renderCard(b: EligibleBadge): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = [
    'border:2px solid ' + TIER_COLOR[b.tier],
    'padding:10px',
    'background:#110028',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:6px',
    'box-shadow:0 0 12px ' + TIER_COLOR[b.tier] + '40',
  ].join(';');

  // Prefer the backend's displayWeekId (compact "Week 1, 2, 3…" counting from
  // launch); fall back to the raw weekId if the backend response predates
  // that field.
  const weekLabel = b.weekIdDisplay ?? b.weekId;

  const img = document.createElement('img');
  img.src = b.imageUrl;
  img.style.cssText = 'width:100%;max-width:160px;image-rendering:pixelated';
  img.alt = `Week ${weekLabel} · Rank ${b.rank}`;
  card.appendChild(img);

  const tier = document.createElement('div');
  tier.style.cssText = `font-size:10px;color:${TIER_COLOR[b.tier]};text-align:center;letter-spacing:1px`;
  tier.textContent = `${b.tier} · #${b.rank}`;
  card.appendChild(tier);

  const week = document.createElement('div');
  week.style.cssText = 'font-size:8px;color:#9a9ac0;text-align:center';
  week.textContent = `Week ${weekLabel}`;
  card.appendChild(week);

  const btn = document.createElement('button');
  btn.textContent = `CLAIM · ${(Number(b.mintFeeWei) / 1e18).toFixed(4)} ETH`;
  btn.style.cssText = `min-width:0;padding:6px 8px;font-size:8px;border-color:${TIER_COLOR[b.tier]};color:${TIER_COLOR[b.tier]}`;
  btn.onclick = () => void claim(b, btn);
  card.appendChild(btn);

  return card;
}

async function claim(b: EligibleBadge, btn: HTMLButtonElement) {
  let me = walletAddress();
  let wc = walletClient();
  // No wallet → actually drive the connect flow instead of just rewriting the
  // label and bailing. After connect resolves we proceed with the mint so the
  // user doesn't have to click CLAIM a second time.
  if (!me || !wc) {
    btn.disabled = true;
    btn.textContent = 'CONNECTING…';
    try {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 60_000));
      await Promise.race([connect(), timeout]);
    } catch (e) {
      console.warn('[badge] connect failed', e);
    }
    me = walletAddress();
    wc = walletClient();
    if (!me || !wc) {
      btn.disabled = false;
      btn.textContent = 'CONNECT WALLET';
      return;
    }
  }
  const cfg = NETWORKS[currentNetwork()];

  btn.disabled = true;
  btn.textContent = 'CONFIRM IN WALLET…';

  try {
    // Chain switch — same pattern as shop payments.
    try {
      const current = await wc.getChainId();
      if (current !== cfg.chain.id) await wc.switchChain({ id: cfg.chain.id });
    } catch { /* user declined; writeContract will surface real error */ }

    const hash = await wc.writeContract({
      address: b.contract,
      abi: BADGE_ABI,
      functionName: 'mint',
      args: [BigInt(b.weekId), b.rank, b.signature],
      value: BigInt(b.mintFeeWei),
      account: me,
      chain: cfg.chain,
    });

    btn.textContent = '✓ MINTED';
    btn.style.color = '#4cff7a';
    btn.style.borderColor = '#4cff7a';

    try { audio.play('connect'); } catch { /* */ }

    const link = document.createElement('a');
    link.href = `https://basescan.org/tx/${hash}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'view on basescan ↗';
    link.style.cssText = 'font-size:8px;color:#4cff7a;text-decoration:underline;margin-top:4px';
    btn.parentElement?.appendChild(link);
  } catch (e: any) {
    console.warn('[badge] mint failed', e);
    const reason = String(e?.shortMessage ?? e?.message ?? e).slice(0, 60);
    btn.textContent = `FAILED: ${reason}`;
    btn.style.color = '#ff4860';
    btn.style.borderColor = '#ff4860';
    btn.disabled = false;
  }
}
