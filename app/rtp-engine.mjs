export const TARGET_RTP = 0.96;
export const CORE_RTP = 0.92;
export const MAX_SETTLEMENT_MULTIPLIER = 99;
export const PUMPKIN_MIN_TARGET = 1.5;
export const DASH_DISTANCES = Object.freeze([1.5, 4, 6]);
const CURVE_START = 1.01;
const MAX_CURVE_EXPONENT = 64;

export const ROLE_MATH = Object.freeze({
  potato: { triggerChance: 0.3, payoutFactor: 1.5, maxMultiplier: 2 },
  chili: { triggerChance: 0.05 },
  pumpkin: { stages: 3, finalFactor: 1.5 },
  tomato: { triggerChance: 0.2, payoutFactor: 1.5, minTarget: 2, maxTarget: 5 },
  pepper: { triggerChance: 0.3, payoutFactor: 1.5, minMultiplier: 5 },
  mushroom: { triggerChance: 0.05, payoutFactor: 6, minMultiplier: 1.5 },
});

export const ROLE_NAMES = Object.freeze({
  potato: "馬鈴薯",
  chili: "辣椒",
  pumpkin: "南瓜",
  tomato: "番茄",
  pepper: "青椒",
  mushroom: "蘑菇",
});

const ROLE_ORDER = Object.freeze(Object.keys(ROLE_MATH));
const ROLE_RANK = Object.freeze(Object.fromEntries(ROLE_ORDER.map((roleId, index) => [roleId, index])));
const MANUAL_TARGET_BREAKPOINTS = Object.freeze([1.01, 1.49, 1.5, 1.99, 2, 2.99, 3, 3.99, 4, 4.99, 5, 6.99, 7, MAX_SETTLEMENT_MULTIPLIER]);

const REWARD_PROFILES = Object.freeze({
  dash: Object.freeze([{ factor: 1.5, weight: .8 }, { factor: 4, weight: .15 }, { factor: 6, weight: .05 }]),
});

