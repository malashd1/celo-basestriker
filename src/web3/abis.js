// Minimal ABIs the client uses. Generated from Foundry build is the source of truth in CI.
export const ERC20_ABI = [
    { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'o', type: 'address' }, { name: 's', type: 'address' }], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'v', type: 'uint256' }], outputs: [{ type: 'bool' }] },
    { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
    { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
    { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];
export const REWARDS_ABI = [
    {
        type: 'function', name: 'claim', stateMutability: 'nonpayable',
        inputs: [
            { name: 'levelId', type: 'uint16' },
            { name: 'score', type: 'uint64' },
            { name: 'amount', type: 'uint256' },
            { name: 'nonce', type: 'uint64' },
            { name: 'expiry', type: 'uint64' },
            { name: 'sig', type: 'bytes' },
        ],
        outputs: [],
    },
    {
        type: 'function', name: 'claimedToday', stateMutability: 'view',
        inputs: [{ name: 'p', type: 'address' }], outputs: [{ type: 'uint256' }],
    },
    { type: 'function', name: 'dailyCap', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'signer', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
    { type: 'event', name: 'Claimed', inputs: [
            { name: 'player', type: 'address', indexed: true },
            { name: 'levelId', type: 'uint16', indexed: false },
            { name: 'amount', type: 'uint256', indexed: false },
        ] },
];
export const PAYMENT_ABI = [
    { type: 'function', name: 'buyShipETH', stateMutability: 'payable', inputs: [{ name: 'tier', type: 'uint8' }], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'buyShipUSDC', stateMutability: 'nonpayable', inputs: [{ name: 'tier', type: 'uint8' }], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'buyShipSTRK', stateMutability: 'nonpayable', inputs: [{ name: 'tier', type: 'uint8' }], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'buyEquipmentETH', stateMutability: 'payable', inputs: [{ name: 'id', type: 'uint32' }], outputs: [] },
    { type: 'function', name: 'buyEquipmentUSDC', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint32' }], outputs: [] },
    { type: 'function', name: 'buyEquipmentSTRK', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint32' }], outputs: [] },
    { type: 'function', name: 'priceETH', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint32' }], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'priceUSDC', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint32' }], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'priceSTRK', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint32' }], outputs: [{ type: 'uint256' }] },
];
export const REGISTRY_ABI = [
    { type: 'function', name: 'highestLevelCleared', stateMutability: 'view', inputs: [{ name: 'p', type: 'address' }], outputs: [{ type: 'uint16' }] },
    { type: 'function', name: 'bestScore', stateMutability: 'view', inputs: [{ name: 'p', type: 'address' }, { name: 'lvl', type: 'uint16' }], outputs: [{ type: 'uint64' }] },
    { type: 'function', name: 'submitScore', stateMutability: 'nonpayable', inputs: [
            { name: 'lvl', type: 'uint16' },
            { name: 'score', type: 'uint64' },
            { name: 'nonce', type: 'uint64' },
            { name: 'expiry', type: 'uint64' },
            { name: 'sig', type: 'bytes' },
        ], outputs: [] },
];
