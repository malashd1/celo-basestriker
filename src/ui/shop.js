// Shop — paid one-shot run upgrades.
//
//   BUY  → pick quantity, charge USDC × N, +N to INVENTORY
//   EQUIP→ move 1 from INVENTORY into the next-run state
//   TRY FREE → wallet-connected players get one free trial per item
//             (excluding Homing Rocket — it's the imba one)
//
// Inventory persists across runs and deaths; equipped state is reset on death
// (handled in Game.finalize).
import { walletAddress, connect, onAddressChange, currentNetwork } from '../web3/wallet';
import { payUsdc } from '../web3/payments';
import { NETWORKS } from '../web3/config';
/** Network-aware display price: multiplied by priceMultiplier (e.g. ×0.05 on Celo). */
function displayPrice(priceUsd) {
    return priceUsd * (NETWORKS[currentNetwork()].priceMultiplier ?? 1);
}
/** Symbol shown in shop UI — defaults to USDC, "cUSD" on Celo. */
function priceSymbol() {
    return NETWORKS[currentNetwork()].stableSymbol ?? 'USDC';
}
/** Format `${total} SYM` honouring fractional prices (Celo ×0.05 makes them small). */
function formatPrice(priceUsd) {
    const v = displayPrice(priceUsd);
    // Up to 2 decimals — "0.05", "0.10", "2.50". Drop trailing zeros for cleanliness.
    const text = v < 1 ? v.toFixed(2).replace(/\.?0+$/, '') : v.toString();
    return `${text} ${priceSymbol()}`;
}
import { addToInventory, removeFromInventory, countOf, onInventoryChange, hasTriedFree, markTriedFree, } from '../game/inventory';
const ITEMS = [
    { id: 'extra-life', name: 'Extra Life', desc: '+1 HP at start of next run', color: '#ff4860', usdc: 1 },
    { id: 'armor', name: 'Armor Plate', desc: '+1 hit absorbed before HP loss (stacks)', color: '#9ad0ff', usdc: 1 },
    { id: 'extra-bomb', name: '+1 Bomb', desc: 'Adds one screen-clearing bomb', color: '#ffd84d', usdc: 2 },
    { id: 'rocket', name: 'Hunter Rocket', desc: 'AoE explosion, 35 px. -30% fire rate.', color: '#ff8c1a', usdc: 2 },
    { id: 'homing-rocket', name: 'Homing Rocket', desc: 'AoE + auto-tracks enemies. -50% fire rate vs. rocket.', color: '#ff0044', usdc: 9, excludeFromTryFree: true },
    { id: 'wingman', name: 'Wingman Drone', desc: 'Second ship at your side, mirrors your fire (stacks 2×).', color: '#00d4ff', usdc: 2 },
];
export function renderShop(root, handlers, onClose) {
    root.innerHTML = '';
    root.classList.remove('hidden');
    const title = document.createElement('h2');
    title.textContent = 'SHOP';
    root.appendChild(title);
    const sub = document.createElement('div');
    sub.style.fontSize = '9px';
    sub.style.color = '#9a9ac0';
    sub.style.textAlign = 'center';
    sub.textContent = 'One-shot upgrades — last until you die';
    root.appendChild(sub);
    const hint = document.createElement('div');
    hint.style.fontSize = '8px';
    hint.style.color = '#9a9ac0';
    hint.style.textAlign = 'center';
    hint.textContent = 'Ships & weapons are in SETTINGS.';
    root.appendChild(hint);
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    root.appendChild(grid);
    const close = document.createElement('button');
    close.textContent = 'CLOSE';
    close.className = 'danger';
    close.onclick = () => {
        offWallet?.();
        root.classList.add('hidden');
        onClose();
    };
    root.appendChild(close);
    // Re-render the whole panel when the wallet (dis)connects so BUY buttons,
    // the wallet hint, and the TRY-FREE state all flip together.
    const offWallet = onAddressChange(() => {
        if (root.classList.contains('hidden'))
            return;
        offWallet?.();
        renderShop(root, handlers, onClose);
    });
    function equippedCount(id) {
        const inv = handlers.getInventory();
        switch (id) {
            case 'extra-life': return inv.extraLives;
            case 'armor': return inv.armor;
            case 'extra-bomb': return inv.bombs;
            case 'rocket': return inv.weaponMode === 'rocket' ? 1 : 0;
            case 'homing-rocket': return inv.weaponMode === 'homing-rocket' ? 1 : 0;
            case 'wingman': return inv.wingmen;
        }
    }
    for (const it of ITEMS)
        renderItem(it);
    function renderItem(it) {
        const card = document.createElement('div');
        card.className = 'item';
        grid.appendChild(card);
        // qty state (local to this card)
        let qty = 1;
        function refresh() {
            const inventory = countOf(it.id);
            const equipped = equippedCount(it.id);
            const total = qty * it.usdc;
            const walletConnected = !!walletAddress();
            const canTryFree = walletConnected && !it.excludeFromTryFree && !hasTriedFree(it.id);
            card.innerHTML = `
        <div class="name" style="color:${it.color}">${it.name.toUpperCase()}</div>
        <div class="stats">${it.desc}</div>
        <div style="font-size:8px;display:flex;justify-content:space-between;margin-top:4px">
          <span style="color:#4cff7a">EQUIPPED: ${equipped}</span>
          <span style="color:#9ad0ff">INVENTORY: ${inventory}</span>
        </div>
      `;
            // Quantity stepper row
            const qtyRow = document.createElement('div');
            qtyRow.style.display = 'flex';
            qtyRow.style.alignItems = 'center';
            qtyRow.style.gap = '4px';
            qtyRow.style.fontSize = '8px';
            qtyRow.style.marginTop = '4px';
            const minus = document.createElement('button');
            minus.textContent = '−';
            minus.style.minWidth = '0';
            minus.style.padding = '2px 8px';
            minus.onclick = () => { qty = Math.max(1, qty - 1); refresh(); };
            const qtyLabel = document.createElement('span');
            qtyLabel.style.minWidth = '24px';
            qtyLabel.style.textAlign = 'center';
            qtyLabel.style.color = '#fff';
            qtyLabel.textContent = `${qty}×`;
            const plus = document.createElement('button');
            plus.textContent = '+';
            plus.style.minWidth = '0';
            plus.style.padding = '2px 8px';
            plus.onclick = () => { qty = Math.min(99, qty + 1); refresh(); };
            const totalLabel = document.createElement('span');
            totalLabel.style.flex = '1';
            totalLabel.style.textAlign = 'right';
            totalLabel.style.color = it.color;
            totalLabel.textContent = formatPrice(total);
            qtyRow.appendChild(minus);
            qtyRow.appendChild(qtyLabel);
            qtyRow.appendChild(plus);
            qtyRow.appendChild(totalLabel);
            card.appendChild(qtyRow);
            // Action buttons row
            const actions = document.createElement('div');
            actions.className = 'prices';
            actions.style.marginTop = '4px';
            const buyBtn = document.createElement('button');
            if (!walletConnected) {
                // Hard gate: no wallet → no shop. Tapping the button kicks off the
                // wallet connect flow; the panel re-renders via `onAddressChange`.
                buyBtn.textContent = 'CONNECT WALLET TO BUY';
                buyBtn.style.color = '#ffd84d';
                buyBtn.style.borderColor = '#ffd84d';
                buyBtn.onclick = async () => {
                    buyBtn.disabled = true;
                    buyBtn.textContent = 'CONNECTING…';
                    // 25-second hard deadline — MetaMask popups can be hidden
                    // behind the wallet's permission prompt on Android, and the
                    // connect() promise can hang indefinitely. Without this timer
                    // the whole shop locks up and the CLOSE button looks broken.
                    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 25_000));
                    try {
                        await Promise.race([connect(), timeoutPromise]);
                    }
                    catch { /* user dismissed */ }
                    if (!walletAddress()) {
                        buyBtn.disabled = false;
                        buyBtn.textContent = 'CONNECT FROM MENU FIRST';
                        buyBtn.style.color = '#ff4860';
                        buyBtn.style.borderColor = '#ff4860';
                        setTimeout(refresh, 2500);
                    }
                };
            }
            else {
                buyBtn.textContent = `BUY ${formatPrice(total)}`;
                buyBtn.style.color = it.color;
                buyBtn.style.borderColor = it.color;
                buyBtn.onclick = async () => {
                    if (!walletAddress()) {
                        refresh();
                        return;
                    }
                    buyBtn.disabled = true;
                    const origLabel = buyBtn.textContent;
                    buyBtn.textContent = 'CONFIRM IN WALLET…';
                    try {
                        // 1. On-chain payment. Goes through PaymentRouter on Base mainnet
                        //    (emits ItemPaid event with the SKU = item id), falls back to
                        //    direct USDC.transfer if the router isn't configured for the
                        //    current network. Either way, `kind: 'tx'` means the payment
                        //    has been broadcast.
                        const outcome = await payUsdc(it.usdc, qty, it.id);
                        if (outcome.kind === 'no-wallet') {
                            refresh();
                            return;
                        }
                        if (outcome.kind === 'no-config') {
                            // Treasury / USDC env vars missing — no on-chain payment was
                            // attempted. Refuse to credit the boost. (Safety net; in
                            // prod both defaults are hardcoded so this shouldn't fire.)
                            throw new Error('Shop not configured — payment unavailable.');
                        }
                        // outcome.kind === 'tx' — payment confirmed on-chain.
                        buyBtn.textContent = 'CONFIRMING…';
                        console.log('[shop] usdc tx', outcome.hash);
                        // 2. Credit inventory + lifetime POINTS — ONLY after the
                        //    on-chain transfer is confirmed. No payment → no boost.
                        //    `onInventoryChange(refresh)` (set up at the bottom of
                        //    this component) fires immediately and rebuilds the card,
                        //    which resets the BUY button and bumps the inventory
                        //    counter — that's the existing, working feedback path.
                        addToInventory(it.id, qty);
                        handlers.charge(total);
                    }
                    catch (e) {
                        console.warn('[shop] buy failed', e);
                        const reason = String(e?.shortMessage ?? e?.message ?? e).slice(0, 60);
                        buyBtn.textContent = `FAILED: ${reason}`;
                        buyBtn.style.color = '#ff4860';
                        buyBtn.style.borderColor = '#ff4860';
                        setTimeout(() => { refresh(); }, 3000);
                        return;
                    }
                    finally {
                        buyBtn.disabled = false;
                    }
                };
            }
            actions.appendChild(buyBtn);
            const equipBtn = document.createElement('button');
            equipBtn.textContent = 'EQUIP';
            if (inventory > 0) {
                equipBtn.style.color = '#4cff7a';
                equipBtn.style.borderColor = '#4cff7a';
                equipBtn.onclick = () => {
                    if (handlers.equipOne(it.id))
                        removeFromInventory(it.id, 1);
                };
            }
            else {
                equipBtn.disabled = true;
                equipBtn.style.opacity = '0.4';
            }
            actions.appendChild(equipBtn);
            if (canTryFree) {
                const tryBtn = document.createElement('button');
                tryBtn.textContent = 'TRY FREE (×1)';
                tryBtn.style.color = '#9a9ac0';
                tryBtn.style.borderColor = '#9a9ac0';
                tryBtn.onclick = () => {
                    // TRY FREE always gives exactly one unit, regardless of the
                    // quantity stepper. Reset qty so the player doesn't get confused
                    // by the "+ + +" display still reading 3.
                    markTriedFree(it.id);
                    handlers.equipOne(it.id);
                    qty = 1;
                    refresh();
                };
                actions.appendChild(tryBtn);
            }
            card.appendChild(actions);
        }
        refresh();
        // Re-render on any inventory change (other cards modify the same store).
        const off = onInventoryChange(refresh);
        card.addEventListener('DOMNodeRemovedFromDocument', () => off());
    }
    // Wallet hint
    if (!walletAddress()) {
        const note = document.createElement('div');
        note.style.fontSize = '8px';
        note.style.color = '#9a9ac0';
        note.style.textAlign = 'center';
        note.style.marginTop = '4px';
        note.textContent = 'Connect a wallet to purchase items (+ unlock TRY FREE for first-time use).';
        root.insertBefore(note, close);
    }
}
