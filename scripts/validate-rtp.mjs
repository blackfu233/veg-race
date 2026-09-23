import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  calibratePumpkinContracts,
  calibrateRoundBaseRtp,
  CORE_RTP,
  crashPointFromUnit,
  createPumpkinContract,
  describeDuoPair,
  duoRuntimeForTicket,
  expectedPumpkinContractReturn,
  expectedRoundReturn,
  peapodPayoutFactorFromUnit,
  peapodThresholdFromUnit,
  ROLE_NAMES,
  settlePumpkinCashout,
  settlePumpkinCrash,
  settleSuccessfulCashout,
  TARGET_RTP,
} from "../app/rtp-engine.mjs";

const roleIds = ["potato", "chili", "pumpkin", "tomato", "peapod", "mushroom"];
const abilityKeys = [...roleIds, "target", "peapodTarget", "peapodPrize"];
const sampleCount = Number.parseInt(process.argv[2] ?? "1000000", 10);
const outputPath = path.resolve(process.argv[3] ?? "outputs/rtp-core-all-combinations-v36.json");
const csvPath = outputPath.replace(/\.json$/i, ".csv");

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(label) {
  return Number.parseInt(createHash("sha256").update(label).digest("hex").slice(0, 8), 16);
}

function randomRolls(rng) {
  return Object.fromEntries(abilityKeys.map((key) => [key, rng()]));
}

function singleTarget(roleId, rolls) {
  if (roleId === "potato") return 1.99;
  if (roleId === "chili") return 5;
  if (roleId === "tomato") return Math.round((2 + rolls.target * 3) * 100) / 100;
  if (roleId === "peapod") return peapodThresholdFromUnit(rolls.peapodTarget);
  return 2;
}

function pairTarget(runtime) {
  if (runtime.rule.kind === "auto") return runtime.autoTarget;
  if (["reveal", "reveal-auto"].includes(runtime.rule.kind)) return runtime.threshold;
  if (Number.isFinite(runtime.rule.min)) return runtime.rule.min;
  if (Number.isFinite(runtime.rule.max)) return Math.round((runtime.rule.max - .01) * 100) / 100;
  return 2;
}

function wagerFor(roleId, target, runtime, rolls) {
  return {
    roleId,
    stake: 1,
    target,
    manual: runtime ? !["auto", "reveal-auto"].includes(runtime.rule.kind) : roleId !== "tomato",
    peapodThreshold: roleId === "peapod" ? peapodThresholdFromUnit(rolls.peapodTarget) : undefined,
    peapodFactor: roleId === "peapod" ? peapodPayoutFactorFromUnit(rolls.peapodPrize) : undefined,
    duoThreshold: runtime?.threshold,
    duoFactor: runtime?.factor,
  };
}

function cacheKey(wagers) {
  return wagers.map((wager) => [
    wager.roleId,
    wager.target,
    wager.manual ? 1 : 0,
    wager.peapodThreshold ?? "",
    wager.peapodFactor ?? "",
    wager.duoThreshold ?? "",
    wager.duoFactor ?? "",
  ].join(":" )).join("|");
}

function sampleRegular(roleIdsForRun, rollsByTicket, rng, baseCache) {
  const runtimes = roleIdsForRun.length === 2
    ? roleIdsForRun.map((_, index) => duoRuntimeForTicket(roleIdsForRun, rollsByTicket, index))
    : [null];
  const targets = roleIdsForRun.map((roleId, index) => runtimes[index]
    ? pairTarget(runtimes[index])
    : singleTarget(roleId, rollsByTicket[index]));
  const wagers = roleIdsForRun.map((roleId, index) => wagerFor(roleId, targets[index], runtimes[index], rollsByTicket[index]));
  const key = cacheKey(wagers);
  const baseRtp = baseCache.get(key) ?? calibrateRoundBaseRtp(wagers);
  baseCache.set(key, baseRtp);
  const crashPoint = crashPointFromUnit(rng(), baseRtp);
  const payout = wagers.reduce((sum, wager, index) => {
    if (crashPoint < wager.target) return sum;
    return sum + settleSuccessfulCashout(
      wager.roleId,
      wager.stake,
      wager.target,
      rollsByTicket[index],
      roleIdsForRun,
      {
        peapodThreshold: wager.peapodThreshold,
        peapodFactor: wager.peapodFactor,
        duoRuntime: runtimes[index] ?? undefined,
      },
    ).payout;
  }, 0);
  return { payout, expectedPayout: expectedRoundReturn(wagers, baseRtp), baseRtp, rounds: 1 };
}

