export const TARGET_RTP = 0.96;
export const MAX_SETTLEMENT_MULTIPLIER = 99;

export const ROLE_MATH = Object.freeze({
  potato: { triggerChance: 0.28, highPayoutFactor: 2, maxMultiplier: 2 },
  chili: { triggerChance: 0.34, highPayoutFactor: 2, minMultiplier: 5 },
  pumpkin: { refundChance: 0.05 },
  tomato: { triggerChance: 0.12, highPayoutFactor: 3, minTarget: 2, maxTarget: 5 },
  peapod: { firstCashoutPortion: 0.5 },
  mushroom: { triggerChance: 0.045, highPayoutFactor: 8 },
});

export const SHARED_ROLE_IDS = Object.freeze(["potato", "chili", "pumpkin", "mushroom"]);

function clampUnit(value) {
  return Math.min(1 - Number.EPSILON, Math.max(0, Number.isFinite(value) ? value : 0.5));
}

function safeTarget(value) {
  return Math.max(1.01, Math.min(100 - Number.EPSILON, Number.isFinite(value) ? value : 2));
}

function roleRoll(rolls, roleId) {
  if (typeof rolls === "number") return clampUnit(rolls);
  return clampUnit(rolls?.[roleId]);
}

function normalizedRoleIds(roleId, roundRoleIds) {
  const source = Array.isArray(roundRoleIds) && roundRoleIds.length ? roundRoleIds : [roleId];
  return [...new Set(source.filter((candidate) => Object.hasOwn(ROLE_MATH, candidate)))];
}

function result(payout, notes = [], triggeredRoleIds = []) {
  return {
    payout: Math.max(0, payout),
    note: notes.join(" · "),
    outcome: triggeredRoleIds.length ? "bonus" : "neutral",
    triggeredRoleIds,
  };
}

function normalizeWagers(wagers) {
  return wagers
    .filter((wager) => wager && Number.isFinite(wager.stake) && wager.stake > 0)
    .slice(0, 2)
    .map((wager) => ({ roleId: wager.roleId, stake: wager.stake, target: safeTarget(wager.target) }));
}

function expectedFactorForAbility(roleId, multiplier) {
  if (roleId === "potato" && multiplier < ROLE_MATH.potato.maxMultiplier) {
    return 1 + ROLE_MATH.potato.triggerChance * (ROLE_MATH.potato.highPayoutFactor - 1);
  }
  if (roleId === "chili" && multiplier >= ROLE_MATH.chili.minMultiplier) {
    return 1 + ROLE_MATH.chili.triggerChance * (ROLE_MATH.chili.highPayoutFactor - 1);
  }
  if (roleId === "mushroom") {
    return 1 + ROLE_MATH.mushroom.triggerChance * (ROLE_MATH.mushroom.highPayoutFactor - 1);
  }
  return 1;
}

function expectedSuccessFactor(roleId, multiplier, roundRoleIds) {
  const selected = normalizedRoleIds(roleId, roundRoleIds);
  let factor = 1;
  for (const sharedRoleId of SHARED_ROLE_IDS) {
    if (selected.includes(sharedRoleId)) factor *= expectedFactorForAbility(sharedRoleId, multiplier);
  }
  if (roleId === "tomato") {
    factor *= 1 + ROLE_MATH.tomato.triggerChance * (ROLE_MATH.tomato.highPayoutFactor - 1);
  }
  return factor;
}

export function crashPointFromUnit(unit, baseRtp = TARGET_RTP) {
  const safeUnit = clampUnit(unit);
  const safeBaseRtp = Math.min(TARGET_RTP, Math.max(0.01, baseRtp));
  return Math.min(100, Math.max(1, safeBaseRtp / Math.max(Number.EPSILON, 1 - safeUnit)));
}

export function survivalAt(multiplier, baseRtp = TARGET_RTP) {
  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier >= 100) return 0;
  return Math.min(1, Math.max(0, baseRtp) / multiplier);
}

