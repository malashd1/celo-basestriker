# Deploy CeloStrikerPaymentRouter to Celo mainnet

Step-by-step. Total: ~15 minutes. No CLI, no Foundry — everything in browser.

## Prereqs (do these first)

### 1. Add Celo Mainnet to your wallet

In MetaMask (or Rabby): **Settings → Networks → Add a network**

| Field | Value |
|---|---|
| Network name | `Celo Mainnet` |
| RPC URL | `https://forno.celo.org` |
| Chain ID | `42220` |
| Currency symbol | `CELO` |
| Block explorer | `https://celoscan.io` |

Shortcut: visit https://chainlist.org/chain/42220, click "Connect Wallet" → "Add to MetaMask".

### 2. Get ~$2 in CELO for gas

Cheapest paths:

- **Coinbase Exchange**: Celo is listed, withdraw to your wallet address directly (no bridge). ~5 minutes.
- **Binance**: also listed.
- **Squid Router** (https://app.squidrouter.com): bridge USDC from Base → CELO in one tx if you don't want to use a centralized exchange.

You need maybe $0.50–$1 in CELO actually, but get $2 to leave room for mistakes.

---

## Deploy via Remix

### 3. Open Remix and load the contract

1. Go to https://remix.ethereum.org
2. Left sidebar: **File explorer** → drag-and-drop the file `CeloStrikerPaymentRouter.sol` from `contracts/talent-deploy/` into the workspace
3. Click the file to open it

### 4. Compile

1. Left sidebar: **Solidity compiler** (the round icon, second from top)
2. Compiler version: pick **0.8.20** or higher (any 0.8.x ≥ 0.8.20 works)
3. Click **"Compile CeloStrikerPaymentRouter.sol"** — should turn green with no errors

### 5. Connect MetaMask to Celo

1. Left sidebar: **Deploy & run transactions** (Ethereum logo, third from top)
2. Environment dropdown: select **"Injected Provider — MetaMask"**
3. MetaMask popup → connect your account
4. Verify in the **Account** field that the address you see is your deployer wallet
5. Verify the network in MetaMask is set to **Celo Mainnet** (top of MetaMask popup)
6. Verify in Remix: it should show "Custom (42220) network"

### 6. Deploy

1. Contract dropdown: select **`CeloStrikerPaymentRouter`**
2. Next to the orange **Deploy** button, expand the constructor args (small arrow ▼):
   - `_stable`: `0x765DE816845861e75A25fCA122bb6898B8B1282a` _(cUSD on Celo mainnet)_
   - `_treasury`: `0xe569A1f798D14809A076ea1c11cb13d698DFcE64` _(your existing BaseStriker treasury)_
3. Click **Deploy**
4. MetaMask popup → review → **Confirm**. Gas should be ~$0.10–0.30 in CELO.
5. Wait 5–10 seconds for the tx to confirm

### 7. Grab the deployed address

After confirmation, in Remix's "Deployed Contracts" panel at the bottom of the sidebar you'll see your contract. Click the copy icon next to the address.

**Save that address.** Send it to me — I'll wire it into the frontend.

You can verify the contract on Celoscan: https://celoscan.io/address/{your-address}

---

## Verify on Celoscan (optional but recommended)

Verified contracts get a green ✓ badge, source code is public, and Talent Protocol can index them.

1. Open your contract page on Celoscan
2. Click **Contract** tab → **Verify and Publish**
3. Compiler: pick exactly the version you used in Remix (e.g. `v0.8.20+commit.a1b79de6`)
4. License: **MIT**
5. Paste the full source from `CeloStrikerPaymentRouter.sol`
6. Constructor arguments: Remix can show you the encoded ABI args (in "Deployed contracts" → click on the deployed contract → "Constructor arguments" in details), or use https://abi.hashex.org to encode `(address, address)` with the cUSD + treasury addresses.

---

## If something goes wrong

| Symptom | Fix |
|---|---|
| Remix says "compiler not found" | Pick any **0.8.20+** version in the Solidity Compiler tab |
| MetaMask shows "Wrong network" in Remix | Switch MetaMask to Celo Mainnet manually |
| Deploy tx fails: "insufficient funds" | Need more CELO on the deployer wallet for gas |
| Deploy tx fails: "ZeroAddress" | One of the constructor args is `0x0` — double-check you pasted both addresses correctly |
| Tx pending forever | Celo block times are 5s, so >30s = stuck. Speed it up in MetaMask (resend with higher gas) |

---

## After deploy — send me

1. The deployed contract address (`0x…`)
2. The deploy tx hash (for verification audit trail)
3. Confirmation that Celoscan shows the contract code

Then I'll:
- Add `celo` network to `src/web3/config.ts` with this address
- Add MiniPay detection hook to `src/web3/wallet.ts`
- Set up the `celo.basestriker.xyz` server (Vite build + systemd + nginx + cert)
- Walk you through the Talent app submission for Proof of Ship
