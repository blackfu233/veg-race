export const TARGET_RTP = 0.96;
export const MAX_SETTLEMENT_MULTIPLIER = 99;
export const PEAPOD_THRESHOLDS = Object.freeze([2, 3, 4, 5]);

export const ROLE_MATH = Object.freeze({
  potato: { triggerChance: 0.28, resonanceChance: 0.5, payoutFactor: 2, maxMultiplier: 2 },
  chili: { triggerChance: 0.34, resonanceChance: 0.55, payoutFactor: 2, minMultiplier: 5 },
  pumpkin: { stages: 3, finalFactor: 3 },
  tomato: { triggerChance: 0.12, resonanceChance: 0.2, payoutFactor: 3, minTarget: 2, maxTarget: 5 },
  peapod: { triggerChance: 0.25, resonanceChance: 0.35, expectedPayoutFactor: 2.56 },
  mushroom: { triggerChance: 0.045, resonanceChance: 0.08, payoutFactor: 8 },
});

export const ROLE_NAMES = Object.freeze({
  potato: "馬鈴薯",
  chili: "辣椒",
  pumpkin: "南瓜",
  tomato: "番茄",
  peapod: "豌豆莢",
  mushroom: "蘑菇",
});

const ROLE_ORDER = Object.freeze(Object.keys(ROLE_MATH));
const ROLE_RANK = Object.freeze(Object.fromEntries(ROLE_ORDER.map((roleId, index) => [roleId, index])));
const MANUAL_TARGET_BREAKPOINTS = Object.freeze([1.01, 1.49, 1.5, 1.99, 2, 2.99, 3, 3.99, 4, 4.99, 5, 6.99, 7, MAX_SETTLEMENT_MULTIPLIER]);

const REWARD_PROFILES = Object.freeze({
  pea: Object.freeze([{ factor: 2, weight: .75 }, { factor: 3, weight: .17 }, { factor: 5, weight: .06 }, { factor: 10, weight: .015 }, { factor: 20, weight: .005 }]),
  peaMushroom: Object.freeze([{ factor: 8, weight: .7 }, { factor: 10, weight: .25 }, { factor: 20, weight: .05 }]),
  pumpkinPea: Object.freeze([{ factor: 5, weight: .65 }, { factor: 8, weight: .25 }, { factor: 10, weight: .08 }, { factor: 20, weight: .02 }]),
});

