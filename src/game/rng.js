// Deterministic RNG — Mulberry32. Used everywhere so backend can replay.
export class RNG {
    s;
    constructor(seed) {
        this.s = seed >>> 0;
    }
    next() {
        let t = (this.s += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(min, max) {
        return min + this.next() * (max - min);
    }
    int(min, max) {
        return Math.floor(this.range(min, max + 1));
    }
    pick(arr) {
        return arr[this.int(0, arr.length - 1)];
    }
    chance(p) { return this.next() < p; }
}
// Mix two 32-bit unsigned ints to a seed.
export function mixSeed(a, b) {
    let h = (a ^ b) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
}
export function hashString(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