export const DUO_RULES = Object.freeze({
  "potato|potato": { title: "雙薯早收", kind: "chance", chance: .3, factor: 1.5, max: 2, summary: "2×前 Cash Out：30%機率獎金×1.5" },
  "chili|chili": { title: "雙辣衝刺", kind: "dash", chance: .2, min: 1.5, summary: "1.5×後 Cash Out：20%再衝+1.5×／+4×／+6×" },
  "pumpkin|pumpkin": { title: "南瓜三連關", kind: "contract", stages: 3, factor: 4, targetMode: "selected", summary: "自選1.5×以上目標，連過3局：總獎金×4" },
  "tomato|tomato": { title: "雙茄收成", kind: "auto", chance: .2, factor: 1.5, autoMin: 2, autoMax: 5, summary: "各抽2–5×自動 Cash Out：20%機率獎金×1.5" },
  "pepper|pepper": { title: "雙椒追高", kind: "chance", chance: .1, factor: 4, min: 5, summary: "5×後 Cash Out：10%機率獎金×4" },
  "mushroom|mushroom": { title: "雙菇頭獎", kind: "chance", chance: .05, factor: 6, min: 1.5, summary: "1.5×後 Cash Out：5%機率獎金×6" },
  "potato|chili": { title: "早收衝刺", kind: "dash", chance: .1, max: 2, summary: "2×前 Cash Out：10%再衝+1.5×／+4×／+6×" },
  "potato|pumpkin": { title: "快速二連關", kind: "contract", stages: 2, factor: 1.5, targetMode: "fixed", target: 1.5, summary: "固定1.5×目標，連過2局：總獎金×1.5" },
  "potato|tomato": { title: "快速收成", kind: "auto", chance: .2, factor: 1.5, autoMin: 1.5, autoMax: 3, summary: "各抽1.5–3×自動 Cash Out：20%機率獎金×1.5" },
  "potato|pepper": { title: "穩健追高", kind: "chance", chance: .3, factor: 1.5, min: 4, summary: "4×後 Cash Out：30%機率獎金×1.5" },
  "potato|mushroom": { title: "早收頭獎", kind: "chance", chance: .05, factor: 6, min: 1.5, max: 2, summary: "1.5×以上、2×前 Cash Out：5%機率獎金×6" },
  "chili|pumpkin": { title: "辣味二連關", kind: "contract", stages: 2, factor: 4, targetMode: "selected", summary: "自選1.5×以上目標，連過2局：總獎金×4" },
  "chili|tomato": { title: "收成衝刺", kind: "dash", chance: .1, autoMin: 2, autoMax: 5, summary: "各抽2–5×自動 Cash Out：10%再衝+1.5×／+4×／+6×" },
  "chili|pepper": { title: "追高衝刺", kind: "dash", chance: .1, min: 4, summary: "4×後 Cash Out：10%再衝+1.5×／+4×／+6×" },
  "chili|mushroom": { title: "頭獎衝刺", kind: "dash", chance: .05, bonusDistance: 6, min: 1.5, summary: "1.5×後 Cash Out：5%再衝+6×" },
  "pumpkin|tomato": { title: "收成二連關", kind: "contract", stages: 2, factor: 4, targetMode: "auto", autoMin: 2, autoMax: 5, summary: "鎖定下注；各抽2–5×自動 Cash Out，連過2局：總獎金×4" },
  "pumpkin|pepper": { title: "追高二連關", kind: "contract", stages: 2, factor: 4, targetMode: "fixed", target: 5, summary: "固定5×目標，連過2局：總獎金×4" },
  "pumpkin|mushroom": { title: "蘑菇頭獎關", kind: "contract", stages: 2, chance: .1, factor: 4, baseFactor: 1, targetMode: "selected", summary: "自選1.5×以上目標，連過2局：10%獎金×4，未中照領" },
  "tomato|pepper": { title: "高倍收成", kind: "auto", chance: .2, factor: 1.5, autoMin: 4, autoMax: 7, summary: "各抽4–7×自動 Cash Out：20%機率獎金×1.5" },
  "tomato|mushroom": { title: "頭獎收成", kind: "auto", chance: .05, factor: 6, autoMin: 2, autoMax: 5, summary: "各抽2–5×自動 Cash Out：5%機率獎金×6" },
  "pepper|mushroom": { title: "極限頭獎", kind: "chance", chance: .05, factor: 6, min: 5, summary: "5×後 Cash Out：5%機率獎金×6" },
});

function clampUnit(value) {
  return Math.min(1 - Number.EPSILON, Math.max(0, Number.isFinite(value) ? value : .5));
}

function safeTarget(value) {
  return Math.max(1.01, Math.min(100 - Number.EPSILON, Number.isFinite(value) ? value : 2));
}

function roleRoll(rolls, roleId) {
  if (typeof rolls === "number") return clampUnit(rolls);
  return clampUnit(rolls?.[roleId]);
}

function normalizedRolePair(roleId, roundRoleIds) {
  const source = Array.isArray(roundRoleIds) && roundRoleIds.length ? roundRoleIds : [roleId];
  return source.filter((candidate) => Object.hasOwn(ROLE_MATH, candidate)).slice(0, 2);
}

function pairKey(roleIds) {
  return roleIds.slice(0, 2).sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b]).join("|");
}

function result(payout, notes = [], triggeredRoleIds = [], bonusDistance = 0) {
  return { payout: Math.max(0, payout), note: notes.join(" · "), outcome: triggeredRoleIds.length ? "bonus" : "neutral", triggeredRoleIds, bonusDistance };
}

function pickWeighted(profileName, unit) {
  const profile = REWARD_PROFILES[profileName] ?? REWARD_PROFILES.dash;
  let cursor = clampUnit(unit);
  for (const entry of profile) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.factor;
  }
  return profile.at(-1).factor;
}

