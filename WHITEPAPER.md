# BaseStriker — Whitepaper

**Version 1.0 — May 2026**

## 1. Thesis

Arcade games created the modern entertainment industry. Quarters into cabinets became a $200B business. The on-chain analogue — open economies around skill-based play — has been promised since CryptoKitties but rarely delivered. Most "GameFi" titles failed two tests:

1. **The game wasn't fun**, so the only player was a yield farmer.
2. **The token economy was an unsustainable Ponzi**, so emission outran sinks and the token went to zero.

BaseStriker is built to pass both tests. It is, first, a tight Galaxian-style arcade game with 100 hand-tuned levels and the kind of feel that rewards practice. Second, its economy is engineered around durable sinks and a halving emission curve, on a chain (Base) that makes onboarding effectively free.

## 2. Why Base

- **No native token competition** — Base does not yet have its own gas token; ETH on Base is the asset. This means our `$STRK` does not fight against a "BASE" token narrative.
- **USDC liquidity** — USDC is the dominant stablecoin on Base, with deep Aerodrome liquidity. Stable pricing in the shop is straightforward.
- **Smart Wallet + paymaster** — Coinbase's Smart Wallet supports passkey auth and sponsored gas via paymaster, removing the two largest UX failures of past on-chain games: seed phrases and "buy gas first."
- **Aerodrome** — concentrated liquidity for the `$STRK / USDC` pair. The DEX is the canonical Base venue.
- **Distribution** — Coinbase actively promotes Base ecosystem launches. We optimise launch for the Smart Wallet experience.

## 3. The game

### 3.1 Setup

You pilot one of five ships. Enemies arrive in formations from the top of the screen, descend, and fire. You shoot up. Touch an enemy or a bullet, lose a life. Run out of lives, the run ends. Score and `$STRK` rewards depend on level cleared, accuracy, no-hit streak, and time.

### 3.2 Progression

- **100 levels**, 6 difficulty tiers:
  - 1–10 Tutorial, 11–30 Normal, 31–50 Hard, 51–70 Expert, 71–90 Master, 91–100 Legendary.
- Boss every 10th level.
- Levels unlock sequentially. Re-runs allowed; first-clear bonus is 2×.

### 3.3 Enemy roster (12 types)

| # | Enemy | Tier intro | Behaviour | Reward (base) |
|---:|---|---:|---|---:|
| 1 | Grunt | 1 | Stays in formation, fires straight | 10 |
| 2 | Drone | 1 | Formation, dives toward player periodically | 15 |
| 3 | Scout | 5 | Fast horizontal weaving, single shots | 25 |
| 4 | Sniper | 11 | Stationary edge, charged aimed shots | 40 |
| 5 | Bomber | 16 | Drops AoE explosive bombs | 55 |
| 6 | Splitter | 21 | On death, splits into 2 Grunts | 60 |
| 7 | Phantom | 26 | Phases in/out of visibility, dive attack | 75 |
| 8 | Swarmer | 31 | Spawns in groups of 6, kamikaze | 35 each |
| 9 | Turret | 36 | Heavy armor, 360° turret fire | 100 |
| 10 | Reaper | 51 | Tracks player with homing missile (1 per cycle) | 120 |
| 11 | Mirror | 61 | Reflects 1 bullet back per second | 150 |
| 12 | Voidling | 76 | Teleports near player, melee dash | 180 |
| Boss-A | Carrier | 10 | Spawns Drones + barrage | 1,000 |
| Boss-B | Hive | 20 | Spawns Swarmers + lasers | 1,500 |
| Boss-C | Warden | 30 | Shielded phases, 360° spread | 2,000 |
| Boss-D | Inquisitor | 40 | Aimed lasers + Phantom adds | 3,000 |
| Boss-E | Leviathan | 50 | Multi-segment serpent | 5,000 |
| Boss-F | Architect | 60 | Builds turret grid mid-fight | 7,500 |
| Boss-G | Devourer | 70 | Consumes bullets, regurgitates them | 10,000 |
| Boss-H | Echo | 80 | Mirrors the player's ship and weapon | 15,000 |
| Boss-I | Cataclysm | 90 | Screen-wide bullet hell phases | 25,000 |
| Boss-J | The Sovereign | 100 | Composite of all prior mechanics | 100,000 + Legendary equip drop |

### 3.4 Ships (NFT, ERC-721)

| Tier | Ship | HP | Speed | Slots | Cost |
|---:|---|---:|---:|---:|---|
| 0 | Scout | 1 | 5 | 1 weapon | Free (default) |
| 1 | Striker | 2 | 5 | 1 weapon, 1 utility | 0.005 ETH / 5,000 STRK |
| 2 | Vanguard | 3 | 4 | 2 weapons, 1 utility | 0.015 ETH / 15,000 STRK |
| 3 | Phantom | 2 | 7 | 1 weapon, 2 utility | 0.04 ETH / 40,000 STRK |
| 4 | Titan | 5 | 3 | 2 weapons, 2 utility, 1 shield | 0.12 ETH / 120,000 STRK |