export function settleSuccessfulCashout(roleId, stake, multiplier, rolls, roundRoleIds = [roleId]) {
  const safeStake = Math.max(0, stake);
  const safeMultiplier = safeTarget(multiplier);
  const selected = normalizedRoleIds(roleId, roundRoleIds);
  const notes = [];
  const triggeredRoleIds = [];
  let payout = safeStake * safeMultiplier;

  if (
    selected.includes("potato")
    && safeMultiplier < ROLE_MATH.potato.maxMultiplier
    && roleRoll(rolls, "potato") < ROLE_MATH.potato.triggerChance
  ) {
    payout *= ROLE_MATH.potato.highPayoutFactor;
    notes.push("馬鈴薯支援：早收整筆 ×2");
    triggeredRoleIds.push("potato");
  }
  if (
    selected.includes("chili")
    && safeMultiplier >= ROLE_MATH.chili.minMultiplier
    && roleRoll(rolls, "chili") < ROLE_MATH.chili.triggerChance
  ) {
    payout *= ROLE_MATH.chili.highPayoutFactor;
    notes.push("辣椒支援：高倍整筆 ×2");
    triggeredRoleIds.push("chili");
  }
  if (
    selected.includes("mushroom")
    && roleRoll(rolls, "mushroom") < ROLE_MATH.mushroom.triggerChance
  ) {
    payout *= ROLE_MATH.mushroom.highPayoutFactor;
    notes.push("蘑菇支援：JACKPOT ×8");
    triggeredRoleIds.push("mushroom");
  }
  if (roleId === "tomato" && roleRoll(rolls, "tomato") < ROLE_MATH.tomato.triggerChance) {
    payout *= ROLE_MATH.tomato.highPayoutFactor;
    notes.push("番茄：自動收成整筆 ×3");
    triggeredRoleIds.push("tomato");
  }
  return result(payout, notes, triggeredRoleIds);
}

export function settleCrashRole(roleId, remainingStake, rolls, roundRoleIds = [roleId]) {
  const safeStake = Math.max(0, remainingStake);
  const selected = normalizedRoleIds(roleId, roundRoleIds);
  if (selected.includes("pumpkin") && roleRoll(rolls, "pumpkin") < ROLE_MATH.pumpkin.refundChance) {
    return result(safeStake, ["南瓜支援：退回 100% 本金"], ["pumpkin"]);
  }
  return result(0);
}

export function expectedSuccessfulPayout(roleId, stake, multiplier, roundRoleIds = [roleId]) {
  const safeStake = Math.max(0, stake);
  const safeMultiplier = safeTarget(multiplier);
  return safeStake * safeMultiplier * expectedSuccessFactor(roleId, safeMultiplier, roundRoleIds);
}

export function expectedCrashPayout(roleId, stake, roundRoleIds = [roleId]) {
  const safeStake = Math.max(0, stake);
  return normalizedRoleIds(roleId, roundRoleIds).includes("pumpkin")
    ? safeStake * ROLE_MATH.pumpkin.refundChance
    : 0;
}

function roundReturnParts(wagers) {
  const active = normalizeWagers(wagers);
  const roundRoleIds = [...new Set(active.map((wager) => wager.roleId))];
  const totalStake = active.reduce((sum, wager) => sum + wager.stake, 0);
  let crashFloor = 0;
  let baseCoefficient = 0;

  for (const wager of active) {
    const success = expectedSuccessfulPayout(wager.roleId, wager.stake, wager.target, roundRoleIds);
    const crash = expectedCrashPayout(wager.roleId, wager.stake, roundRoleIds);
    crashFloor += crash;
    baseCoefficient += (success - crash) / wager.target;
  }

  return { totalStake, crashFloor, baseCoefficient };
}

export function expectedRoundReturn(wagers, baseRtp) {
  const { crashFloor, baseCoefficient } = roundReturnParts(wagers);
  return crashFloor + Math.max(0, baseRtp) * baseCoefficient;
}

export function calibrateRoundBaseRtp(wagers) {
  const { totalStake, crashFloor, baseCoefficient } = roundReturnParts(wagers);
  if (totalStake <= 0 || baseCoefficient <= 0) return TARGET_RTP;
  const required = (TARGET_RTP * totalStake - crashFloor) / baseCoefficient;
  return Math.min(TARGET_RTP, Math.max(0.01, required));
}
