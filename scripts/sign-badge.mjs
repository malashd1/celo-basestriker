import { privateKeyToAccount } from 'viem/accounts';
import { encodePacked, keccak256 } from 'viem';

const SIGNER_KEY = process.env.SIGNER_KEY;
const PLAYER     = '0x2eCe7De4C870D8A0bE4653fD96751EaAb98C3564';
const WEEK_ID    = 1n;
const RANK       = 1;
const CHAIN_ID   = 8453n;
const CONTRACT   = '0xCf3d1eFd0f0862870d651AC9f40Ed65f76A41435';

const account = privateKeyToAccount(SIGNER_KEY);
console.log('expected signer:', '0x4aD73779955087673e089B29812e6c1451B8E17b');
console.log('actual signer:  ', account.address);

const digest = keccak256(
  encodePacked(
    ['address','uint64','uint32','uint256','address'],
    [PLAYER, WEEK_ID, RANK, CHAIN_ID, CONTRACT]
  )
);
console.log('digest:         ', digest);

const sig = await account.signMessage({ message: { raw: digest } });
console.log();
console.log('=== Mint params for Remix ===');
console.log('  weekId:', WEEK_ID.toString());
console.log('  rank:  ', RANK);
console.log('  sig:   ', sig);
console.log('  value: 100000000000000 wei (paste in Value field, units: Wei)');