function contractSetup(roleIdsForRun, rollsByTicket) {
  if (roleIdsForRun.length === 1) return roleIdsForRun[0] === "pumpkin" ? [createPumpkinContract(1, 2)] : null;
  const runtimes = roleIdsForRun.map((_, index) => duoRuntimeForTicket(roleIdsForRun, rollsByTicket, index));
  if (runtimes[0]?.rule.kind !== "contract") return null;
  return runtimes.map((runtime) => createPumpkinContract(1, runtime.contractTarget ?? 2, {
    stages: runtime.rule.stages,
    factor: runtime.factor,
    ruleKey: runtime.key,
  }));
}

function sampleContract(initialContracts, rng) {
  const baseRtp = calibratePumpkinContracts(initialContracts);
  let contracts = initialContracts.map((contract) => ({ ...contract, baseRtp }));
  const expectedPayout = contracts.reduce((sum, contract) => sum + expectedPumpkinContractReturn(
    contract.stake,
    contract.target,
    baseRtp,
    contract,
  ), 0);
  let payout = 0;
  let rounds = 0;
  while (contracts.some((contract) => contract.active)) {
    const crashPoint = crashPointFromUnit(rng(), baseRtp);
    rounds += 1;
    contracts = contracts.map((contract) => {
      if (!contract.active) return contract;
      if (crashPoint < contract.target) return settlePumpkinCrash(contract);
      const settlement = settlePumpkinCashout(contract, contract.target);
      payout += settlement.payout;
      return settlement.contract;
    });
  }
  return { payout, expectedPayout, baseRtp, rounds };
}

function combinations() {
  const items = roleIds.map((roleId) => ({ type: "single", roleIds: [roleId], label: ROLE_NAMES[roleId] }));
  for (let first = 0; first < roleIds.length; first += 1) {
    for (let second = first; second < roleIds.length; second += 1) {
      const pair = [roleIds[first], roleIds[second]];
      items.push({ type: "duo", roleIds: pair, label: `${ROLE_NAMES[pair[0]]}＋${ROLE_NAMES[pair[1]]}` });
    }
  }
  return items;
}

function simulateCombination(configuration) {
  const rng = mulberry32(seedFor(configuration.roleIds.join("|")));
  const baseCache = new Map();
  const stake = configuration.roleIds.length;
  let totalPayout = 0;
  let totalExpectedPayout = 0;
  let totalBaseRtp = 0;
  let totalRounds = 0;
  let nonzero = 0;
  let meanPayout = 0;
  let payoutM2 = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const rollsByTicket = configuration.roleIds.map(() => randomRolls(rng));
    const contracts = contractSetup(configuration.roleIds, rollsByTicket);
    const sample = contracts
      ? sampleContract(contracts, rng)
      : sampleRegular(configuration.roleIds, rollsByTicket, rng, baseCache);
    totalPayout += sample.payout;
    totalExpectedPayout += sample.expectedPayout;
    totalBaseRtp += sample.baseRtp;
    totalRounds += sample.rounds;
    if (sample.payout > 0) nonzero += 1;
    const delta = sample.payout - meanPayout;
    meanPayout += delta / (index + 1);
    payoutM2 += delta * (sample.payout - meanPayout);
  }

  const totalBet = sampleCount * stake;
  const rtp = totalPayout / totalBet;
  const analyticalRtp = totalExpectedPayout / totalBet;
  const standardError = Math.sqrt(payoutM2 / (sampleCount - 1) / sampleCount) / stake;
  const tolerance = 4 * standardError + 1e-9;
  const duoDescription = configuration.type === "duo" ? describeDuoPair(configuration.roleIds) : null;
  return {
    id: configuration.roleIds.join("+"),
    type: configuration.type,
    roles: configuration.roleIds,
    label: configuration.label,
    ability: duoDescription?.summary ?? "單角能力",
    samples: sampleCount,
    ticketCount: stake,
    totalBet,
    totalPayout,
    analyticalRtp,
    simulatedRtp: rtp,
    deviation: rtp - CORE_RTP,
    standardError,
    ci95Low: rtp - 1.96 * standardError,
    ci95High: rtp + 1.96 * standardError,
    withinFourStandardErrors: Math.abs(rtp - CORE_RTP) <= tolerance,
    nonzeroRate: nonzero / sampleCount,
    meanBaseRtp: totalBaseRtp / sampleCount,
    meanRounds: totalRounds / sampleCount,
  };
}

