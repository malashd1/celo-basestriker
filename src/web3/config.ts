// Network and contract configuration for Base mainnet + Base Sepolia + Celo.
// Contract addresses are filled in after deployment (see contracts/script/Deploy.s.sol).

import { base, baseSepolia, celo, type Chain } from 'viem/chains';

export type NetworkName = 'base' | 'baseSepolia' | 'celo';

export interface NetworkConfig {
  chain: Chain;
  rpcUrl: string;
  contracts: {
    StrikerToken: `0x${string}`;
    ShipNFT: `0x${string}`;
    EquipmentNFT: `0x${string}`;
    GameRegistry: `0x${string}`;
    PaymentRouter: `0x${string}`;
    RewardsDistributor: `0x${string}`;
    Treasury: `0x${string}`;
    /** Address of the network's stablecoin. The field is named USDC for
     *  historical reasons (Base used native USDC); on Celo this holds cUSD. */
    USDC: `0x${string}`;
  };
  /** Decimals of the stablecoin in `contracts.USDC`. USDC = 6, cUSD = 18.
   *  Read by payments.ts to scale `priceUsd` to base units. */
  stableDecimals: number;
  /** Display symbol for the stablecoin shown in shop UI / errors.
   *  Defaults to "USDC" when omitted. */
  stableSymbol?: string;
  /** Multiplier applied to shop priceUsd values for this network. 1.0 = no
   *  change (Base). On Celo we set 0.05 so every shop price is 20× cheaper —
   *  Celo's audience comes mostly from MiniPay's emerging-markets users and
   *  the Base USD prices are too steep there. */
  priceMultiplier?: number;
  paymasterUrl?: string;
  backendUrl: string;
}

const ZERO = '0x0000000000000000000000000000000000000000' as const;

/**
 * BaseStriker treasury — receives every shop purchase. Same wallet on
 * mainnet + Sepolia so the operator only has to keep one private key.
 * Override per-network via VITE_TREASURY_ADDR / _ADDR_TEST if you want
 * separate cold/hot wallets.
 */
const TREASURY_DEFAULT = '0xe569A1f798D14809A076ea1c11cb13d698DFcE64' as const;

/**
 * Live BaseStriker PaymentRouter on Base mainnet. Players approve USDC to
 * this address and call `payForItem(sku, qty, amount)`; the contract pulls
 * USDC and forwards it to TREASURY_DEFAULT, emitting `ItemPaid(buyer, sku,
 * qty, amount)` for indexers. Verified on Basescan.
 *
 * Source: contracts/talent-deploy/BaseStrikerPaymentRouter.sol
 * Owner: 0x2eCe7De4… (deployer)
 *
 * Override per-network via VITE_PAYMENT_ADDR / _ADDR_TEST.
 */