function profileMean(profileName) {
  return (REWARD_PROFILES[profileName] ?? REWARD_PROFILES.dash).reduce((sum, entry) => sum + entry.factor * entry.weight, 0);
}

export function duoRuleFor(roleIds) {
  const pair = normalizedRolePair(roleIds?.[0], roleIds);
  return pair.length === 2 ? DUO_RULES[pairKey(pair)] ?? null : null;
}

export function duoRuntimeFromRolls(roleIds, rolls = {}) {
  const rule = duoRuleFor(roleIds);
  if (!rule) return null;
  const autoTarget = Number.isFinite(rule.autoMin)
    ? Math.round((rule.autoMin + clampUnit(rolls.target) * (rule.autoMax - rule.autoMin)) * 100) / 100
    : null;
  const baseFactor = rule.baseFactor ?? 1;
  const chanceContract = rule.kind === "contract" && Number.isFinite(rule.chance);
  const regularFactor = rule.factor ?? 1;
  const bonusDistance = rule.kind === "dash" ? rule.bonusDistance ?? pickWeighted("dash", rolls.dashPrize) : 0;
  return {
    key: pairKey(normalizedRolePair(roleIds[0], roleIds)),
    rule,
    factor: chanceContract && clampUnit(rolls.mushroom) >= rule.chance ? baseFactor : regularFactor,
    expectedFactor: chanceContract ? baseFactor + rule.chance * (regularFactor - baseFactor) : regularFactor,
    bonusDistance,
    expectedBonusDistance: rule.kind === "dash" ? rule.bonusDistance ?? profileMean("dash") : 0,
    autoTarget,
    contractTarget: rule.targetMode === "fixed" ? rule.target : rule.targetMode === "auto" ? autoTarget : null,
  };
}

export function duoRuntimeForTicket(roleIds, ticketRolls, ticketIndex = 0) {
  const sharedRuntime = duoRuntimeFromRolls(roleIds, ticketRolls?.[0]);
  if (!sharedRuntime || ticketIndex === 0) return sharedRuntime;
  const ticketRuntime = duoRuntimeFromRolls(roleIds, ticketRolls?.[ticketIndex]);
  if (!ticketRuntime) return sharedRuntime;
  if (sharedRuntime.autoTarget !== null) return ticketRuntime;
  if (sharedRuntime.rule.kind === "contract" && sharedRuntime.rule.targetMode === "auto") {
    return { ...sharedRuntime, autoTarget: ticketRuntime.autoTarget, contractTarget: ticketRuntime.contractTarget };
  }
  return sharedRuntime;
}

export function describeDuoPair(roleIds) {
  const rule = duoRuleFor(roleIds);
  if (!rule) return { key: "", title: "再選一注", badge: "融合預覽", shortSummary: "兩注下注後，能力融合成同一條規則", summary: "兩注下注後，兩張卡會顯示相同的融合能力", roleDetails: ["等待第二隻角色", "等待第二隻角色"] };
  const key = pairKey(normalizedRolePair(roleIds[0], roleIds));
  return { key, title: rule.title, badge: "融合能力", shortSummary: rule.summary, summary: rule.summary, roleDetails: [rule.summary, rule.summary] };
}

export function crashPointFromUnit(unit, baseRtp = CORE_RTP) {
  const rawPoint = Math.min(100, Math.max(1, Math.min(CORE_RTP, Math.max(Number.EPSILON, baseRtp)) / Math.max(Number.EPSILON, 1 - clampUnit(unit))));
  return Math.floor(rawPoint * 100 + 1e-9) / 100;
}

export function survivalAt(multiplier, baseRtp = CORE_RTP) {
  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier >= 100) return 0;
  return Math.min(1, Math.max(0, baseRtp) / multiplier);
}

export function defaultCrashCurve() {
  return { openingSurvival: CORE_RTP / CURVE_START, exponent: 1 };
}

