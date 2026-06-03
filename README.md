# Celo BaseStriker

The Celo-mainnet release of BaseStriker — a Galaxian-style retro arcade
shooter with on-chain shop purchases. Built for the **MiniPay** wallet and
Celo's emerging-markets audience: **20× cheaper prices than the Base
version, paid in cUSD**.

> Play it now: **https://celo.basestriker.xyz** (open inside MiniPay)

This repo is a **self-contained fork** prepared for the [Celo Proof of
Ship](docs/TALENT_SUBMISSION.md) submission via Talent Protocol. It
contains the full game source, backend, the deployed Celo PaymentRouter
contract, and deployment docs.

## Repo layout

```
src/                       Vite + TypeScript game frontend
  game/                    engine, levels, loot, touch controls
  ui/                      shop, leaderboard, settings, badges, missions
  web3/                    network-aware payments, wallet, config
backend/                   Express + SQLite leaderboard / score-attest API
contracts/                 Solidity sources
  CeloStrikerPaymentRouter.sol   ← deployed on Celo mainnet, verified
landing/                   marketing page served at basestriker.xyz apex
landing-studio/            Chisoft publisher page (chisoft.co)
docs/                      deployment + Talent Proof of Ship submission notes
public/                    static assets (icons, splash, sprites, manifests)
scripts/                   icon generation, level dump, deploy helpers
.github/workflows/         CI for contracts (Foundry) + frontend (build check)
```

The mirror twin [`malashd1/Basestriker`](https://github.com/malashd1/Basestriker)
is the Base mainnet release. Both forks share the same engine + UI; the only
runtime difference is which network config gets picked.

## Quickstart (local dev)

```bash
# Frontend
npm install
npm run dev          # http://localhost:5173

# Backend
cd backend
npm install
npm run dev          # http://localhost:8787 (SQLite at backend/basestriker.db)

# Contracts
cd contracts
forge build
forge test -vv
```

## Network defaults

`VITE_DEFAULT_NETWORK=celo` is set in `.env.production` so a clean clone
builds for Celo out of the box. The runtime layer in
[`src/web3/config.ts`](src/web3/config.ts) (see `detectDefaultNetwork`)
*also* returns `celo` whenever `window.location.hostname` starts with
`celo.`, so the same `dist/` can serve both `celo.basestriker.xyz` and
(if you point it elsewhere) `app.basestriker.xyz` without a per-host
rebuild.

## Deployed contract

| | |
|---|---|
| **Address** | [`0x30497388154f47B5Cee9814ADFF4ed2f264ef26b`](https://celoscan.io/address/0x30497388154f47B5Cee9814ADFF4ed2f264ef26b) |
| **Chain** | Celo mainnet (chain id 42220) |
| **Stablecoin** | cUSD — `0x765DE816845861e75A25fCA122bb6898B8B1282a` (18 decimals) |
| **Treasury** | `0xe569A1f798D14809A076ea1c11cb13d698DFcE64` (shared with the Base release for unified bookkeeping) |
| **Owner** | `0x2eCe7De4C870D8A0bE4653fD96751EaAb98C3564` (deployer; can rotate treasury) |
| **Source** | [`contracts/CeloStrikerPaymentRouter.sol`](contracts/CeloStrikerPaymentRouter.sol) |
| **Deploy guide** | [`docs/DEPLOY.md`](docs/DEPLOY.md) |

### Purchase flow

```
Player                          CeloStrikerPaymentRouter             Treasury
  │                                       │                              │
  │  approve(router, qty × cUSD)          │                              │
  │ ─────────────────────────────────────►│                              │
  │                                       │                              │
  │  payForItem(skuHash, qty, amount)     │                              │
  │ ─────────────────────────────────────►│                              │
  │                                       │  transferFrom(buyer, treasury,
  │                                       │      amount)                 │
  │                                       │ ────────────────────────────►│
  │                                       │                              │
  │                                       │  emit ItemPaid(buyer, sku,   │
  │                                       │      qty, amount)            │
  │                                       │                              │
```

`ItemPaid` is the canonical event indexers (Talent Protocol, The Graph
proxies, basic block scanners) ingest to count contract usage.

## MiniPay integration

```ts
// src/web3/wallet.ts (excerpt)
function isMiniPay(): boolean {
  return typeof (window as any).ethereum !== 'undefined'
    && (window as any).ethereum.isMiniPay === true;
}

export async function autoConnectIfMiniPay(): Promise<Address | null> {
  if (!isMiniPay()) return null;
  const provider = (window as any).ethereum;
  const [addr] = await provider.request({ method: 'eth_accounts' });
  // … wire up wallet client …
  return addr;
}
```

When opened outside MiniPay (any normal browser on desktop / mobile), the
page falls back to the standard wallet picker (WalletConnect / Coinbase /
injected).

## Pricing

Prices on Celo are 20× cheaper than the Base release, configured via a
single `priceMultiplier` field on the network config — same shop item
table, different scaling per chain.

| Item | Base price | Celo price |
|---|---|---|
| Extra Life | $1 | 0.05 cUSD |
| +1 Bomb | $2 | 0.10 cUSD |
| Hunter Rocket | $2 | 0.10 cUSD |
| Wingman Drone | $2 | 0.10 cUSD |
| Homing Rocket | $9 | 0.45 cUSD |

## Talent Proof of Ship submission

See [`docs/TALENT_SUBMISSION.md`](docs/TALENT_SUBMISSION.md) for the form
cheatsheet (project description, links, contract address fields, expected
proof artifacts).

## Studio

BaseStriker is published by [Chisoft](https://chisoft.co/) — an independent
game studio based in Prague, Czech Republic. See the full game lineup at
[chisoft.co](https://chisoft.co/).

## Links

- **Live game**: https://celo.basestriker.xyz
- **Contract on Celoscan**: https://celoscan.io/address/0x30497388154f47B5Cee9814ADFF4ed2f264ef26b
- **Base mainnet mirror**: https://basestriker.xyz · [GitHub](https://github.com/malashd1/Basestriker)
- **Studio**: https://chisoft.co

## License

MIT — see [`LICENSE`](LICENSE).