export const DUO_RULES = Object.freeze({
  "potato|potato": { title: "雙薯早收", kind: "chance", chance: .5, factor: 2, max: 2, summary: "2×前成功：50%機率派彩×2" },
  "chili|chili": { title: "雙辣追高", kind: "chance", chance: .55, factor: 2, min: 5, summary: "5×後成功：55%機率派彩×2" },
  "pumpkin|pumpkin": { title: "南瓜三連關", kind: "contract", stages: 3, factor: 5, targetMode: "selected", summary: "鎖定BET；連續3回合達標：總派彩×5" },
  "tomato|tomato": { title: "雙茄收成", kind: "auto", chance: .2, factor: 3, autoMin: 2, autoMax: 5, summary: "兩注各抽2～5×自動Cash Out：20%機率派彩×3" },
  "peapod|peapod": { title: "雙豆驚喜", kind: "reveal", chance: .35, thresholds: [2, 3, 4, 5], prizeProfile: "pea", summary: "開跑揭曉2～5×門檻與倍獎；達標後35%機率觸發" },
  "mushroom|mushroom": { title: "雙菇頭獎", kind: "chance", chance: .08, factor: 8, summary: "成功Cash Out：8%機率派彩×8" },
  "potato|chili": { title: "辣味升級", kind: "chance", chance: .5, factor: 2, min: 5, summary: "5×後成功：50%機率派彩×2" },
  "potato|pumpkin": { title: "早收三連關", kind: "contract", stages: 3, factor: 4, targetMode: "selected", max: 2, summary: "鎖定BET；連續3回合在2×前成功：總派彩×4" },
  "potato|tomato": { title: "快速收成", kind: "auto", chance: .2, factor: 3, autoMin: 1.5, autoMax: 3, summary: "兩注各抽1.5～3×自動Cash Out：20%機率派彩×3" },
  "potato|peapod": { title: "早收驚喜", kind: "reveal", chance: .25, thresholds: [2, 3, 4], prizeProfile: "pea", summary: "開跑揭曉2～4×門檻與倍獎；達標後25%機率觸發" },
  "potato|mushroom": { title: "早收頭獎", kind: "chance", chance: .1, factor: 8, max: 2, summary: "2×前成功：10%機率派彩×8" },
  "chili|pumpkin": { title: "極限二連關", kind: "contract", stages: 2, factor: 8, targetMode: "fixed", target: 5, summary: "鎖定BET；手動在5×後Cash Out，連過2回合：總派彩×8" },
  "chili|tomato": { title: "高倍收成", kind: "auto", chance: .2, factor: 3, autoMin: 4, autoMax: 7, summary: "兩注各抽4～7×自動Cash Out：20%機率派彩×3" },
  "chili|peapod": { title: "辣豆驚喜", kind: "reveal", chance: .35, thresholds: [3, 4, 5], prizeProfile: "pea", summary: "開跑揭曉3～5×門檻與倍獎；達標後35%機率觸發" },
  "chili|mushroom": { title: "極限頭獎", kind: "chance", chance: .08, factor: 8, min: 5, summary: "5×後成功：8%機率派彩×8" },
  "pumpkin|tomato": { title: "收成二連關", kind: "contract", stages: 2, factor: 5, targetMode: "auto", autoMin: 2, autoMax: 5, summary: "鎖定BET；兩注各抽2～5×自動收成，連過2回合：總派彩×5" },
  "pumpkin|peapod": { title: "驚喜二連關", kind: "contract", stages: 2, targetMode: "reveal", thresholds: [2, 3, 4, 5], prizeProfile: "pumpkinPea", summary: "鎖定BET；連續2回合達到隨機門檻：總派彩×揭曉倍獎" },
  "pumpkin|mushroom": { title: "頭獎三連關", kind: "contract", stages: 3, factor: 8, targetMode: "selected", summary: "鎖定BET；連續3回合成功Cash Out：總派彩×8" },
  "tomato|peapod": { title: "驚喜自動收成", kind: "reveal-auto", chance: .25, thresholds: [2, 3, 4, 5], prizeProfile: "pea", summary: "兩注各抽2～5×門檻並自動Cash Out：25%機率觸發" },
  "tomato|mushroom": { title: "頭獎自動收成", kind: "auto", chance: .08, factor: 8, autoMin: 2, autoMax: 5, summary: "兩注各抽2～5×自動Cash Out：8%機率派彩×8" },
  "peapod|mushroom": { title: "豆菇大驚喜", kind: "reveal", chance: .25, thresholds: [2, 3, 4, 5], prizeProfile: "peaMushroom", summary: "開跑揭曉2～5×門檻與×8／×10／×20倍獎；達標後25%機率觸發" },
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

function hasResonance(roleId, roundRoleIds) {
  const pair = normalizedRolePair(roleId, roundRoleIds);
  return pair.length === 2 && pair[0] === roleId && pair[1] === roleId;
}

function result(payout, notes = [], triggeredRoleIds = []) {
  return { payout: Math.max(0, payout), note: notes.join(" · "), outcome: triggeredRoleIds.length ? "bonus" : "neutral", triggeredRoleIds };
}

function pickWeighted(profileName, unit) {
  const profile = REWARD_PROFILES[profileName] ?? REWARD_PROFILES.pea;
  let cursor = clampUnit(unit);
  for (const entry of profile) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.factor;
  }
  return profile.at(-1).factor;
}

function profileMean(profileName) {
  return (REWARD_PROFILES[profileName] ?? REWARD_PROFILES.pea).reduce((sum, entry) => sum + entry.factor * entry.weight, 0);
}

export function duoRuleFor(roleIds) {
  const pair = normalizedRolePair(roleIds?.[0], roleIds);
  return pair.length === 2 ? DUO_RULES[pairKey(pair)] ?? null : null;
}

export function duoRuntimeFromRolls(roleIds, rolls = {}) {
  const rule = duoRuleFor(roleIds);
  if (!rule) return null;
  const thresholds = rule.thresholds ?? PEAPOD_THRESHOLDS;
  const threshold = thresholds[Math.min(thresholds.length - 1, Math.floor(clampUnit(rolls.peapodTarget) * thresholds.length))];
  const autoTarget = Number.isFinite(rule.autoMin)
    ? Math.round((rule.autoMin + clampUnit(rolls.target) * (rule.autoMax - rule.autoMin)) * 100) / 100
    : null;
  return {
    key: pairKey(normalizedRolePair(roleIds[0], roleIds)),
    rule,
    threshold,
    factor: rule.prizeProfile ? pickWeighted(rule.prizeProfile, rolls.peapodPrize) : rule.factor ?? 1,
    autoTarget,
    contractTarget: rule.targetMode === "fixed" ? rule.target : rule.targetMode === "auto" ? autoTarget : rule.targetMode === "reveal" ? threshold : null,
  };
}

export function duoRuntimeForTicket(roleIds, ticketRolls, ticketIndex = 0) {
  const sharedRuntime = duoRuntimeFromRolls(roleIds, ticketRolls?.[0]);
  if (!sharedRuntime || ticketIndex === 0) return sharedRuntime;
  const ticketRuntime = duoRuntimeFromRolls(roleIds, ticketRolls?.[ticketIndex]);
  if (!ticketRuntime) return sharedRuntime;
  if (sharedRuntime.rule.kind === "auto") return ticketRuntime;
  if (sharedRuntime.rule.kind === "reveal-auto") return { ...sharedRuntime, threshold: ticketRuntime.threshold };
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

export function crashPointFromUnit(unit, baseRtp = TARGET_RTP) {
  const rawPoint = Math.min(100, Math.max(1, Math.min(TARGET_RTP, Math.max(Number.EPSILON, baseRtp)) / Math.max(Number.EPSILON, 1 - clampUnit(unit))));
  return Math.floor(rawPoint * 100 + 1e-9) / 100;
}

export function survivalAt(multiplier, baseRtp = TARGET_RTP) {
  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier >= 100) return 0;
  return Math.min(1, Math.max(0, baseRtp) / multiplier);
}

export function createVisualNearMiss(cashAt, naturalEnd, unit) {
  const safeCashAt = safeTarget(cashAt);
  const safeNaturalEnd = safeTarget(naturalEnd);
  const canExtend = safeNaturalEnd <= safeCashAt * 1.12;
  const visualEnd = canExtend ? Math.min(99.99, Math.max(safeNaturalEnd, safeCashAt * (1.08 + clampUnit(unit) * .06))) : safeNaturalEnd;
  return { active: true, extended: visualEnd > safeNaturalEnd + .005, cashAt: safeCashAt, naturalEnd: safeNaturalEnd, visualEnd };
}

export function peapodThresholdFromUnit(unit) {
  return PEAPOD_THRESHOLDS[Math.min(PEAPOD_THRESHOLDS.length - 1, Math.floor(clampUnit(unit) * PEAPOD_THRESHOLDS.length))];
}

export function peapodPayoutFactorFromUnit(unit) {
  return pickWeighted("pea", unit);
}

export function createPumpkinContract(stake, target, options = {}) {
  const contract = {
    active: true,
    stake: Math.max(0, stake),
    target: safeTarget(target),
    clears: 0,
    multipliers: [],
    stages: Math.max(1, Math.round(options.stages ?? ROLE_MATH.pumpkin.stages)),
    factor: Math.max(1, options.factor ?? ROLE_MATH.pumpkin.finalFactor),
    ruleKey: options.ruleKey ?? "pumpkin",
  };
  return { ...contract, baseRtp: pumpkinContractBaseRtp(contract.target, contract) };
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
  const factor = Math.max(1, options.factor ?? ROLE_MATH.pumpkin.finalFactor);
  return Math.min(TARGET_RTP, (TARGET_RTP * safeTarget(target) ** (stages - 1) / (stages * factor)) ** (1 / stages));
}

export function expectedPumpkinContractReturn(stake, target, baseRtp, options = {}) {
  const stages = Math.max(1, Math.round(options.stages ?? ROLE_MATH.pumpkin.stages));
  const factor = Math.max(1, options.factor ?? ROLE_MATH.pumpkin.finalFactor);
  const safeContractTarget = safeTarget(target);
  return Math.max(0, stake) * stages * factor * safeContractTarget * survivalAt(safeContractTarget, baseRtp) ** stages;
}

export function calibratePumpkinContracts(contracts) {
  const active = contracts.filter((contract) => contract?.active && contract.stake > 0);
  if (!active.length) return TARGET_RTP;
  const targetReturn = TARGET_RTP * active.reduce((sum, contract) => sum + contract.stake, 0);
  const sharedStages = Math.max(1, Math.round(active[0].stages ?? ROLE_MATH.pumpkin.stages));
  if (active.every((contract) => Math.max(1, Math.round(contract.stages ?? ROLE_MATH.pumpkin.stages)) === sharedStages)) {
    const coefficient = active.reduce((sum, contract) => {
      const target = safeTarget(contract.target);
      const factor = Math.max(1, contract.factor ?? ROLE_MATH.pumpkin.finalFactor);
      return sum + contract.stake * sharedStages * factor * target ** (1 - sharedStages);
    }, 0);
    return Math.min(TARGET_RTP, Math.max(Number.EPSILON, (targetReturn / coefficient) ** (1 / sharedStages)));
  }
  const expectedReturn = (baseRtp) => active.reduce((sum, contract) => sum + expectedPumpkinContractReturn(
    contract.stake,
    contract.target,
    baseRtp,
    { stages: contract.stages, factor: contract.factor },
  ), 0);
  if (expectedReturn(TARGET_RTP) <= targetReturn) return TARGET_RTP;
  let low = Number.EPSILON;
  let high = TARGET_RTP;
  for (let step = 0; step < 80; step += 1) {
    const midpoint = (low + high) / 2;
    if (expectedReturn(midpoint) < targetReturn) low = midpoint;
    else high = midpoint;
  }
  return (low + high) / 2;
}

function ownTriggerChance(roleId, roundRoleIds) {
  const resonance = hasResonance(roleId, roundRoleIds);
  if (roleId === "potato") return resonance ? ROLE_MATH.potato.resonanceChance : ROLE_MATH.potato.triggerChance;
  if (roleId === "chili") return resonance ? ROLE_MATH.chili.resonanceChance : ROLE_MATH.chili.triggerChance;
  if (roleId === "tomato") return resonance ? ROLE_MATH.tomato.resonanceChance : ROLE_MATH.tomato.triggerChance;
  if (roleId === "peapod") return resonance ? ROLE_MATH.peapod.resonanceChance : ROLE_MATH.peapod.triggerChance;
  if (roleId === "mushroom") return resonance ? ROLE_MATH.mushroom.resonanceChance : ROLE_MATH.mushroom.triggerChance;
  return 0;
}

function duoConditionMet(rule, multiplier, runtime) {
  if (Number.isFinite(rule.min) && multiplier < rule.min) return false;
  if (Number.isFinite(rule.max) && multiplier >= rule.max) return false;
  if (["reveal", "reveal-auto"].includes(rule.kind) && multiplier < runtime.threshold) return false;
  return true;
}

export function settleSuccessfulCashout(roleId, stake, multiplier, rolls, roundRoleIds = [roleId], options = {}) {
  const safeStake = Math.max(0, stake);
  const safeMultiplier = safeTarget(multiplier);
  const duoRuntime = options.duoRuntime ?? duoRuntimeFromRolls(roundRoleIds, rolls);
  if (duoRuntime && duoRuntime.rule.kind !== "contract") {
    const triggered = duoConditionMet(duoRuntime.rule, safeMultiplier, duoRuntime)
      && roleRoll(rolls, roleId) < duoRuntime.rule.chance;
    return result(
      safeStake * safeMultiplier * (triggered ? duoRuntime.factor : 1),
      triggered ? [`${duoRuntime.rule.title}：派彩×${duoRuntime.factor}`] : [],
      triggered ? [roleId] : [],
    );
  }

  const notes = [];
  const triggeredRoleIds = [];
  let payout = safeStake * safeMultiplier;
  if (roleId === "potato" && safeMultiplier < ROLE_MATH.potato.maxMultiplier && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    payout *= ROLE_MATH.potato.payoutFactor;
    notes.push("馬鈴薯：早收派彩×2");
    triggeredRoleIds.push(roleId);
  }
  if (roleId === "chili" && safeMultiplier >= ROLE_MATH.chili.minMultiplier && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    payout *= ROLE_MATH.chili.payoutFactor;
    notes.push("辣椒：高倍派彩×2");
    triggeredRoleIds.push(roleId);
  }
  if (roleId === "tomato" && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    payout *= ROLE_MATH.tomato.payoutFactor;
    notes.push("番茄：自動收成派彩×3");
    triggeredRoleIds.push(roleId);
  }
  if (roleId === "mushroom" && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    payout *= ROLE_MATH.mushroom.payoutFactor;
    notes.push("蘑菇：JACKPOT派彩×8");
    triggeredRoleIds.push(roleId);
  }
  const peapodThreshold = safeTarget(options.peapodThreshold ?? peapodThresholdFromUnit(rolls?.peapodTarget));
  if (roleId === "peapod" && safeMultiplier >= peapodThreshold && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    const factor = options.peapodFactor ?? peapodPayoutFactorFromUnit(rolls?.peapodPrize);
    payout *= factor;
    notes.push(`豌豆驚喜：派彩×${factor}`);
    triggeredRoleIds.push(roleId);
  }
  return result(payout, notes, triggeredRoleIds);
}

export function settleCrashRole(roleId, stake, crashPoint, rolls, roundRoleIds) {
  void [roleId, stake, crashPoint, rolls, roundRoleIds];
  return result(0);
}

function expectedFactor(roleId, multiplier, roundRoleIds, options = {}) {
  const pairRule = duoRuleFor(roundRoleIds);
  const runtime = options.duoRuntime ?? (pairRule ? {
    rule: pairRule,
    threshold: options.duoThreshold ?? 3,
    factor: options.duoFactor ?? pairRule.factor ?? (pairRule.prizeProfile ? profileMean(pairRule.prizeProfile) : 1),
  } : null);
  if (runtime && runtime.rule.kind !== "contract") return duoConditionMet(runtime.rule, multiplier, runtime) ? 1 + runtime.rule.chance * (runtime.factor - 1) : 1;
  if (roleId === "potato" && multiplier < ROLE_MATH.potato.maxMultiplier) return 1 + ROLE_MATH.potato.triggerChance * (ROLE_MATH.potato.payoutFactor - 1);
  if (roleId === "chili" && multiplier >= ROLE_MATH.chili.minMultiplier) return 1 + ROLE_MATH.chili.triggerChance * (ROLE_MATH.chili.payoutFactor - 1);
  if (roleId === "tomato") return 1 + ROLE_MATH.tomato.triggerChance * (ROLE_MATH.tomato.payoutFactor - 1);
  if (roleId === "mushroom") return 1 + ROLE_MATH.mushroom.triggerChance * (ROLE_MATH.mushroom.payoutFactor - 1);
  if (roleId === "peapod" && multiplier >= (options.peapodThreshold ?? 4)) return 1 + ROLE_MATH.peapod.triggerChance * ((options.peapodFactor ?? ROLE_MATH.peapod.expectedPayoutFactor) - 1);
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
    peapodThreshold: safeTarget(wager.peapodThreshold ?? 4),
    peapodFactor: Number.isFinite(wager.peapodFactor) ? Math.max(1, wager.peapodFactor) : undefined,
    duoThreshold: Number.isFinite(wager.duoThreshold) ? safeTarget(wager.duoThreshold) : undefined,
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
    peapodThreshold: wager.peapodThreshold,
    peapodFactor: wager.peapodFactor,
    duoThreshold: wager.duoThreshold,
    duoFactor: wager.duoFactor,
  }) / wager.target, 0);
  return { totalStake, constantReturn: 0, baseCoefficient };
}

