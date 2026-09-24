import { createHash } from "node:crypto";
import {
  calibratePumpkinCrashCurve,
  calibrateRoundCrashCurve,
  CORE_RTP,
  crashPointFromCurveUnit,
  createPumpkinContract,
  describeDuoPair,
  duoRuntimeForTicket,
  peapodPayoutFactorFromUnit,
  peapodThresholdFromUnit,
  ROLE_NAMES,
  settlePumpkinCashout,
  settlePumpkinCrash,
  settleSuccessfulCashout,
  TARGET_RTP,
} from "../app/rtp-engine.mjs";
import { createRecoveryPool, planRecoveryRelease, RECOVERY_POOL_CONFIG, reserveRecoveryPayout, settleRecoveryPool, settleRecoveryReservation } from "../app/recovery-pool.mjs";

const roleIds = ["potato", "chili", "pumpkin", "tomato", "peapod", "mushroom"];
const abilityKeys = [...roleIds, "target", "peapodTarget", "peapodPrize"];
const filterKey = process.argv.find((value) => value.startsWith("--filter="))?.slice("--filter=".length) ?? null;
const seedTag = process.argv.find((value) => value.startsWith("--seed-tag="))?.slice("--seed-tag=".length) ?? "default";
const numericArgs = process.argv.slice(2).filter((value) => /^\d+(\.\d+)?$/.test(value));
const samples = Number.parseInt(numericArgs[0] ?? "100000", 10);

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

function rolls(rng) {
  return Object.fromEntries(abilityKeys.map((key) => [key, rng()]));
}

function forced(source) {
  return { ...source, potato: 0, chili: 0, tomato: 0, peapod: 0, mushroom: 0 };
}

function singleTarget(roleId, ticketRolls) {
  if (roleId === "potato") return 1.99;
  if (roleId === "chili") return 5;
  if (roleId === "tomato") return Math.round((2 + ticketRolls.target * 3) * 100) / 100;
  if (roleId === "peapod") return peapodThresholdFromUnit(ticketRolls.peapodTarget);
  return 2;
}

function targetFor(runtime) {
  if (runtime.rule.kind === "auto") return runtime.autoTarget;
  if (["reveal", "reveal-auto"].includes(runtime.rule.kind)) return runtime.threshold;
  if (Number.isFinite(runtime.rule.min)) return runtime.rule.min;
  if (Number.isFinite(runtime.rule.max)) return Math.round((runtime.rule.max - .01) * 100) / 100;
  return 2;
}

function regularSetup(selectedRoles, ticketRolls) {
  const runtimes = selectedRoles.length === 2 ? selectedRoles.map((_, index) => duoRuntimeForTicket(selectedRoles, ticketRolls, index)) : [null];
  const targets = selectedRoles.map((roleId, index) => runtimes[index] ? targetFor(runtimes[index]) : singleTarget(roleId, ticketRolls[index]));
  const wagers = selectedRoles.map((roleId, index) => ({
    roleId,
    stake: 1,
    target: targets[index],
    manual: false,
    peapodThreshold: roleId === "peapod" ? peapodThresholdFromUnit(ticketRolls[index].peapodTarget) : undefined,
    peapodFactor: roleId === "peapod" ? peapodPayoutFactorFromUnit(ticketRolls[index].peapodPrize) : undefined,
    duoThreshold: runtimes[index]?.threshold,
    duoFactor: runtimes[index]?.factor,
  }));
  return { runtimes, targets, wagers, crashCurve: calibrateRoundCrashCurve(wagers) };
}

function regularPayout(selectedRoles, setup, ticketRolls, crashPoint) {
  return selectedRoles.reduce((sum, roleId, index) => crashPoint + 1e-9 < setup.targets[index] ? sum : sum + settleSuccessfulCashout(
    roleId,
    1,
    setup.targets[index],
    ticketRolls[index],
    selectedRoles,
    {
      peapodThreshold: setup.wagers[index].peapodThreshold,
      peapodFactor: setup.wagers[index].peapodFactor,
      duoRuntime: setup.runtimes[index] ?? undefined,
    },
  ).payout, 0);
}

function affordableRegularPlan(plan, selectedRoles, setup, ticketRolls, coreCrash) {
  if (!plan.active) return plan;
  const payoutAt = (crashPoint, forceAbility) => regularPayout(
    selectedRoles,
    setup,
    forceAbility ? ticketRolls.map(forced) : ticketRolls,
    crashPoint,
  );
  const corePayout = payoutAt(coreCrash, false);
  const requiredPayout = (crashPoint, forceAbility) => Math.max(0, payoutAt(crashPoint, forceAbility) - corePayout);
  if (plan.mode === "ability") return requiredPayout(coreCrash, true) <= plan.available + 1e-9 ? plan : { ...plan, active: false, mode: null, crashFloor: 0 };
  if (requiredPayout(5, false) > plan.available + 1e-9) return { ...plan, active: false, mode: null, crashFloor: 0 };
  let low = 5;
  let high = plan.crashFloor;
  for (let step = 0; step < 20; step += 1) {
    const midpoint = (low + high) / 2;
    if (requiredPayout(midpoint, false) <= plan.available + 1e-9) low = midpoint;
    else high = midpoint;
  }
  return { ...plan, crashFloor: Math.floor(low * 100) / 100 };
}

