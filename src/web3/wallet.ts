// Lightweight wallet adapter — Coinbase Smart Wallet first, then any injected EIP-1193 provider.
// We avoid hard-pulling RainbowKit/wagmi at runtime to keep the Vite bundle lean.
// The deeper hooks live in src/web3/hooks.ts; this file is the connection primitive.

import { createPublicClient, http, createWalletClient, custom, type Address, type WalletClient, type PublicClient } from 'viem';
import { NETWORKS, DEFAULT_NETWORK, type NetworkName } from './config';

let _provider: any = null;
let _walletClient: WalletClient | null = null;
let _publicClient: PublicClient | null = null;
let _address: Address | null = null;
let _network: NetworkName = DEFAULT_NETWORK;

const listeners = new Set<(addr: Address | null) => void>();

export function onAddressChange(fn: (addr: Address | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(_address);
}

export function currentNetwork(): NetworkName { return _network; }
export function setNetwork(n: NetworkName) {
  _network = n;
  _publicClient = createPublicClient({ chain: NETWORKS[n].chain, transport: http(NETWORKS[n].rpcUrl) });
}

export function publicClient(): PublicClient {
  if (!_publicClient) setNetwork(_network);
  return _publicClient!;
}

export function walletAddress(): Address | null { return _address; }
export function walletClient(): WalletClient | null { return _walletClient; }

export type WalletKind = 'walletconnect' | 'coinbase' | 'injected';

async function makeCoinbaseProvider(): Promise<any | null> {
  try {
    const mod = await import('@coinbase/wallet-sdk').catch(() => null);
    if (mod && (mod as any).default) {
      const CoinbaseWalletSDK = (mod as any).default;
      const sdk = new CoinbaseWalletSDK({
        appName: 'BaseStriker',
        appChainIds: [NETWORKS[_network].chain.id],
      });
      return sdk.makeWeb3Provider({ options: 'all' });
    }
  } catch { /* */ }
  return null;
}

async function makeWalletConnectProvider(): Promise<any | null> {
  try {
    const projectId = (import.meta.env?.VITE_WC_PROJECT_ID as string) || 'a01ec0aae23cc7c2f6fa1f3ef84a7c4f';
    const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
    const chain = NETWORKS[_network].chain;
    const provider = await EthereumProvider.init({
      projectId,
      chains: [chain.id],
      optionalChains: [chain.id],
      showQrModal: true,
      metadata: {
        name: 'BaseStriker',
        description: 'Galaxian-style arcade on Base. Earn POINTS, shoot bosses.',
        url: typeof location !== 'undefined' ? location.origin : 'https://basestriker.xyz',
        icons: ['/icon.svg'],
      },
    });
    return provider;
  } catch (e) {
    console.warn('[wallet] WalletConnect init failed', e);
    return null;
  }
}

async function pickWalletKind(): Promise<WalletKind | null> {
  // Modal — let the user pick.
  return await new Promise<WalletKind | null>((resolve) => {
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed', inset: '0', zIndex: '9999',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    } as Partial<CSSStyleDeclaration>);
    const card = document.createElement('div');
    Object.assign(card.style, {
      background: '#110028', border: '2px solid #00d4ff',
      padding: '20px', minWidth: '300px', maxWidth: '380px',
      display: 'flex', flexDirection: 'column', gap: '10px',
      boxShadow: '0 0 30px rgba(0,212,255,0.4)',
      fontFamily: '"Press Start 2P", monospace',
    } as Partial<CSSStyleDeclaration>);
    card.innerHTML = `<h3 style="color:#00d4ff;font-size:14px;margin-bottom:8px">CONNECT WALLET</h3>`;
    const mk = (label: string, kind: WalletKind | null, color: string) => {
      const b = document.createElement('button');
      b.textContent = label;
      Object.assign(b.style, {
        padding: '10px 14px', fontSize: '10px',
        background: '#0a0014', color, border: `2px solid ${color}`,
        cursor: 'pointer', fontFamily: 'inherit',
      } as Partial<CSSStyleDeclaration>);
      b.onclick = () => { root.remove(); resolve(kind); };
      return b;
    };
    card.appendChild(mk('WALLETCONNECT (QR / any wallet)', 'walletconnect', '#3b99fc'));
    card.appendChild(mk('COINBASE SMART WALLET', 'coinbase', '#0052ff'));
    if (typeof (window as any).ethereum !== 'undefined') {
      card.appendChild(mk('BROWSER WALLET (MetaMask, Rabby, …)', 'injected', '#ff8c1a'));
    }
    card.appendChild(mk('CANCEL', null, '#ff4860'));
    root.appendChild(card);
    document.body.appendChild(root);

    // Click-outside-to-cancel + Esc-to-cancel. Without these the picker
    // can be visually obscured (other panels, mobile address bar etc.)
    // and there's no way to resolve the promise — the shop button is then
    // stuck on "CONNECTING…" forever because `Promise.race([connect(),
    // timeout])` waits the full 25 s, and even after the timeout the user
    // is stuck without a way to reopen. Stopping click propagation on the
    // card means clicking the buttons themselves doesn't trigger the
    // backdrop cancel.
    card.addEventListener('click', (e) => e.stopPropagation());
    root.addEventListener('click', () => { root.remove(); resolve(null); });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        root.remove();
        document.removeEventListener('keydown', onKey);
        resolve(null);
      }
    };
    document.addEventListener('keydown', onKey);
  });
}