function normalizeCrashCurve(curve) {
  const fallback = defaultCrashCurve();
  return {
    openingSurvival: Math.min(1, Math.max(Number.EPSILON, curve?.openingSurvival ?? fallback.openingSurvival)),
    exponent: Math.min(MAX_CURVE_EXPONENT, Math.max(0, curve?.exponent ?? fallback.exponent)),
  };
}

export function survivalAtCurve(multiplier, curve = defaultCrashCurve()) {
  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier >= 100) return 0;
  if (multiplier < CURVE_START) return 1;
  const { openingSurvival, exponent } = normalizeCrashCurve(curve);
  return Math.min(1, openingSurvival * (CURVE_START / multiplier) ** exponent);
}

export function crashPointFromCurveUnit(unit, curve = defaultCrashCurve()) {
  const { openingSurvival, exponent } = normalizeCrashCurve(curve);
  const roll = clampUnit(unit);
  if (roll < 1 - openingSurvival) return 1;
  if (exponent <= Number.EPSILON) return 100;
  const tailUnit = (roll - (1 - openingSurvival)) / openingSurvival;
  const rawPoint = Math.min(100, CURVE_START / Math.max(Number.EPSILON, 1 - tailUnit) ** (1 / exponent));
  return Math.floor(rawPoint * 100 + 1e-9) / 100;
}

export function createVisualNearMiss(cashAt, naturalEnd, unit) {
  const safeCashAt = safeTarget(cashAt);
  const safeNaturalEnd = safeTarget(naturalEnd);
  const canExtend = safeNaturalEnd <= safeCashAt * 1.12;
  const visualEnd = canExtend ? Math.min(99.99, Math.max(safeNaturalEnd, safeCashAt * (1.08 + clampUnit(unit) * .06))) : safeNaturalEnd;
  return { active: true, extended: visualEnd > safeNaturalEnd + .005, cashAt: safeCashAt, naturalEnd: safeNaturalEnd, visualEnd };
}

export function dashDistanceFromUnit(unit) {
  return pickWeighted("dash", unit);
}

export function createPumpkinContract(stake, target, options = {}) {
  const factor = Math.max(1, options.factor ?? ROLE_MATH.pumpkin.finalFactor);
  const contract = {
    active: true,
    stake: Math.max(0, stake),
    target: safeTarget(target),
    clears: 0,
    multipliers: [],
    stages: Math.max(1, Math.round(options.stages ?? ROLE_MATH.pumpkin.stages)),
    factor,
    expectedFactor: Math.max(1, options.expectedFactor ?? factor),
    ruleKey: options.ruleKey ?? "pumpkin",
    poolAssisted: false,
    poolReserved: 0,
  };
  return {
    ...contract,
    baseRtp: pumpkinContractBaseRtp(contract.target, contract),
    crashCurve: calibratePumpkinCrashCurve([contract]),
  };
}

export function settlePumpkinCashout(contract, multiplier) {
  const safeMultiplier = safeTarget(multiplier);
  if (!contract?.active || safeMultiplier < safeTarget(contract?.target)) return { accepted: false, complete: false, payout: 0, contract };
  const stages = Math.max(1, Math.round(contract.stages ?? ROLE_MATH.pumpkin.stages));
  const factor = Math.max(1, contract.factor ?? ROLE_MATH.pumpkin.finalFactor);
  const multipliers = [...(contract.multipliers ?? []), safeMultiplier].slice(0, stages);
  const complete = multipliers.length === stages;
  const payout = complete ? Math.max(0, contract.stake) * multipliers.reduce((sum, value) => sum + value, 0) * factor : 0;
  return {
    accepted: true,
    complete,
    payout,
    contract: complete
      ? { ...contract, active: false, stake: 0, clears: 0, multipliers: [] }
      : { ...contract, clears: multipliers.length, multipliers },
  };
}

