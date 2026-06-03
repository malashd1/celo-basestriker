# Celo BaseStriker

The Celo-mainnet release of [BaseStriker](https://github.com/malashd1/Basestriker) — a
Galaxian-style retro arcade shooter with on-chain shop purchases. Built for
the **MiniPay** wallet and Celo's emerging-markets audience: 20× cheaper
prices than the Base version, paid in **cUSD**.

> Play it now: **https://celo.basestriker.xyz** (open inside MiniPay)

## What lives in this repo

This repo is the **Celo-specific surface** of the project. It contains:

```
contracts/
  CeloStrikerPaymentRouter.sol    Solidity contract deployed on Celo mainnet
docs/
  DEPLOY.md                       Step-by-step Remix deployment guide
  TALENT_SUBMISSION.md            Cheatsheet for the Talent Proof of Ship form
```

The **game source code** (Vite + TypeScript) lives in the upstream repository
[`malashd1/Basestriker`](https://github.com/malashd1/Basestriker) — same
codebase serves both the Base mainnet build (basestriker.xyz) and the Celo
build (celo.basestriker.xyz) via a network-aware config layer.

The shared codebase means UX improvements land on both chains at once:
mobile control positioning, the WALLET menu (DISCONNECT / CHANGE WALLET /
CANCEL), the HUD-vs-shop wallet state recovery, and the Chisoft publisher
attribution are all maintained in the upstream repo and automatically
benefit `celo.basestriker.xyz` on the next `dist/` deploy. As of this
note, `DEFAULT_NETWORK` is also runtime-detected from `window.location`
(hostname starting with `celo.` → Celo) so one build serves both
subdomains without per-chain `VITE_DEFAULT_NETWORK` flags.

## Deployed contract

| | |
|---|---|
| **Address** | [`0x30497388154f47B5Cee9814ADFF4ed2f264ef26b`](https://celoscan.io/address/0x30497388154f47B5Cee9814ADFF4ed2f264ef26b) |
| **Chain** | Celo mainnet (chain id 42220) |
| **Stablecoin** | cUSD — `0x765DE816845861e75A25fCA122bb6898B8B1282a` |
| **Treasury** | `0xe569A1f798D14809A076ea1c11cb13d698DFcE64` (shared with the Base release for unified bookkeeping) |
| **Owner** | `0x2eCe7De4C870D8A0bE4653fD96751EaAb98C3564` (deployer; can rotate treasury / pause) |

### Purchase flow

```
Player                          CeloStrikerPaymentRouter             Treasury
──────                          ────────────────────────             ────────
opens shop in MiniPay
taps BUY                   ──→  payForItem(skuHash, qty, amount)
                                  cUSD.transferFrom(buyer, treasury, amount)  ──→  + amount cUSD
                                  emit ItemPaid(buyer, sku, qty, amount, ts)
returns Tx hash             ←──
shop credits item
```

The router holds **no funds on-contract** — `transferFrom` pulls cUSD from the
buyer and forwards 100% to the treasury in the same transaction. The emitted
`ItemPaid` event lets Celoscan, Talent Protocol, and any indexer attribute
each on-chain purchase to the buyer + the specific shop item (`sku` is a
keccak256 hash of the item id string).

## MiniPay integration

The web client at `celo.basestriker.xyz` detects MiniPay's injected wallet
and auto-connects without showing a picker:

```ts
// src/web3/wallet.ts (in malashd1/Basestriker)
export function isMiniPay(): boolean {
  return !!(window as any).ethereum?.isMiniPay;
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

## Links

- **Live game**: https://celo.basestriker.xyz
- **Contract on Celoscan**: https://celoscan.io/address/0x30497388154f47B5Cee9814ADFF4ed2f264ef26b
- **Main game repo**: https://github.com/malashd1/Basestriker
- **Base mainnet release**: https://basestriker.xyz
- **Studio**: https://chisoft.co

## License

MIT — see [`contracts/CeloStrikerPaymentRouter.sol`](contracts/CeloStrikerPaymentRouter.sol) header.