function csvCell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(results) {
  const headers = [
    "id", "type", "label", "ability", "samples", "ticket_count", "total_bet", "total_payout",
    "analytical_rtp_pct", "simulated_rtp_pct", "deviation_pp", "standard_error_pp", "ci95_low_pct",
    "ci95_high_pct", "within_4se", "nonzero_rate_pct", "mean_base_rtp_pct", "mean_rounds",
  ];
  const rows = results.map((result) => [
    result.id,
    result.type,
    result.label,
    result.ability,
    result.samples,
    result.ticketCount,
    result.totalBet,
    result.totalPayout,
    result.analyticalRtp * 100,
    result.simulatedRtp * 100,
    result.deviation * 100,
    result.standardError * 100,
    result.ci95Low * 100,
    result.ci95High * 100,
    result.withinFourStandardErrors,
    result.nonzeroRate * 100,
    result.meanBaseRtp * 100,
    result.meanRounds,
  ]);
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

if (!Number.isFinite(sampleCount) || sampleCount < 2) throw new Error("sampleCount must be an integer greater than 1");

const results = combinations().map((configuration) => {
  const result = simulateCombination(configuration);
  console.log(`${result.label.padEnd(13)} ${(result.simulatedRtp * 100).toFixed(3)}% · exact ${(result.analyticalRtp * 100).toFixed(6)}%`);
  return result;
});
const maxAnalyticalDeviation = Math.max(...results.map((result) => Math.abs(result.analyticalRtp - CORE_RTP)));
const sampledFailures = results.filter((result) => !result.withinFourStandardErrors);
const [engineSource, scriptSource] = await Promise.all([
  readFile(new URL("../app/rtp-engine.mjs", import.meta.url)),
  readFile(new URL(import.meta.url)),
]);
const report = {
  schema: "veggie-dash-rtp-validation/5",
  variant: "six-role-recovery-pool-v36-core",
  generatedAt: new Date().toISOString(),
  coreTargetRtp: CORE_RTP,
  longTermTargetRtp: TARGET_RTP,
  payoutConvention: "gross payout includes returned stake; contracts charge one locked stake only",
  sharedEvent: "two tickets share one crash point; tomato-linked targets are independently drawn per ticket",
  strategy: "ability-aligned fixed stop; manual policies cash at the ability threshold, auto policies use their committed target",
  stoppingRule: `${sampleCount.toLocaleString("en-US")} independent entries per configuration, fixed before execution`,
  coverage: { singleRoles: 6, unorderedDuoPairs: 21, totalConfigurations: results.length },
  acceptance: {
    analyticalTolerance: 1e-9,
    sampledTolerance: "absolute deviation <= 4 × Monte Carlo standard error",
    maxAnalyticalDeviation,
    sampledFailures: sampledFailures.map((result) => result.id),
    passed: maxAnalyticalDeviation <= 1e-9 && sampledFailures.length === 0,
  },
  identity: {
    hashAlgorithm: "sha256",
    engineHash: createHash("sha256").update(engineSource).digest("hex"),
    simulatorHash: createHash("sha256").update(scriptSource).digest("hex"),
    rngRevision: "mulberry32-per-configuration-v2",
  },
  caveats: [
    "Monte Carlo intervals use independent entry-level payout variance and a normal approximation.",
    "Manual cashout RTP is policy-specific; other manual stopping points are capped at, but can be below, the 92% core target.",
    "This validates the current demo model and is not regulatory certification.",
  ],
  results,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await Promise.all([
  writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`),
  writeFile(csvPath, toCsv(results)),
]);
console.log(JSON.stringify({ outputPath, csvPath, passed: report.acceptance.passed, maxAnalyticalDeviation, sampledFailures: report.acceptance.sampledFailures }, null, 2));
if (!report.acceptance.passed) process.exitCode = 1;