export function settlePumpkinCrash(contract) {
  return { ...contract, active: false, stake: 0, target: safeTarget(contract?.target), clears: 0, multipliers: [] };
}

export function pumpkinContractBaseRtp(target, options = {}) {
  const stages = Math.max(1, Math.round(options.stages ?? ROLE_MATH.pumpkin.stages));
  const factor = Math.max(1, options.expectedFactor ?? options.factor ?? ROLE_MATH.pumpkin.finalFactor);
  return Math.min(CORE_RTP, (CORE_RTP * safeTarget(target) ** (stages - 1) / (stages * factor)) ** (1 / stages));
}

export function expectedPumpkinContractReturn(stake, target, baseRtp, options = {}) {
  const stages = Math.max(1, Math.round(options.stages ?? ROLE_MATH.pumpkin.stages));
  const factor = Math.max(1, options.expectedFactor ?? options.factor ?? ROLE_MATH.pumpkin.finalFactor);
  const safeContractTarget = safeTarget(target);
  return Math.max(0, stake) * stages * factor * safeContractTarget * survivalAt(safeContractTarget, baseRtp) ** stages;
}

export function calibratePumpkinContracts(contracts) {
  const active = contracts.filter((contract) => contract?.active && contract.stake > 0);
  if (!active.length) return TARGET_RTP;
  const targetReturn = CORE_RTP * active.reduce((sum, contract) => sum + contract.stake, 0);
  const sharedStages = Math.max(1, Math.round(active[0].stages ?? ROLE_MATH.pumpkin.stages));
  if (active.every((contract) => Math.max(1, Math.round(contract.stages ?? ROLE_MATH.pumpkin.stages)) === sharedStages)) {
    const coefficient = active.reduce((sum, contract) => {
      const target = safeTarget(contract.target);
      const factor = Math.max(1, contract.expectedFactor ?? contract.factor ?? ROLE_MATH.pumpkin.finalFactor);
      return sum + contract.stake * sharedStages * factor * target ** (1 - sharedStages);
    }, 0);
    return Math.min(TARGET_RTP, Math.max(Number.EPSILON, (targetReturn / coefficient) ** (1 / sharedStages)));
  }
  const expectedReturn = (baseRtp) => active.reduce((sum, contract) => sum + expectedPumpkinContractReturn(
    contract.stake,
    contract.target,
    baseRtp,
    { stages: contract.stages, factor: contract.factor, expectedFactor: contract.expectedFactor },
  ), 0);
  if (expectedReturn(CORE_RTP) <= targetReturn) return CORE_RTP;
  let low = Number.EPSILON;
  let high = CORE_RTP;
  for (let step = 0; step < 80; step += 1) {
    const midpoint = (low + high) / 2;
    if (expectedReturn(midpoint) < targetReturn) low = midpoint;
    else high = midpoint;
  }
  return (low + high) / 2;
}

export function expectedPumpkinContractReturnForCurve(stake, target, curve, options = {}) {
  const stages = Math.max(1, Math.round(options.stages ?? ROLE_MATH.pumpkin.stages));
  const factor = Math.max(1, options.expectedFactor ?? options.factor ?? ROLE_MATH.pumpkin.finalFactor);
  const safeContractTarget = safeTarget(target);
  return Math.max(0, stake) * stages * factor * safeContractTarget * survivalAtCurve(safeContractTarget, curve) ** stages;
}

export function calibratePumpkinCrashCurve(contracts) {
  const active = contracts.filter((contract) => contract?.active && contract.stake > 0);
  if (!active.length) return defaultCrashCurve();
  const totalStake = active.reduce((sum, contract) => sum + contract.stake, 0);
  return calibratedCurve(CORE_RTP * totalStake, (curve) => active.reduce((sum, contract) => sum + expectedPumpkinContractReturnForCurve(
    contract.stake,
    contract.target,
    curve,
    { stages: contract.stages, factor: contract.factor, expectedFactor: contract.expectedFactor },
  ), 0));
}