function calibrationBaseRtp(wagers) {
  const active = normalizeWagers(wagers);
  const totalStake = active.reduce((sum, wager) => sum + wager.stake, 0);
  if (totalStake <= 0) return TARGET_RTP;
  const fixedTargets = active.filter((wager) => !wager.manual).map((wager) => wager.target);
  const targetSets = active.map((wager) => wager.manual ? manualTargetCandidates(fixedTargets) : [wager.target]);
  let safeBaseRtp = TARGET_RTP;
  for (const firstTarget of targetSets[0] ?? []) {
    for (const secondTarget of targetSets[1] ?? [null]) {
      const candidates = active.map((wager, index) => ({ ...wager, target: index === 0 ? firstTarget : secondTarget }));
      const { constantReturn, baseCoefficient } = roundReturnParts(candidates);
      if (baseCoefficient > 0) safeBaseRtp = Math.min(safeBaseRtp, (TARGET_RTP * totalStake - constantReturn) / baseCoefficient);
    }
  }
  return Math.min(TARGET_RTP, Math.max(Number.EPSILON, safeBaseRtp));
}

export function expectedRoundReturn(wagers, baseRtp) {
  const { constantReturn, baseCoefficient } = roundReturnParts(wagers);
  return constantReturn + Math.max(0, baseRtp) * baseCoefficient;
}

export function calibrateRoundBaseRtp(wagers) {
  return calibrationBaseRtp(wagers);
}