function affordableContractPlan(plan, contracts) {
  if (!plan.active || contracts.some((contract) => contract.poolAssisted)) return plan.active ? { ...plan, active: false, mode: null, crashFloor: 0 } : plan;
  const requiredPayout = contracts.reduce((sum, contract) => {
    const remainingStages = Math.max(0, contract.stages - contract.clears);
    const finalPayout = contract.stake * (contract.multipliers.reduce((subtotal, value) => subtotal + value, 0) + remainingStages * contract.target) * contract.factor;
    return sum + finalPayout;
  }, 0);
  return requiredPayout <= plan.available + 1e-9
    ? { ...plan, mode: "crash", crashFloor: Math.max(5, ...contracts.map((contract) => contract.target)) }
    : { ...plan, active: false, mode: null, crashFloor: 0 };
}

function contractSetup(selectedRoles, ticketRolls) {
  if (selectedRoles.length === 1) return selectedRoles[0] === "pumpkin" ? [createPumpkinContract(1, 2)] : null;
  const runtimes = selectedRoles.map((_, index) => duoRuntimeForTicket(selectedRoles, ticketRolls, index));
  if (runtimes[0]?.rule.kind !== "contract") return null;
  return runtimes.map((runtime) => createPumpkinContract(1, runtime.contractTarget ?? 2, {
    stages: runtime.rule.stages,
    factor: runtime.factor,
    expectedFactor: runtime.expectedFactor,
    ruleKey: runtime.key,
  }));
}

function applyPool(pool, rng, { stake, corePayout, actualPayout, active, assisted }) {
  const next = settleRecoveryPool(pool, {
    coreStake: stake,
    corePayout,
    actualPayout,
    releaseActive: active,
    releasedAmount: assisted ? Math.max(0, actualPayout - corePayout) : 0,
    thresholdUnit: rng(),
    cooldownUnit: rng(),
    advanceCooldown: true,
  });
  return next;
}

function simulateRegular(selectedRoles, rng) {
  let pool = createRecoveryPool(rng());
  let totalPayout = 0;
  const stake = selectedRoles.length;
  for (let entry = 0; entry < samples; entry += 1) {
    const ticketRolls = selectedRoles.map(() => rolls(rng));
    const setup = regularSetup(selectedRoles, ticketRolls);
    const coreCrash = crashPointFromCurveUnit(rng(), setup.crashCurve);
    const plan = affordableRegularPlan(planRecoveryRelease(pool, stake, rng()), selectedRoles, setup, ticketRolls, coreCrash);
    const actualCrash = plan.active && plan.mode === "crash" ? Math.max(coreCrash, plan.crashFloor) : coreCrash;
    const actualRolls = plan.active && plan.mode === "ability" ? ticketRolls.map(forced) : ticketRolls;
    const corePayout = regularPayout(selectedRoles, setup, ticketRolls, coreCrash);
    const actualPayout = regularPayout(selectedRoles, setup, actualRolls, actualCrash);
    totalPayout += actualPayout;
    const assisted = plan.active && actualPayout > corePayout + 1e-9;
    pool = applyPool(pool, rng, { stake, corePayout, actualPayout, active: assisted, assisted });
  }
  return { rtp: totalPayout / (samples * stake), pool };
}