function ownTriggerChance(roleId, roundRoleIds) {
  void roundRoleIds;
  return ROLE_MATH[roleId]?.triggerChance ?? 0;
}

function duoConditionMet(rule, multiplier, runtime) {
  if (Number.isFinite(rule.min) && multiplier < rule.min) return false;
  if (Number.isFinite(rule.max) && multiplier >= rule.max) return false;
  void runtime;
  return true;
}

export function settleSuccessfulCashout(roleId, stake, multiplier, rolls, roundRoleIds = [roleId], options = {}) {
  const safeStake = Math.max(0, stake);
  const safeMultiplier = safeTarget(multiplier);
  const duoRuntime = options.duoRuntime ?? duoRuntimeFromRolls(roundRoleIds, rolls);
  if (duoRuntime && duoRuntime.rule.kind !== "contract") {
    const triggered = duoConditionMet(duoRuntime.rule, safeMultiplier, duoRuntime)
      && roleRoll(rolls, roleId) < duoRuntime.rule.chance;
    if (duoRuntime.rule.kind === "dash") {
      const bonusDistance = triggered ? duoRuntime.bonusDistance : 0;
      return result(
        safeStake * (safeMultiplier + bonusDistance),
        triggered ? [`${duoRuntime.rule.title}：再衝+${bonusDistance}×`] : [],
        triggered ? [roleId] : [],
        bonusDistance,
      );
    }
    return result(
      safeStake * safeMultiplier * (triggered ? duoRuntime.factor : 1),
      triggered ? [`${duoRuntime.rule.title}：獎金×${duoRuntime.factor}`] : [],
      triggered ? [roleId] : [],
    );
  }

  const notes = [];
  const triggeredRoleIds = [];
  let payout = safeStake * safeMultiplier;
  if (roleId === "potato" && safeMultiplier < ROLE_MATH.potato.maxMultiplier && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    payout *= ROLE_MATH.potato.payoutFactor;
    notes.push(`馬鈴薯：早收獎金×${ROLE_MATH.potato.payoutFactor}`);
    triggeredRoleIds.push(roleId);
  }
  let bonusDistance = 0;
  if (roleId === "chili" && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    bonusDistance = dashDistanceFromUnit(rolls?.dashPrize);
    payout = safeStake * (safeMultiplier + bonusDistance);
    notes.push(`辣椒：再衝+${bonusDistance}×`);
    triggeredRoleIds.push(roleId);
  }
  if (roleId === "tomato" && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    payout *= ROLE_MATH.tomato.payoutFactor;
    notes.push(`番茄：自動 Cash Out 獎金×${ROLE_MATH.tomato.payoutFactor}`);
    triggeredRoleIds.push(roleId);
  }
  if (roleId === "mushroom" && safeMultiplier >= ROLE_MATH.mushroom.minMultiplier && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    payout *= ROLE_MATH.mushroom.payoutFactor;
    notes.push(`蘑菇：JACKPOT獎金×${ROLE_MATH.mushroom.payoutFactor}`);
    triggeredRoleIds.push(roleId);
  }
  if (roleId === "pepper" && safeMultiplier >= ROLE_MATH.pepper.minMultiplier && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    payout *= ROLE_MATH.pepper.payoutFactor;
    notes.push(`青椒：追高獎金×${ROLE_MATH.pepper.payoutFactor}`);
    triggeredRoleIds.push(roleId);
  }
  return result(payout, notes, triggeredRoleIds, bonusDistance);
}

export function settleCrashRole(roleId, stake, crashPoint, rolls, roundRoleIds) {
  void [roleId, stake, crashPoint, rolls, roundRoleIds];
  return result(0);
}

