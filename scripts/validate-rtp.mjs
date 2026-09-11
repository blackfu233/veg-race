import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  calibrateRoundBaseRtp,
  crashPointFromUnit,
  createVisualNearMiss,
  expectedRoundReturn,
  settleCrashRole,
  settleDuoLink,
  settleSuccessfulCashout,
  TARGET_RTP,
} from "../app/rtp-engine.mjs";

const roleIds = ["potato", "chili", "pumpkin", "tomato", "peapod", "mushroom"];
const targets = [1.2, 1.5, 1.99, 2, 3, 4, 4.99, 5, 6, 10, 25, 50, 99];
const sampledTargets = [1.5, 2, 3, 5, 10];
const stakePairs = [[1, 1], [1, 3], [3, 1], [10, 37]];
const sampleCount = Number.parseInt(process.argv[2] ?? "2000000", 10);
const outputPath = path.resolve(process.argv[3] ?? "outputs/rtp-validation-v23.json");

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function exactValidation() {
  let cases = 0;
  let maxAbsDeviation = 0;
  for (let first = 0; first < roleIds.length; first += 1) {
    for (let second = first; second < roleIds.length; second += 1) {
      for (const firstTarget of targets) for (const secondTarget of targets) for (const [firstStake, secondStake] of stakePairs) {
        const wagers = [
          { roleId: roleIds[first], stake: firstStake, target: firstTarget },
          { roleId: roleIds[second], stake: secondStake, target: secondTarget },
        ];
        const baseRtp = calibrateRoundBaseRtp(wagers);
        const rtp = expectedRoundReturn(wagers, baseRtp) / (firstStake + secondStake);
        maxAbsDeviation = Math.max(maxAbsDeviation, Math.abs(rtp - TARGET_RTP));
        cases += 1;
      }
    }
  }
  return { cases, maxAbsDeviation };
}

function buildScenarios() {
  const scenarios = [];
  for (let first = 0; first < roleIds.length; first += 1) for (let second = first; second < roleIds.length; second += 1) {
    for (let firstTargetIndex = 0; firstTargetIndex < sampledTargets.length; firstTargetIndex += 1) {
      for (let secondTargetIndex = 0; secondTargetIndex < sampledTargets.length; secondTargetIndex += 1) {
        const firstTarget = roleIds[first] === "tomato" ? 2 + (firstTargetIndex % 4) : sampledTargets[firstTargetIndex];
        const secondTarget = roleIds[second] === "tomato" ? 2 + (secondTargetIndex % 4) : sampledTargets[secondTargetIndex];
        const wagers = [
          { roleId: roleIds[first], stake: 1, target: firstTarget },
          { roleId: roleIds[second], stake: 2, target: secondTarget },
        ];
        scenarios.push({ wagers, baseRtp: calibrateRoundBaseRtp(wagers) });
      }
    }
  }
  return scenarios;
}

function simulate(samples) {
  const rng = mulberry32(0x4d554f31);
  const scenarios = buildScenarios();
  let bet = 0;
  let payout = 0;
  let nearMissEligible = 0;
  for (let index = 0; index < samples; index += 1) {
    const scenario = scenarios[index % scenarios.length];
    const crashPoint = crashPointFromUnit(rng(), scenario.baseRtp);
    const rolePair = scenario.wagers.map((wager) => wager.roleId);
    const tickets = scenario.wagers.map((wager) => {
      const won = wager.target <= crashPoint;
      const abilityRoll = rng();
      const cashPayout = won
        ? settleSuccessfulCashout(wager.roleId, wager.stake, wager.target, abilityRoll, rolePair).payout
        : settleCrashRole(wager.roleId, wager.stake, crashPoint, abilityRoll, rolePair).payout;
      return { roleId: wager.roleId, stake: wager.stake, cashAt: won ? wager.target : null, payout: cashPayout, status: won ? "cashed" : "lost", abilityRoll };
    });
    const link = settleDuoLink(tickets);
    payout += tickets[0].payout + tickets[1].payout + link.total;
    if (tickets.every((ticket) => ticket.status === "cashed")) {
      const lastCashAt = Math.max(tickets[0].cashAt, tickets[1].cashAt);
      if (createVisualNearMiss(lastCashAt, crashPoint, rng()).extended) nearMissEligible += 1;
    }
    bet += scenario.wagers[0].stake + scenario.wagers[1].stake;
  }
  return { samples, bet, payout, rtp: payout / bet, nearMissEligible, economicPayoutChangedByNearMiss: false };
}

if (!Number.isFinite(sampleCount) || sampleCount <= 0) throw new Error("sampleCount must be a positive integer");

const [engineSource, testSource] = await Promise.all([
  readFile(new URL("../app/rtp-engine.mjs", import.meta.url)),
  readFile(new URL("../tests/rendered-html.test.mjs", import.meta.url)),
]);
const sampled = simulate(sampleCount);
const report = {
  schema: "veggie-dash-rtp-validation/3",
  variant: "six-role-duo-v23",
  targetRtp: TARGET_RTP,
  payoutConvention: "gross return includes stake",
  sharedEvent: "both tickets observe one crash point",
  configuredStrategyScope: "fixed pre-round targets are exact; tested manual target strategies are capped at 96%",
  identity: {
    hashAlgorithm: "sha256",
    ruleAndTestHash: createHash("sha256").update(engineSource).update(testSource).digest("hex"),
    rngRevision: "mulberry32-validation-v1",
    seeds: ["0x4d554f31"],
  },
  exact: exactValidation(),
  sampled: { ...sampled, absoluteDeviation: Math.abs(sampled.rtp - TARGET_RTP) },
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
