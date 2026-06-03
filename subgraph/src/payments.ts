import { BigInt } from "@graphprotocol/graph-ts";
import { ItemPurchased } from "../generated/PaymentRouter/PaymentRouter";
import { Purchase } from "../generated/schema";
import { loadPlayer, loadGlobal, loadDaily, eventId } from "./shared";

export function handleItemPurchased(event: ItemPurchased): void {
  let player = loadPlayer(event.params.buyer, event.block);
  let currency = event.params.currency;
  let amount = event.params.amount;

  if (currency == 0)      player.totalSpentEth = player.totalSpentEth.plus(amount);
  else if (currency == 1) player.totalSpentUsdc = player.totalSpentUsdc.plus(amount);
  else if (currency == 2) player.totalSpentStrk = player.totalSpentStrk.plus(amount);
  player.itemsPurchased = player.itemsPurchased + 1;
  player.save();

  let p = new Purchase(eventId(event));
  p.player = player.id;
  p.itemId = event.params.id.toI32();
  p.currency = currency;
  p.amount = amount;
  p.timestamp = event.block.timestamp;
  p.save();

  let g = loadGlobal();
  g.totalPurchases = g.totalPurchases + 1;
  // Half of STRK paid is burned by PaymentRouter — track on subgraph too.
  if (currency == 2) g.totalStrkBurned = g.totalStrkBurned.plus(amount.div(BigInt.fromI32(2)));
  g.save();

  let d = loadDaily(event.block);
  d.totalPurchases = d.totalPurchases + 1;
  if (currency == 0) d.totalEthRevenue = d.totalEthRevenue.plus(amount);
  if (currency == 1) d.totalUsdcRevenue = d.totalUsdcRevenue.plus(amount);
  d.save();
}