function expectedFactor(roleId, multiplier, roundRoleIds, options = {}) {
  const pairRule = duoRuleFor(roundRoleIds);
  const runtime = options.duoRuntime ?? (pairRule ? {
    rule: pairRule,
    factor: options.duoFactor ?? pairRule.factor ?? 1,
    expectedBonusDistance: pairRule.bonusDistance ?? profileMean("dash"),
  } : null);
  if (runtime && runtime.rule.kind === "dash") return duoConditionMet(runtime.rule, multiplier, runtime) ? 1 + runtime.rule.chance * runtime.expectedBonusDistance / multiplier : 1;
  if (runtime && runtime.rule.kind !== "contract") return duoConditionMet(runtime.rule, multiplier, runtime) ? 1 + runtime.rule.chance * (runtime.factor - 1) : 1;
  if (roleId === "potato" && multiplier < ROLE_MATH.potato.maxMultiplier) return 1 + ROLE_MATH.potato.triggerChance * (ROLE_MATH.potato.payoutFactor - 1);
  if (roleId === "chili") return 1 + ROLE_MATH.chili.triggerChance * profileMean("dash") / multiplier;
  if (roleId === "tomato") return 1 + ROLE_MATH.tomato.triggerChance * (ROLE_MATH.tomato.payoutFactor - 1);
  if (roleId === "mushroom" && multiplier >= ROLE_MATH.mushroom.minMultiplier) return 1 + ROLE_MATH.mushroom.triggerChance * (ROLE_MATH.mushroom.payoutFactor - 1);
  if (roleId === "pepper" && multiplier >= ROLE_MATH.pepper.minMultiplier) return 1 + ROLE_MATH.pepper.triggerChance * (ROLE_MATH.pepper.payoutFactor - 1);
  return 1;
}

export function expectedSuccessfulPayout(roleId, stake, multiplier, roundRoleIds = [roleId], options = {}) {
  return Math.max(0, stake) * safeTarget(multiplier) * expectedFactor(roleId, safeTarget(multiplier), roundRoleIds, options);
}

export function expectedCrashPayout(roleId, stake, crashPoint, roundRoleIds) {
  void [roleId, stake, crashPoint, roundRoleIds];
  return 0;
}

function normalizeWagers(wagers) {
  return wagers.filter((wager) => wager && Object.hasOwn(ROLE_MATH, wager.roleId) && Number.isFinite(wager.stake) && wager.stake > 0).slice(0, 2).map((wager) => ({
    roleId: wager.roleId,
    stake: wager.stake,
    target: safeTarget(wager.target),
    manual: wager.manual === true,
    duoFactor: Number.isFinite(wager.duoFactor) ? Math.max(1, wager.duoFactor) : undefined,
  }));
}

function manualTargetCandidates(peerTargets = []) {
  return [...new Set([...MANUAL_TARGET_BREAKPOINTS, ...peerTargets.flatMap((target) => [target - .01, target, target + .01])]
    .map((target) => Math.min(MAX_SETTLEMENT_MULTIPLIER, Math.max(1.01, Math.round(target * 100) / 100))))];
}

function roundReturnParts(wagers) {
  const active = normalizeWagers(wagers);
  const roundRoleIds = active.map((wager) => wager.roleId);
  const totalStake = active.reduce((sum, wager) => sum + wager.stake, 0);
  const baseCoefficient = active.reduce((sum, wager) => sum + expectedSuccessfulPayout(wager.roleId, wager.stake, wager.target, roundRoleIds, {
    duoFactor: wager.duoFactor,
  }) / wager.target, 0);
  return { totalStake, constantReturn: 0, baseCoefficient };
}

