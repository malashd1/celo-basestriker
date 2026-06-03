import { BigInt, Address, ethereum } from "@graphprotocol/graph-ts";
import { Player, GlobalStats, DailyAggregate } from "../generated/schema";

export function loadPlayer(addr: Address, block: ethereum.Block): Player {
  let id = addr.toHexString();
  let p = Player.load(id);
  if (p == null) {
    p = new Player(id);
    p.highestLevelCleared = 0;
    p.totalScore = BigInt.zero();
    p.totalStrkClaimed = BigInt.zero();
    p.totalSpentEth = BigInt.zero();
    p.totalSpentUsdc = BigInt.zero();
    p.totalSpentStrk = BigInt.zero();
    p.itemsPurchased = 0;
    p.firstSeenAt = block.timestamp;
    // bump global player count
    let g = loadGlobal();
    g.totalPlayers = g.totalPlayers + 1;
    g.save();
  }
  p.lastSeenAt = block.timestamp;
  return p as Player;
}

export function loadGlobal(): GlobalStats {
  let id = "global";
  let g = GlobalStats.load(id);
  if (g == null) {
    g = new GlobalStats(id);
    g.totalPlayers = 0;
    g.totalScoreSubmissions = 0;
    g.totalClaimed = BigInt.zero();
    g.totalPurchases = 0;
    g.totalStrkBurned = BigInt.zero();
  }
  return g as GlobalStats;
}

export function loadDaily(block: ethereum.Block): DailyAggregate {
  let epoch = block.timestamp.toI32() / 86400;
  let id = epoch.toString();
  let d = DailyAggregate.load(id);
  if (d == null) {
    d = new DailyAggregate(id);
    d.epoch = epoch;
    d.totalClaimed = BigInt.zero();
    d.uniqueClaimers = 0;
    d.totalPurchases = 0;
    d.totalEthRevenue = BigInt.zero();
    d.totalUsdcRevenue = BigInt.zero();
  }
  return d as DailyAggregate;
}

export function eventId(event: ethereum.Event): string {
  return event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
}
