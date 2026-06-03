// ── Player inventory ─────────────────────────────────────────────────
// Stack of purchased-but-not-yet-equipped items. EQUIP moves one unit out of
// inventory and into the live `Game.carried*` state for the next run.
//
// Backed by localStorage today; in production this mirrors onto the backend so
// inventory survives across devices once a wallet is connected.
const KEY = 'basestriker.inventory';
function load() {
    try {
        return JSON.parse(localStorage.getItem(KEY) ?? '{}');
    }
    catch {
        return {};
    }
}
function save(inv) {
    try {
        localStorage.setItem(KEY, JSON.stringify(inv));
    }
    catch { /* */ }
    for (const fn of listeners)
        fn();
}
const listeners = new Set();
export function onInventoryChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
export function getInventory() { return load(); }
export function countOf(id) { return load()[id] ?? 0; }
export function addToInventory(id, n) {
    if (!Number.isFinite(n) || n <= 0)
        return;
    const inv = load();
    inv[id] = (inv[id] ?? 0) + Math.floor(n);
    save(inv);
}
export function removeFromInventory(id, n = 1) {
    const inv = load();
    const have = inv[id] ?? 0;
    if (have < n)
        return false;
    inv[id] = have - n;
    if ((inv[id] ?? 0) <= 0)
        delete inv[id];
    save(inv);
    return true;
}
// ── First-time TRY FREE tracking ────────────────────────────────────
const TRIED_KEY = 'basestriker.triedFree';
export function hasTriedFree(id) {
    try {
        const arr = JSON.parse(localStorage.getItem(TRIED_KEY) ?? '[]');
        return arr.includes(id);
    }
    catch {
        return false;
    }
}
export function markTriedFree(id) {
    try {
        const arr = JSON.parse(localStorage.getItem(TRIED_KEY) ?? '[]');
        if (!arr.includes(id)) {
            arr.push(id);
            localStorage.setItem(TRIED_KEY, JSON.stringify(arr));
        }
    }
    catch { /* */ }
}