/**
 * True when the page is opened inside the MiniPay in-app browser (Opera's
 * stablecoin wallet on Celo). MiniPay injects `window.ethereum` with the
 * extra `isMiniPay` flag — the standard pattern from
 * https://docs.celo.org/build/build-on-minipay/integration-guide.
 *
 * When detected we skip the wallet picker entirely (MiniPay IS the wallet,
 * the user is already authenticated) and bypass straight to the injected
 * provider. The UI should also hide its "Connect wallet" CTA — there's no
 * other wallet to switch to inside MiniPay.
 */
export function isMiniPay(): boolean {
  if (typeof window === 'undefined') return false;
  const eth = (window as any).ethereum;
  return !!(eth && eth.isMiniPay);
}

export async function connect(kindOverride?: WalletKind): Promise<Address | null> {
  // MiniPay short-circuit: skip the picker, go straight to injected provider.
  if (!kindOverride && isMiniPay()) {
    return connect('injected');
  }
  const kind = kindOverride ?? await pickWalletKind();
  if (!kind) return null;

  _provider = null;
  if (kind === 'walletconnect') {
    _provider = await makeWalletConnectProvider();
    if (_provider) {
      try { await _provider.connect?.(); } catch (e) { console.warn('[wc] connect failed', e); }
    }
  } else if (kind === 'coinbase') {
    _provider = await makeCoinbaseProvider();
  } else if (kind === 'injected' && typeof (window as any).ethereum !== 'undefined') {
    _provider = (window as any).ethereum;
  }

  if (!_provider) {
    // Silent fail when called from auto-reconnect; only alert on user-initiated picker.
    if (!kindOverride) alert('Wallet provider unavailable. Try another option.');
    return null;
  }

  const accounts = await _provider.request({ method: 'eth_requestAccounts' });
  _address = (accounts?.[0] ?? null) as Address | null;
  if (_address) {
    _walletClient = createWalletClient({
      account: _address,
      chain: NETWORKS[_network].chain,
      transport: custom(_provider),
    });
    setNetwork(_network);
    // Switch chain if needed
    try {
      await _provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${NETWORKS[_network].chain.id.toString(16)}` }],
      });
    } catch (err: any) {
      // 4902 = chain not added — try to add Base.
      if (err?.code === 4902) {
        const c = NETWORKS[_network].chain;
        await _provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: `0x${c.id.toString(16)}`,
            chainName: c.name,
            rpcUrls: [NETWORKS[_network].rpcUrl],
            nativeCurrency: c.nativeCurrency,
            blockExplorerUrls: c.blockExplorers ? [c.blockExplorers.default.url] : [],
          }],
        });
      }
    }
    _provider.on?.('accountsChanged', (accs: string[]) => {
      _address = (accs?.[0] ?? null) as Address | null;
      persistSession(_address ? { address: _address, kind } : null);
      emit();
    });
    _provider.on?.('disconnect', () => { _address = null; persistSession(null); emit(); });
    persistSession({ address: _address, kind });
    emit();
  }
  return _address;
}

export async function disconnect() {
  try { await _provider?.disconnect?.(); } catch { /* not all providers expose this */ }
  _address = null;
  _walletClient = null;
  persistSession(null);
  emit();
}

// ── Session persistence ──────────────────────────────────────────────
//
// Remember the last successful (address, kind) pair so the next launch
// can auto-reconnect without re-showing the picker. Injected wallets
// (MetaMask, Coinbase Wallet) keep their permission grant per-origin —
// `eth_accounts` returns the account silently if the user is still
// authorised, so we can re-create the wallet client without a popup.

const STORAGE_KEY = 'basestriker.wallet';
interface PersistedSession { address: Address; kind: WalletKind; ts: number; }

function persistSession(s: { address: Address; kind: WalletKind } | null) {
  try {
    if (!s) { localStorage.removeItem(STORAGE_KEY); return; }
    const blob: PersistedSession = { ...s, ts: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  } catch { /* private mode / quota */ }
}

function readSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw) as PersistedSession;
    if (!blob.address || !blob.kind) return null;
    if (Date.now() - (blob.ts ?? 0) > 30 * 86_400_000) return null;
    return blob;
  } catch { return null; }
}

/**
 * Restore the last connected wallet at app boot. Returns the cached
 * address immediately for the HUD, then tries to silently re-authorise
 * (`eth_accounts` does not pop a confirmation dialog when the user is
 * already authorised). If the silent reauth fails the cached address
 * stays in the UI; the next signing call will surface the real reason.
 */
/**
 * MiniPay-only fast-path. On first visit (no cached session) inside the
 * MiniPay in-app browser we can silently fetch the connected account
 * because MiniPay treats the dapp as already authorised — no popup.
 *
 * Returns the address if MiniPay was detected and provided one; null
 * otherwise so the caller can fall through to the normal restoreSession
 * / picker flow.
 */
export async function autoConnectIfMiniPay(): Promise<Address | null> {
  if (!isMiniPay()) return null;
  try {
    _provider = (window as any).ethereum;
    // MiniPay returns the account from eth_accounts without prompting.
    const accounts: string[] = await _provider.request({ method: 'eth_accounts' });
    const addr = (accounts?.[0] ?? null) as Address | null;
    if (!addr) return null;
    _address = addr;
    _walletClient = createWalletClient({
      account: addr,
      chain: NETWORKS[_network].chain,
      transport: custom(_provider),
    });
    setNetwork(_network);
    _provider.on?.('accountsChanged', (accs: string[]) => {
      _address = (accs?.[0] ?? null) as Address | null;
      persistSession(_address ? { address: _address, kind: 'injected' } : null);
      emit();
    });
    persistSession({ address: addr, kind: 'injected' });
    emit();
    return addr;
  } catch (e) {
    console.warn('[wallet] MiniPay auto-connect failed', e);
    return null;
  }
}

export async function restoreSession(): Promise<Address | null> {
  // MiniPay takes priority — auto-connect even without a cached session.
  const minipay = await autoConnectIfMiniPay();
  if (minipay) return minipay;

  const cached = readSession();
  if (!cached) return null;
  _address = cached.address;
  emit();

  // Try silent reauth for injected wallets.
  if (cached.kind === 'injected' && typeof (window as any).ethereum !== 'undefined') {
    try {
      _provider = (window as any).ethereum;
      const accounts: string[] = await _provider.request({ method: 'eth_accounts' });
      const fresh = (accounts?.[0] ?? null) as Address | null;
      if (fresh && fresh.toLowerCase() === cached.address.toLowerCase()) {
        _address = fresh;
        _walletClient = createWalletClient({
          account: fresh,
          chain: NETWORKS[_network].chain,
          transport: custom(_provider),
        });
        _provider.on?.('accountsChanged', (accs: string[]) => {
          _address = (accs?.[0] ?? null) as Address | null;
          persistSession(_address ? { address: _address, kind: 'injected' } : null);
          emit();
        });
        _provider.on?.('disconnect', () => { _address = null; persistSession(null); emit(); });
        persistSession({ address: fresh, kind: 'injected' });
        emit();
      }
    } catch (e) {
      console.warn('[wallet] silent reconnect (injected) failed', e);
    }
  }
  // For walletconnect / coinbase the cached UI stays; the first real
  // signing call will re-establish the session if needed.
  return _address;
}