function simulateContracts(selectedRoles, rng) {
  let pool = createRecoveryPool(rng());
  let totalPayout = 0;
  for (let entry = 0; entry < samples; entry += 1) {
    const ticketRolls = selectedRoles.map(() => rolls(rng));
    const initial = contractSetup(selectedRoles, ticketRolls);
    const crashCurve = calibratePumpkinCrashCurve(initial);
    let actual = initial.map((contract) => ({ ...contract, crashCurve, assisted: false }));
    let core = initial.map((contract) => ({ ...contract, crashCurve }));
    while (actual.some((contract) => contract.active)) {
      const exposure = actual.filter((contract) => contract.active).length;
      const coreCrash = crashPointFromCurveUnit(rng(), crashCurve);
      const plan = affordableContractPlan(planRecoveryRelease(pool, exposure, rng()), actual.filter((contract) => contract.active));
      const actualCrash = plan.active ? Math.max(coreCrash, plan.crashFloor) : coreCrash;
      let settledStake = 0;
      let actualPayout = 0;
      let corePayout = 0;
      let releaseApplied = false;
      actual = actual.map((contract, index) => {
        if (!contract.active) return contract;
        const newlyAssisted = plan.active && !contract.poolAssisted && coreCrash + 1e-9 < contract.target && actualCrash + 1e-9 >= contract.target;
        let poolReserved = contract.poolReserved;
        if (newlyAssisted) {
          const remainingStages = Math.max(0, contract.stages - contract.clears);
          const finalPayout = contract.stake * (contract.multipliers.reduce((sum, value) => sum + value, 0) + remainingStages * contract.target) * contract.factor;
          const reservation = reserveRecoveryPayout(pool, finalPayout);
          if (!reservation.accepted) throw new Error("Approved contract release exceeded the recovery pool");
          pool = reservation.pool;
          poolReserved += reservation.amount;
          releaseApplied = true;
        }
        const nextAssisted = contract.poolAssisted || newlyAssisted;
        const actualResult = actualCrash + 1e-9 < contract.target
          ? { payout: 0, contract: settlePumpkinCrash(contract) }
          : settlePumpkinCashout({ ...contract, poolAssisted: nextAssisted, poolReserved }, contract.target);
        const coreContract = core[index];
        const coreResult = !coreContract.active || coreCrash + 1e-9 < coreContract.target
          ? { payout: 0, contract: settlePumpkinCrash(coreContract) }
          : settlePumpkinCashout(coreContract, coreContract.target);
        core[index] = coreResult.contract;
        if (!actualResult.contract.active) {
          settledStake += 1;
          actualPayout += actualResult.payout;
          corePayout += coreResult.payout;
          if (actualResult.contract.poolReserved > 0) pool = settleRecoveryReservation(pool, actualResult.contract.poolReserved, actualResult.payout > 0);
        }
        return actualResult.contract;
      });
      totalPayout += actualPayout;
      pool = applyPool(pool, rng, { stake: settledStake, corePayout, actualPayout, active: releaseApplied, assisted: false });
    }
  }
  return { rtp: totalPayout / (samples * selectedRoles.length), pool };
}

const configurations = roleIds.map((roleId) => [roleId]);
for (let first = 0; first < roleIds.length; first += 1) for (let second = first; second < roleIds.length; second += 1) configurations.push([roleIds[first], roleIds[second]]);
const selectedConfigurations = filterKey ? configurations.filter((roles) => [...roles].sort().join("|") === filterKey) : configurations;
function simulateConfiguration(selectedRoles) {
  const rng = mulberry32(seedFor(seedTag === "default" ? `recovery:${selectedRoles.join("|")}` : `recovery:${seedTag}:${selectedRoles.join("|")}`));
  const probeRolls = selectedRoles.map(() => rolls(rng));
  return contractSetup(selectedRoles, probeRolls) ? simulateContracts(selectedRoles, rng) : simulateRegular(selectedRoles, rng);
}

const results = selectedConfigurations.map((selectedRoles) => {
  const result = simulateConfiguration(selectedRoles);
  const label = selectedRoles.map((roleId) => ROLE_NAMES[roleId]).join("＋");
  const totalBet = samples * selectedRoles.length;
  const coreRtp = 1 - result.pool.totalCoreMargin / totalBet;
  const ledgerRtp = coreRtp + RECOVERY_POOL_CONFIG.contributionRate * (1 - coreRtp) - result.pool.reserve / totalBet;
  console.log(`${label.padEnd(13)} ${(result.rtp * 100).toFixed(3)}% · core ${(coreRtp * 100).toFixed(3)}% · pool ${(result.pool.reserve / selectedRoles.length).toFixed(2)}× · ledger ${((result.rtp - ledgerRtp) * 100).toFixed(4)}pp · releases ${result.pool.releaseCount}`);
  return { label, roles: selectedRoles, rtp: result.rtp, coreRtp, ledgerRtp, pool: result.pool, ability: selectedRoles.length === 2 ? describeDuoPair(selectedRoles).summary : "單角能力" };
});

const weightedRtp = results.reduce((sum, result) => sum + result.rtp, 0) / results.length;
const maxDeviation = Math.max(...results.map((result) => Math.abs(result.rtp - TARGET_RTP)));
const maxLedgerError = Math.max(...results.map((result) => Math.abs(result.rtp - result.ledgerRtp)));
const theoreticalRtp = CORE_RTP + RECOVERY_POOL_CONFIG.contributionRate * (1 - CORE_RTP);
console.log(JSON.stringify({ samplesPerConfiguration: samples, configurations: results.length, seedTag, meanRtp: weightedRtp, maxDeviation, maxLedgerError, theoreticalRtp, targetRtp: TARGET_RTP }, null, 2));
