import { BigInt } from "@graphprotocol/graph-ts";
import {
  ScoreSubmitted,
  LevelCleared,
} from "../generated/GameRegistry/GameRegistry";
import { BestScore, ScoreSubmission, LevelClear } from "../generated/schema";
import { loadPlayer, loadGlobal, eventId } from "./shared";

export function handleScoreSubmitted(event: ScoreSubmitted): void {
  let player = loadPlayer(event.params.player, event.block);
  let level = event.params.levelId;
  let score = event.params.score;

  player.totalScore = player.totalScore.plus(BigInt.fromU64(score));
  player.save();

  let bestId = player.id + "-" + level.toString();
  let best = BestScore.load(bestId);
  if (best == null) {
    best = new BestScore(bestId);
    best.player = player.id;
    best.level = level;
    best.score = BigInt.fromU64(score);
    best.updatedAt = event.block.timestamp;
  } else if (BigInt.fromU64(score).gt(best.score)) {
    best.score = BigInt.fromU64(score);
    best.updatedAt = event.block.timestamp;
  }
  best.save();

  let sub = new ScoreSubmission(eventId(event));
  sub.player = player.id;
  sub.level = level;
  sub.score = BigInt.fromU64(score);
  sub.timestamp = event.block.timestamp;
  sub.blockNumber = event.block.number;
  sub.save();

  let g = loadGlobal();
  g.totalScoreSubmissions = g.totalScoreSubmissions + 1;
  g.save();
}

export function handleLevelCleared(event: LevelCleared): void {
  let player = loadPlayer(event.params.player, event.block);
  let lvl = event.params.levelId;
  if (lvl > player.highestLevelCleared) player.highestLevelCleared = lvl;
  player.save();

  let lc = new LevelClear(eventId(event));
  lc.player = player.id;
  lc.level = lvl;
  lc.timestamp = event.block.timestamp;
  lc.save();
}
