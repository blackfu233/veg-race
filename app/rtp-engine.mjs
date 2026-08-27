export const TARGET_RTP = 0.96;
export const MAX_SETTLEMENT_MULTIPLIER = 99;

export const ROLE_MATH = Object.freeze({
  potato: { triggerChance: 0.28, highPayoutFactor: 2, maxMultiplier: 2 },
  chili: { triggerChance: 0.34, highPayoutFactor: 2, minMultiplier: 5 },
  pumpkin: { refundChance: 0.05 },
  tomato: { profitBonus: 0.12 },
  okra: { profitBonus: 0.25 },
  peapod: { profitBonus: 0.1 },
  corn: { triggerChance: 0.5, profitBonus: 0.5 },
  scallion: { triggerChance: 0.5, highProfitFactor: 1.4, expectedProfitBonus: 0.2 },
  mushroom: { triggerChance: 0.045, highPayoutFactor: 8 },
  peanut: { triggerChance: 0.5, highProfitFactor: 1.24, expectedProfitBonus: 0.12 },
});

function clampUnit(value) {
  return Math.min(1 - Number.EPSILON, Math.max(0, value));
}

function safeTarget(value) {
  return Math.max(1.01, Math.min(100 - Number.EPSILON, Number.isFinite(value) ? value : 2));
}

function result(payout, note = "", outcome = "neutral") {
  return { payout: Math.max(0, payout), note, outcome };
}

function profitBonusPayout(stake, multiplier, bonus) {
  const basePayout = stake * multiplier;
  const profit = Math.max(0, basePayout - stake);
  return basePayout + profit * bonus;
}

function profitBonusFactor(multiplier, bonus) {
  return profitBonusPayout(1, multiplier, bonus) / multiplier;
}

function normalizeWagers(wagers) {
  return wagers
    .filter((wager) => wager && Number.isFinite(wager.stake) && wager.stake > 0)
    .slice(0, 2)
    .map((wager) => ({ roleId: wager.roleId, stake: wager.stake, target: safeTarget(wager.target) }));
}

