import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  calibrateRoundBaseRtp,
  calibrateSupportRoundBaseRtp,
  crashPointFromUnit,
  createVisualNearMiss,
  expectedRoundReturn,
  expectedSupportRoundReturn,
  settleDuoLink,
  settleSupportLink,
  settleSuccessfulCashout,
  TARGET_RTP,
} from "../app/rtp-engine.mjs";

const roleIds = ["potato", "chili", "pumpkin", "tomato", "peapod", "mushroom"];
const mainRoleIds = ["potato", "chili", "pumpkin", "tomato"];
const supportIds = ["ketchup", "mayonnaise", "mustard", "wasabi"];
const targets = [1.2, 1.5, 1.99, 2, 3, 4, 4.99, 5, 6, 10, 25, 50, 99];
const sampledTargets = [1.5, 2, 3, 5, 10];
const stakePairs = [[1, 1], [1, 3], [3, 1], [10, 37]];
const samplesPerMode = Number.parseInt(process.argv[2] ?? "2000000", 10);
const outputPath = path.resolve(process.argv[3] ?? "outputs/rtp-validation-v16.json");

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
  let duoCases = 0;
  let supportCases = 0;
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
        duoCases += 1;
      }
    }
  }
  for (const roleId of mainRoleIds) for (const supportId of supportIds) {
    for (const mainTarget of targets) for (const supportTarget of targets) for (const [mainStake, supportStake] of stakePairs) {
      const mainWager = { roleId, stake: mainStake, target: mainTarget };
      const supportWager = { stake: supportStake, target: supportTarget };
      const baseRtp = calibrateSupportRoundBaseRtp(mainWager, supportWager, supportId);
      const rtp = expectedSupportRoundReturn(mainWager, supportWager, supportId, baseRtp) / (mainStake + supportStake);
      maxAbsDeviation = Math.max(maxAbsDeviation, Math.abs(rtp - TARGET_RTP));
      supportCases += 1;
    }
  }
  return { duoCases, supportCases, totalCases: duoCases + supportCases, maxAbsDeviation };
}

function buildDuoScenarios() {
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

function buildSupportScenarios() {
  const scenarios = [];
  for (const roleId of mainRoleIds) for (const supportId of supportIds) {
    for (let mainTargetIndex = 0; mainTargetIndex < sampledTargets.length; mainTargetIndex += 1) {
      for (const supportTarget of sampledTargets) {
        const mainTarget = roleId === "tomato" ? 2 + (mainTargetIndex % 4) : sampledTargets[mainTargetIndex];
        const mainWager = { roleId, stake: 2, target: mainTarget };
        const supportWager = { stake: 1, target: supportTarget };
        scenarios.push({ mainWager, supportWager, supportId, baseRtp: calibrateSupportRoundBaseRtp(mainWager, supportWager, supportId) });
      }
    }
  }
  return scenarios;
}

function simulateDuo(sampleCount) {
  const rng = mulberry32(0x4d554f31);
  const scenarios = buildDuoScenarios();
  let bet = 0;
  let payout = 0;
  let nearMissEligible = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const scenario = scenarios[index % scenarios.length];
    const crashPoint = crashPointFromUnit(rng(), scenario.baseRtp);
    const rolePair = scenario.wagers.map((wager) => wager.roleId);
    const tickets = scenario.wagers.map((wager) => {
      const won = wager.target < crashPoint;
      const cashPayout = won ? settleSuccessfulCashout(wager.roleId, wager.stake, wager.target, rng(), rolePair).payout : 0;
      return { roleId: wager.roleId, stake: wager.stake, cashAt: won ? wager.target : null, payout: cashPayout, status: won ? "cashed" : "lost", abilityRoll: rng() };
    });
    const link = settleDuoLink(tickets);
    const roundPayout = tickets[0].payout + tickets[1].payout + link.total;
    const allCashed = tickets.every((ticket) => ticket.status === "cashed");
    if (allCashed) {
      const lastCashAt = Math.max(tickets[0].cashAt, tickets[1].cashAt);
      if (createVisualNearMiss(lastCashAt, crashPoint, rng()).extended) nearMissEligible += 1;
    }
    bet += scenario.wagers[0].stake + scenario.wagers[1].stake;
    payout += roundPayout;
  }
  return { samples: sampleCount, bet, payout, rtp: payout / bet, nearMissEligible, economicPayoutChangedByNearMiss: false };
}

function simulateSupport(sampleCount) {
  const rng = mulberry32(0x53555031);
  const scenarios = buildSupportScenarios();
  let bet = 0;
  let payout = 0;
  let nearMissEligible = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const scenario = scenarios[index % scenarios.length];
    const crashPoint = crashPointFromUnit(rng(), scenario.baseRtp);
    const mainWon = scenario.mainWager.target < crashPoint;
    const supportWon = scenario.supportWager.target < crashPoint;
    const mainPayout = mainWon
      ? settleSuccessfulCashout(scenario.mainWager.roleId, scenario.mainWager.stake, scenario.mainWager.target, rng(), [scenario.mainWager.roleId]).payout
      : 0;
    const supportPayout = supportWon ? scenario.supportWager.stake * scenario.supportWager.target : 0;
    const tickets = [
      { roleId: scenario.mainWager.roleId, stake: scenario.mainWager.stake, cashAt: mainWon ? scenario.mainWager.target : null, payout: mainPayout, status: mainWon ? "cashed" : "lost", abilityRoll: rng() },
      { roleId: scenario.mainWager.roleId, stake: scenario.supportWager.stake, cashAt: supportWon ? scenario.supportWager.target : null, payout: supportPayout, status: supportWon ? "cashed" : "lost" },
    ];
    const support = settleSupportLink(tickets, scenario.supportId);
    const roundPayout = mainPayout + supportPayout + support.total;
    if (mainWon && supportWon) {
      const lastCashAt = Math.max(scenario.mainWager.target, scenario.supportWager.target);
      if (createVisualNearMiss(lastCashAt, crashPoint, rng()).extended) nearMissEligible += 1;
    }
    bet += scenario.mainWager.stake + scenario.supportWager.stake;
    payout += roundPayout;
  }
  return { samples: sampleCount, bet, payout, rtp: payout / bet, nearMissEligible, economicPayoutChangedByNearMiss: false };
}

if (!Number.isFinite(samplesPerMode) || samplesPerMode <= 0) throw new Error("samplesPerMode must be a positive integer");

const [engineSource, testSource] = await Promise.all([
  readFile(new URL("../app/rtp-engine.mjs", import.meta.url)),
  readFile(new URL("../tests/rendered-html.test.mjs", import.meta.url)),
]);
const report = {
  schema: "veggie-dash-rtp-validation/2",
  variant: "duo-profit-transfer-v16",
  targetRtp: TARGET_RTP,
  payoutConvention: "gross return includes stake",
  sharedEvent: "both tickets observe one crash point",
  configuredStrategyScope: "fixed pre-round strategy targets; manual target changes are outside this calibration claim",
  identity: {
    hashAlgorithm: "sha256",
    ruleAndTestHash: createHash("sha256").update(engineSource).update(testSource).digest("hex"),
    rngRevision: "mulberry32-validation-v1",
    seeds: ["0x4d554f31", "0x53555031"],
  },
  exact: exactValidation(),
  sampled: {
    duo: simulateDuo(samplesPerMode),
    support: simulateSupport(samplesPerMode),
  },
};
report.sampled.duo.absoluteDeviation = Math.abs(report.sampled.duo.rtp - TARGET_RTP);
report.sampled.support.absoluteDeviation = Math.abs(report.sampled.support.rtp - TARGET_RTP);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