const PAYMENT_ROUTER_BASE = '0xc08bda33E32Da9255f21BB57afF78e6d1EAb6789' as const;

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  base: {
    chain: base,
    rpcUrl: import.meta.env?.VITE_BASE_RPC || 'https://mainnet.base.org',
    contracts: {
      StrikerToken:       (import.meta.env?.VITE_STRK_ADDR as `0x${string}`)         || ZERO,
      ShipNFT:            (import.meta.env?.VITE_SHIP_ADDR as `0x${string}`)         || ZERO,
      EquipmentNFT:       (import.meta.env?.VITE_EQUIP_ADDR as `0x${string}`)        || ZERO,
      GameRegistry:       (import.meta.env?.VITE_REGISTRY_ADDR as `0x${string}`)     || ZERO,
      PaymentRouter:      (import.meta.env?.VITE_PAYMENT_ADDR as `0x${string}`)      || PAYMENT_ROUTER_BASE,
      RewardsDistributor: (import.meta.env?.VITE_REWARDS_ADDR as `0x${string}`)      || ZERO,
      Treasury:           (import.meta.env?.VITE_TREASURY_ADDR as `0x${string}`)     || TREASURY_DEFAULT,
      USDC:               '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Native USDC on Base
    },
    stableDecimals: 6,
    paymasterUrl: import.meta.env?.VITE_PAYMASTER_URL,
    backendUrl: import.meta.env?.VITE_BACKEND_URL || 'https://api.basestriker.xyz',
  } as NetworkConfig,
  baseSepolia: {
    chain: baseSepolia,
    rpcUrl: import.meta.env?.VITE_BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
    contracts: {
      StrikerToken:       (import.meta.env?.VITE_STRK_ADDR_TEST as `0x${string}`)        || ZERO,
      ShipNFT:            (import.meta.env?.VITE_SHIP_ADDR_TEST as `0x${string}`)        || ZERO,
      EquipmentNFT:       (import.meta.env?.VITE_EQUIP_ADDR_TEST as `0x${string}`)       || ZERO,
      GameRegistry:       (import.meta.env?.VITE_REGISTRY_ADDR_TEST as `0x${string}`)    || ZERO,
      PaymentRouter:      (import.meta.env?.VITE_PAYMENT_ADDR_TEST as `0x${string}`)     || ZERO,
      RewardsDistributor: (import.meta.env?.VITE_REWARDS_ADDR_TEST as `0x${string}`)     || ZERO,
      Treasury:           (import.meta.env?.VITE_TREASURY_ADDR_TEST as `0x${string}`)    || TREASURY_DEFAULT,
      USDC:               '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
    },
    stableDecimals: 6,
    paymasterUrl: import.meta.env?.VITE_PAYMASTER_URL_TEST,
    // Dev: prefer same host as the page (so `http://192.168.x.x:5173` resolves the
    // backend at `http://192.168.x.x:8787`). Falls back to localhost if `location`
    // is unavailable (SSR / unit test).
    backendUrl: import.meta.env?.VITE_BACKEND_URL_TEST
      || (typeof location !== 'undefined' ? `${location.protocol}//${location.hostname}:8787` : 'http://localhost:8787'),
  } as NetworkConfig,
  /**
   * Celo mainnet — entry point for MiniPay (Opera's wallet, primary distribution
   * channel for Celo apps). Uses cUSD (18 decimals) as the in-game stablecoin
   * instead of Base's native USDC (6 decimals).
   *
   * PaymentRouter on Celo: `CeloStrikerPaymentRouter` — same ABI as the Base
   * router, just renamed and accepts cUSD. Deployed manually via Remix; address
   * baked here so the Vite build doesn't need an env var to find it (still
   * overridable via VITE_PAYMENT_ADDR_CELO if you redeploy).
   *
   * Treasury is intentionally the SAME wallet as Base — unified bookkeeping.
   */
  celo: {
    chain: celo,
    rpcUrl: import.meta.env?.VITE_CELO_RPC || 'https://forno.celo.org',
    contracts: {
      StrikerToken:       ZERO, // not deployed on Celo (no STRK token here)
      ShipNFT:            ZERO,
      EquipmentNFT:       ZERO,
      GameRegistry:       ZERO,
      PaymentRouter:      (import.meta.env?.VITE_PAYMENT_ADDR_CELO as `0x${string}`)
                          || '0x30497388154f47B5Cee9814ADFF4ed2f264ef26b',
      RewardsDistributor: ZERO,
      Treasury:           (import.meta.env?.VITE_TREASURY_ADDR_CELO as `0x${string}`)
                          || TREASURY_DEFAULT,
      // cUSD on Celo mainnet — Celo's native USD stablecoin, the asset MiniPay
      // users primarily hold. 18 decimals (not 6 like USDC!).
      USDC:               '0x765DE816845861e75A25fCA122bb6898B8B1282a',
    },
    stableDecimals: 18,
    stableSymbol: 'cUSD',
    // 20× cheaper than Base: $1 boost → $0.05 boost in cUSD. Easier upsell
    // for MiniPay's audience, and aligns the shop with real cUSD balances
    // typical in the wallet.
    priceMultiplier: 0.05,
    backendUrl: import.meta.env?.VITE_BACKEND_URL_CELO
      || import.meta.env?.VITE_BACKEND_URL
      || 'https://api.basestriker.xyz',
  } as NetworkConfig,
};

/**
 * Default network resolution order:
 *   1. Runtime hostname: if the page is served from `celo.basestriker.xyz`
 *      (or any `celo.*` subdomain), force `celo` regardless of build-time
 *      env. Lets a single `dist/` deploy serve both the Base and Celo
 *      subdomains without rebuilding twice with different VITE vars.
 *   2. Build-time: `VITE_DEFAULT_NETWORK` from `.env.production` / `.env`.
 *   3. Fallback: `baseSepolia` for local dev where nothing's set.
 */
function detectDefaultNetwork(): NetworkName {
  if (typeof window !== 'undefined' && window.location?.hostname?.startsWith('celo.')) {
    return 'celo';
  }
  const env = import.meta.env?.VITE_DEFAULT_NETWORK as NetworkName | undefined;
  if (env === 'base' || env === 'baseSepolia' || env === 'celo') return env;
  return 'baseSepolia';
}

export const DEFAULT_NETWORK: NetworkName = detectDefaultNetwork();