function calibrationBaseRtp(wagers) {
  const active = normalizeWagers(wagers);
  const totalStake = active.reduce((sum, wager) => sum + wager.stake, 0);
  if (totalStake <= 0) return CORE_RTP;
  const fixedTargets = active.filter((wager) => !wager.manual).map((wager) => wager.target);
  const targetSets = active.map((wager) => wager.manual ? manualTargetCandidates(fixedTargets) : [wager.target]);
  let safeBaseRtp = CORE_RTP;
  for (const firstTarget of targetSets[0] ?? []) {
    for (const secondTarget of targetSets[1] ?? [null]) {
      const candidates = active.map((wager, index) => ({ ...wager, target: index === 0 ? firstTarget : secondTarget }));
      const { constantReturn, baseCoefficient } = roundReturnParts(candidates);
      if (baseCoefficient > 0) safeBaseRtp = Math.min(safeBaseRtp, (CORE_RTP * totalStake - constantReturn) / baseCoefficient);
    }
  }
  return Math.min(CORE_RTP, Math.max(Number.EPSILON, safeBaseRtp));
}

export function expectedRoundReturn(wagers, baseRtp) {
  const { constantReturn, baseCoefficient } = roundReturnParts(wagers);
  return constantReturn + Math.max(0, baseRtp) * baseCoefficient;
}

export function calibrateRoundBaseRtp(wagers) {
  return calibrationBaseRtp(wagers);
}

function roundReturnWithCurve(wagers, curve) {
  const active = normalizeWagers(wagers);
  const roundRoleIds = active.map((wager) => wager.roleId);
  return active.reduce((sum, wager) => sum + expectedSuccessfulPayout(wager.roleId, wager.stake, wager.target, roundRoleIds, {
    duoFactor: wager.duoFactor,
  }) * survivalAtCurve(wager.target, curve), 0);
}

function maximumRoundReturnWithCurve(wagers, curve) {
  const active = normalizeWagers(wagers);
  const fixedTargets = active.filter((wager) => !wager.manual).map((wager) => wager.target);
  const targetSets = active.map((wager) => wager.manual ? manualTargetCandidates(fixedTargets) : [wager.target]);
  let maximum = 0;
  for (const firstTarget of targetSets[0] ?? []) {
    for (const secondTarget of targetSets[1] ?? [null]) {
      maximum = Math.max(maximum, roundReturnWithCurve(active.map((wager, index) => ({
        ...wager,
        target: index === 0 ? firstTarget : secondTarget,
      })), curve));
    }
  }
  return maximum;
}

function calibratedCurve(targetReturn, expectedReturn) {
  const defaultOpening = defaultCrashCurve().openingSurvival;
  let openingSurvival = defaultOpening;
  if (expectedReturn({ openingSurvival, exponent: MAX_CURVE_EXPONENT }) > targetReturn + 1e-9) {
    let low = Number.EPSILON;
    let high = defaultOpening;
    for (let step = 0; step < 80; step += 1) {
      const midpoint = (low + high) / 2;
      if (expectedReturn({ openingSurvival: midpoint, exponent: MAX_CURVE_EXPONENT }) <= targetReturn) low = midpoint;
      else high = midpoint;
    }
    openingSurvival = low;
  }
  if (expectedReturn({ openingSurvival, exponent: 0 }) <= targetReturn) return { openingSurvival, exponent: 0 };
  let low = 0;
  let high = MAX_CURVE_EXPONENT;
  for (let step = 0; step < 80; step += 1) {
    const midpoint = (low + high) / 2;
    if (expectedReturn({ openingSurvival, exponent: midpoint }) > targetReturn) low = midpoint;
    else high = midpoint;
  }
  return { openingSurvival, exponent: high };
}

export function expectedRoundReturnForCurve(wagers, curve) {
  return roundReturnWithCurve(wagers, curve);
}

export function calibrateRoundCrashCurve(wagers) {
  const active = normalizeWagers(wagers);
  const totalStake = active.reduce((sum, wager) => sum + wager.stake, 0);
  if (totalStake <= 0) return defaultCrashCurve();
  return calibratedCurve(CORE_RTP * totalStake, (curve) => maximumRoundReturnWithCurve(active, curve));
}