### 3.5 Equipment (NFT, ERC-1155)

Categories: weapons (single, double, spread, laser, plasma, homing), shields (basic, pulse, reactive, quantum), utility (bomb, slow-mo, magnet, score-x2, drone), cosmetics (skins, particles, soundtracks).

Equipment has 5 rarities: Common, Uncommon, Rare, Epic, Legendary. Drop rates are deterministic on chain (Chainlink VRF) — no opaque server RNG for valuable drops.

## 4. Token

See [TOKENOMICS.md](TOKENOMICS.md). Summary:

- 1B fixed supply.
- 40% to play-to-earn over 48 months, halving annually.
- 15% TGE community + airdrop, 15% liquidity, 12% team, 8% investors, 10% treasury.
- Sinks: equipment minting, continues, crafting, cosmetics — 50–100% burn rates.
- Buy-back-and-burn from shop revenue.

## 5. Architecture

### 5.1 Boundary

```
[ Player Browser ]
   │
   ├─ Game (Canvas, deterministic, seeded by chain epoch + wallet)
   ├─ Wallet (Smart Wallet via wagmi/viem)
   │
   ├──── HTTPS ────► [ Backend ]
   │                  • Replays run from seed + inputs, verifies score
   │                  • Signs EIP-712 attestation
   │                  • Maintains leaderboard
   │                  • Stripe webhook → ETH purchase on Base
   │
   └──── RPC ──────► [ Base mainnet ]
                      • StrikerToken (ERC-20)
                      • ShipNFT (ERC-721)
                      • EquipmentNFT (ERC-1155)
                      • GameRegistry (level unlocks, scores)
                      • PaymentRouter (ETH/USDC → mint)
                      • RewardsDistributor (claim with signed attestation)
                      • Treasury (BBB executor)
```

### 5.2 Determinism + anti-cheat

The game is **deterministic** given (seed, input stream). The seed is `keccak256(playerAddress, levelId, dailyEpoch)`. The client records input timestamps (60 Hz quantised). On run end:

1. Client POSTs `{ levelId, seed, inputs, claimedScore }` to backend.
2. Backend runs the same engine headlessly with the seed and inputs.
3. If `computedScore == claimedScore ± tolerance` and time is plausible, backend signs an EIP-712 message: `(player, level, score, nonce, expiry)`.
4. Player calls `RewardsDistributor.claim(score, nonce, expiry, signature)`. Contract verifies signature against trusted backend EOA, checks daily cap, mints `$STRK`.

This means: **the chain trusts the backend's verification, and the backend trusts only deterministic replay**. Cheating requires either (a) breaking the backend (private key compromise — protected by HSM / KMS), or (b) finding an input stream that produces a high score under the same engine — which is just being good at the game.

## 6. Monetisation paths

| Path | Asset | UX | Backend involvement |
|---|---|---|---|
| Crypto-native | ETH on Base | Connect wallet, click buy, sign | None |
| Crypto-native | USDC on Base | Connect wallet, approve + buy | None |
| Token-native | `$STRK` (15% discount) | Connect wallet, approve + buy | None |
| Fiat onramp | Stripe → ETH | Card payment, server-side mint | Stripe webhook → mint via PaymentRouter as relayer |
| Gift / promo code | Off-chain code | Code → server signs claim | Promo signer key, capped daily |

## 7. Risk register

| Risk | Mitigation |
|---|---|
| Backend signer compromise | Hardware KMS, multi-sig override to rotate signer, daily-cap-per-signer at contract level |
| Smart contract bug | Two independent audits before mainnet; bug bounty up to 10% of treasury |
| Bot farms | Smart Wallet passkey gate for claims > 500 STRK/week, per-IP rate limit, score attestation depends on replay |
| Token dump on TGE | Team + investor cliffs, liquidity LP locked 24mo, buyback funded from real shop revenue |
| Regulatory | Token marketed as utility only; no investment promises; team KYC; legal opinion from Base-friendly jurisdiction prior to TGE |
| Game gets boring | 100 levels is the launch content; new levels every quarter; community-designed levels in v2 |

## 8. Timeline (high-level)

| Quarter | Milestone |
|---|---|
| Q2 2026 | Internal alpha, full 100 levels playable, contracts on Sepolia |
| Q3 2026 | Closed beta with 500 players, audit #1, mainnet contracts (no rewards yet) |
| Q4 2026 | Public beta, airdrop announced, audit #2, Fjord LBP |
| Q1 2027 | TGE on Aerodrome, rewards live, full P2E |
| Q2 2027 | Governance (veSTRK), creator levels, mobile wrapper |

## 9. Team

To be added. Cap-table and individual identities disclosed at audit phase.

## 10. Disclaimer

`$STRK` is a utility token. No promises of price appreciation, ROI, or financial return are made by this paper, the team, or any affiliated party. Gameplay is provided as-is. Jurisdictions vary on the regulatory status of in-game tokens; players are responsible for compliance with their local law.
