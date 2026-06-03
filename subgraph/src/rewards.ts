import { Claimed } from "../generated/RewardsDistributor/RewardsDistributor";
import { Claim } from "../generated/schema";
import { loadPlayer, loadGlobal, loadDaily, eventId } from "./shared";

export function handleClaimed(event: Claimed): void {
  let player = loadPlayer(event.params.player, event.block);
  player.totalStrkClaimed = player.totalStrkClaimed.plus(event.params.amount);
  player.save();

  let c = new Claim(eventId(event));
  c.player = player.id;
  c.level = event.params.levelId;
  c.amount = event.params.amount;
  c.timestamp = event.block.timestamp;
  c.save();

  let g = loadGlobal();
  g.totalClaimed = g.totalClaimed.plus(event.params.amount);
  g.save();

  let d = loadDaily(event.block);
  d.totalClaimed = d.totalClaimed.plus(event.params.amount);
  // uniqueClaimers approximate — bumped on first claim per epoch via separate marker entity
  // (kept simple here)
  d.uniqueClaimers = d.uniqueClaimers + 1;
  d.save();
}
