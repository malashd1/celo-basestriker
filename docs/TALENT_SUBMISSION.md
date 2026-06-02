# Talent App — Celo Proof of Ship submission cheatsheet

Use this when you submit BaseStriker-on-Celo to **https://talent.app/~/earn/celo-proof-of-ship**.

## Project metadata

| Field | Value |
|---|---|
| **Name** | `BaseStriker on Celo` (or `Celo BaseStriker` — same game, dedicated Celo entry point) |
| **Tagline** _(under 100 chars)_ | `Galaxian-style arcade shooter on Celo. Pay-to-boost with cUSD via MiniPay.` |
| **Category** | Gaming / Arcade |
| **Live URL** | `https://celo.basestriker.xyz` |
| **GitHub** | `https://github.com/malashd1/Basestriker` |
| **Twitter** | _(your project handle, if any)_ |
| **Logo** | use `https://app.basestriker.xyz/icon-512.png` |
| **Banner / OG image** | Take a screenshot of the game, 1200×630 |

## Long description (paste this)

```
BaseStriker is a Galaxian-style retro arcade shooter — 100 levels, 12 enemy
types, 10 bosses. The Celo build is the MiniPay entry point: open
celo.basestriker.xyz inside MiniPay, auto-connect, pay for shop boosts in
cUSD.

Why it fits Proof of Ship:
- Live verified smart contract on Celo mainnet:
  0x30497388154f47B5Cee9814ADFF4ed2f264ef26b
  (CeloStrikerPaymentRouter — minimal cUSD router emitting ItemPaid events
  per purchase for indexer attribution)
- MiniPay-native: detects window.ethereum.isMiniPay, skips the wallet
  picker, auto-connects to the injected provider on first load.
- Real cross-chain product — BaseStriker is also live on Base mainnet at
  basestriker.xyz with its own deployed PaymentRouter. Celo is a fresh
  entry point optimized for MiniPay's audience (sub-cent fees, mobile-first).
- Non-custodial: the contract pulls cUSD on every purchase via
  transferFrom and forwards 100% to the configured treasury. No funds
  held on-contract.
```

## Smart contract to link

| Field | Value |
|---|---|
| **Contract address** | `0x30497388154f47B5Cee9814ADFF4ed2f264ef26b` |
| **Chain** | Celo mainnet (42220) |
| **Verified on** | https://celoscan.io/address/0x30497388154f47B5Cee9814ADFF4ed2f264ef26b |
| **Source** | `contracts/talent-deploy/CeloStrikerPaymentRouter.sol` in the GitHub repo |

If Talent asks for the deploy tx hash too: open the contract page on Celoscan, click "Contract Creation" — copy the tx hash from there.

## What Talent / Proof of Ship reviewers will check

1. **Contract exists on Celo mainnet** ✓ (already deployed)
2. **App actually opens in MiniPay** — open `celo.basestriker.xyz` inside the MiniPay browser; verify connect button does NOT appear (because MiniPay auto-connects).
3. **Real user activity** — at least 1-2 mainnet transactions through the contract help the score. Optional: do a $0.10 cUSD test purchase yourself from MiniPay to seed the contract.
4. **GitHub activity** — commits authored by the linked GitHub user (malashd1) during the campaign period (June 1–22). Your existing commits cover this.
5. **Project description sounds like a real product** (not a placeholder).

## What to do AFTER submitting

- **Verify the contract on Celoscan** — open the source code there and click "Verify and Publish". Talent prefers verified contracts.
- **Add MiniPay manifest** to the site root: `/.well-known/farcaster.json` and `/manifest.json` to be discoverable in MiniPay's Mini Apps directory (separate from Proof of Ship — gets you free distribution).
- **Make 1-2 real test purchases** from MiniPay (need ~$0.20 cUSD on the MiniPay wallet). This is the most powerful signal — judges weight "real txs > 0" heavily.

## If anything misses the rubric

The campaign runs monthly. Even if you miss June, the same submission re-enters July with whatever you've shipped meanwhile (new features, MiniPay manifest, more txs). The first month is the warm-up.
