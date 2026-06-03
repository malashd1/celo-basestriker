// Frontend helpers: read balances, submit scores to backend, claim rewards on chain.
import { parseEther, formatUnits } from 'viem';
import { NETWORKS } from './config';
import { publicClient, walletClient, walletAddress, currentNetwork } from './wallet';
import { ERC20_ABI, PAYMENT_ABI, REGISTRY_ABI } from './abis';
function net() { return currentNetwork(); }
function cfg() { return NETWORKS[net()]; }
export async function getStrkBalance() {
    const a = walletAddress();
    if (!a)
        return 0n;
    const addr = cfg().contracts.StrikerToken;
    if (addr === '0x0000000000000000000000000000000000000000')
        return 0n;
    return (await publicClient().readContract({
        address: addr, abi: ERC20_ABI, functionName: 'balanceOf', args: [a],
    }));
}
export async function getUsdcBalance() {
    const a = walletAddress();
    if (!a)
        return 0n;
    return (await publicClient().readContract({
        address: cfg().contracts.USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [a],
    }));
}
export async function getEthBalance() {
    const a = walletAddress();
    if (!a)
        return 0n;
    return await publicClient().getBalance({ address: a });
}
export function fmtToken(v, decimals = 18, max = 4) {
    return Number(formatUnits(v, decimals)).toFixed(max);
}
export async function postRunToBackend(run) {
    const r = await fetch(`${cfg().backendUrl}/api/run/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(run),
    });
    if (!r.ok)
        throw new Error(`Backend rejected score: ${await r.text()}`);
    return (await r.json());
}
/**
 * Off-chain claim acknowledgement.
 *
 * The backend already recorded the run + minted lifetime POINTS in SQLite
 * when `postRunToBackend` returned this signed payload. There's no on-chain
 * RewardsDistributor contract for BaseStriker (we don't issue any token),
 * so this used to fire `writeContract` against the ZERO address which made
 * MetaMask pop a confusing "Send to 0x000..." dialog after every game-over.
 *
 * Returns the opaque signature as a fake "tx hash" so the call signature
 * (`Promise<0x${string}>`) stays compatible with older callers that just
 * log the value.
 */
export async function claimRewards(s) {
    // The signature isn't a real tx hash — its 0x-hex shape is good enough
    // for the `walletStatus` toast and any logs.
    return (s.signature ?? '0x0000000000000000000000000000000000000000000000000000000000000000');
}
/// Credit lifetime POINTS for a connected wallet (e.g. after a shop purchase).
/// Server tracks them in `points_total` for the cross-device leaderboard.
export async function creditPoints(amount) {
    const a = walletAddress();
    if (!a || !Number.isFinite(amount) || amount <= 0)
        return;
    try {
        await fetch(`${cfg().backendUrl}/api/points/credit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ player: a, amount: Math.floor(amount) }),
        });
    }
    catch (e) {
        console.warn('[points] credit failed', e);
    }
}
export async function fetchLeaderboard(levelId) {
    const url = `${cfg().backendUrl}/api/leaderboard${levelId ? `?level=${levelId}` : ''}`;
    const r = await fetch(url);
    if (!r.ok)
        return [];
    return r.json();
}
export async function buyShipETH(tier, priceEth) {
    const wc = walletClient();
    if (!wc)
        throw new Error('No wallet');
    const c = cfg();
    return await wc.writeContract({
        account: walletAddress(),
        chain: c.chain,
        address: c.contracts.PaymentRouter,
        abi: PAYMENT_ABI,
        functionName: 'buyShipETH',
        args: [tier],
        value: parseEther(priceEth.toString()),
    });
}
export async function buyShipSTRK(tier) {
    const wc = walletClient();
    if (!wc)
        throw new Error('No wallet');
    const c = cfg();
    return await wc.writeContract({
        account: walletAddress(),
        chain: c.chain,
        address: c.contracts.PaymentRouter,
        abi: PAYMENT_ABI,
        functionName: 'buyShipSTRK',
        args: [tier],
    });
}
export async function getHighestLevel() {
    const a = walletAddress();
    if (!a)
        return 0;
    const addr = cfg().contracts.GameRegistry;
    if (addr === '0x0000000000000000000000000000000000000000')
        return 0;
    const r = await publicClient().readContract({
        address: addr, abi: REGISTRY_ABI, functionName: 'highestLevelCleared', args: [a],
    });
    return Number(r);
}