function expectedSuccessFactor(roleId, multiplier) {
  if (roleId === "potato" && multiplier < ROLE_MATH.potato.maxMultiplier) {
    return 1 + ROLE_MATH.potato.triggerChance * (ROLE_MATH.potato.highPayoutFactor - 1);
  }
  if (roleId === "chili" && multiplier >= ROLE_MATH.chili.minMultiplier) {
    return 1 + ROLE_MATH.chili.triggerChance * (ROLE_MATH.chili.highPayoutFactor - 1);
  }
  if (roleId === "tomato") return profitBonusFactor(multiplier, ROLE_MATH.tomato.profitBonus);
  if (roleId === "okra") return profitBonusFactor(multiplier, ROLE_MATH.okra.profitBonus);
  if (roleId === "peapod") return profitBonusFactor(multiplier, ROLE_MATH.peapod.profitBonus);
  if (roleId === "corn") {
    return profitBonusFactor(multiplier, ROLE_MATH.corn.triggerChance * ROLE_MATH.corn.profitBonus);
  }
  if (roleId === "mushroom") {
    return 1 + ROLE_MATH.mushroom.triggerChance * (ROLE_MATH.mushroom.highPayoutFactor - 1);
  }
  return 1;
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

export function settleSuccessfulCashout(roleId, stake, multiplier, roll) {
  const safeStake = Math.max(0, stake);
  const safeMultiplier = safeTarget(multiplier);
  const safeRoll = clampUnit(roll);
  const basePayout = safeStake * safeMultiplier;

  if (roleId === "potato" && safeMultiplier < ROLE_MATH.potato.maxMultiplier && safeRoll < ROLE_MATH.potato.triggerChance) {
    return result(basePayout * ROLE_MATH.potato.highPayoutFactor, "馬鈴薯：低倍整筆派彩雙倍！", "bonus");
  }
  if (roleId === "chili" && safeMultiplier >= ROLE_MATH.chili.minMultiplier && safeRoll < ROLE_MATH.chili.triggerChance) {
    return result(basePayout * ROLE_MATH.chili.highPayoutFactor, "辣椒：高倍整筆派彩雙倍！", "bonus");
  }
  if (roleId === "tomato") return result(profitBonusPayout(safeStake, safeMultiplier, ROLE_MATH.tomato.profitBonus), "番茄：成功利潤 +12%", "bonus");
  if (roleId === "okra") return result(profitBonusPayout(safeStake, safeMultiplier, ROLE_MATH.okra.profitBonus), "秋葵：成熟利潤 +25%", "bonus");
  if (roleId === "peapod") return result(profitBonusPayout(safeStake, safeMultiplier, ROLE_MATH.peapod.profitBonus), "豌豆莢：分批利潤 +10%", "bonus");
  if (roleId === "corn" && safeRoll < ROLE_MATH.corn.triggerChance) {
    return result(profitBonusPayout(safeStake, safeMultiplier, ROLE_MATH.corn.profitBonus), "玉米：金色收成，利潤 +50%！", "bonus");
  }
  if (roleId === "mushroom" && safeRoll < ROLE_MATH.mushroom.triggerChance) {
    return result(basePayout * ROLE_MATH.mushroom.highPayoutFactor, "蘑菇：JACKPOT 整筆派彩 ×8！", "bonus");
  }
  return result(basePayout);
}

export function settleCrashRole(roleId, remainingStake, roll) {
  const safeStake = Math.max(0, remainingStake);
  const safeRoll = clampUnit(roll);
  if (roleId === "pumpkin" && safeRoll < ROLE_MATH.pumpkin.refundChance) {
    return result(safeStake, "南瓜：爆掉全額返本！", "bonus");
  }
  return result(0);
}

export function pairProfitFactor(kind, roll) {
  const safeRoll = clampUnit(roll);
  const config = kind === "scallion" ? ROLE_MATH.scallion : ROLE_MATH.peanut;
  const hit = safeRoll < config.triggerChance;
  return {
    factor: hit ? config.highProfitFactor : 1,
    outcome: hit ? "bonus" : "neutral",
    note: hit
      ? kind === "scallion" ? "雙葉青蔥：成功注利潤 +40%！" : "花生：兩注利潤 +24%！"
      : "",
  };
}

export function expectedSuccessfulPayout(roleId, stake, multiplier) {
  const safeStake = Math.max(0, stake);
  const safeMultiplier = safeTarget(multiplier);
  return safeStake * safeMultiplier * expectedSuccessFactor(roleId, safeMultiplier);
}

export function expectedCrashPayout(roleId, stake) {
  const safeStake = Math.max(0, stake);
  return roleId === "pumpkin" ? safeStake * ROLE_MATH.pumpkin.refundChance : 0;
}

function roundReturnParts(wagers) {
  const active = normalizeWagers(wagers);
  const totalStake = active.reduce((sum, wager) => sum + wager.stake, 0);
  let crashFloor = 0;
  let baseCoefficient = 0;

  for (const wager of active) {
    const success = expectedSuccessfulPayout(wager.roleId, wager.stake, wager.target);
    const crash = expectedCrashPayout(wager.roleId, wager.stake);
    crashFloor += crash;
    baseCoefficient += (success - crash) / wager.target;
  }

  if (active.length === 2 && active.some((wager) => wager.roleId === "peanut")) {
    const bothWinTarget = Math.max(active[0].target, active[1].target);
    const expectedProfit = active.reduce((sum, wager) => (
      sum + Math.max(0, expectedSuccessfulPayout(wager.roleId, wager.stake, wager.target) - wager.stake)
    ), 0);
    baseCoefficient += ROLE_MATH.peanut.expectedProfitBonus * expectedProfit / bothWinTarget;
  }

  if (active.length === 2 && active.some((wager) => wager.roleId === "scallion")) {
    const ordered = [...active].sort((first, second) => first.target - second.target);
    if (ordered[0].target < ordered[1].target) {
      const winnerProfit = Math.max(0, expectedSuccessfulPayout(ordered[0].roleId, ordered[0].stake, ordered[0].target) - ordered[0].stake);
      const oneWinProbabilityCoefficient = 1 / ordered[0].target - 1 / ordered[1].target;
      baseCoefficient += ROLE_MATH.scallion.expectedProfitBonus * winnerProfit * oneWinProbabilityCoefficient;
    }
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
