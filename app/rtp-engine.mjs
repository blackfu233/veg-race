export const TARGET_RTP = 0.96;
export const MAX_SETTLEMENT_MULTIPLIER = 99;

export const ROLE_MATH = Object.freeze({
  potato: { triggerChance: 0.28, resonanceChance: 0.5, payoutFactor: 2, maxMultiplier: 2 },
  chili: { triggerChance: 0.34, resonanceChance: 0.55, payoutFactor: 2, minMultiplier: 5 },
  pumpkin: { triggerChance: 0.05, resonanceChance: 0.1, refundFactor: 1 },
  tomato: { triggerChance: 0.12, resonanceChance: 0.2, payoutFactor: 3, minTarget: 2, maxTarget: 5 },
  peapod: { triggerChance: 0.2, resonanceChance: 0.35, escapeThreshold: 3, escapePayoutFactor: 2 },
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
const MANUAL_TARGET_BREAKPOINTS = Object.freeze([1.01, 1.99, 2, 2.99, 3, 4.99, 5, MAX_SETTLEMENT_MULTIPLIER]);

const MIXED_LINKS = Object.freeze({
  "potato|chili": { title: "兩端包夾", rate: 0.3, recipients: "both", shortSummary: "早收＋5×成功 → 雙方獲利＋30%", summary: "馬鈴薯在 2× 前成功、辣椒在 5× 後成功 → 兩注獲利＋30%" },
  "potato|pumpkin": { title: "早收護航", rate: 0.15, recipients: "both", shortSummary: "早收＋南瓜成功 → 雙方獲利＋15%", summary: "馬鈴薯在 2× 前成功、南瓜成功 → 兩注獲利＋15%" },
  "potato|tomato": { title: "早收等熟", rate: 0.15, recipients: "both", shortSummary: "早收＋番茄成功 → 雙方獲利＋15%", summary: "馬鈴薯在 2× 前成功、番茄自動收成成功 → 兩注獲利＋15%" },
  "potato|peapod": { title: "早收逃生", rate: 0.15, recipients: "both", shortSummary: "早收＋豌豆成功 → 雙方獲利＋15%", summary: "馬鈴薯在 2× 前成功、豌豆成功 → 兩注獲利＋15%" },
  "potato|mushroom": { title: "小注摸大獎", rate: 0.15, recipients: "both", shortSummary: "早收＋蘑菇成功 → 雙方獲利＋15%", summary: "馬鈴薯在 2× 前成功、蘑菇成功 → 兩注獲利＋15%" },
  "chili|pumpkin": { title: "辣味護航", rate: 0.25, recipients: "both", shortSummary: "辣椒5×＋南瓜成功 → 雙方獲利＋25%", summary: "辣椒在 5× 後成功、南瓜成功 → 兩注獲利＋25%" },
  "chili|tomato": { title: "命運追高", rate: 0.25, recipients: "both", shortSummary: "辣椒5×＋番茄成功 → 雙方獲利＋25%", summary: "辣椒在 5× 後成功、番茄自動收成成功 → 兩注獲利＋25%" },
  "chili|peapod": { title: "辣豆衝刺", rate: 0.25, recipients: "both", shortSummary: "辣椒5×＋豌豆成功 → 雙方獲利＋25%", summary: "辣椒在 5× 後成功、豌豆成功 → 兩注獲利＋25%" },
  "chili|mushroom": { title: "極限大獎", rate: 0.3, recipients: "both", shortSummary: "辣椒5×＋蘑菇成功 → 雙方獲利＋30%", summary: "辣椒在 5× 後成功、蘑菇成功 → 兩注獲利＋30%" },
  "pumpkin|tomato": { title: "安心收成", rate: 0.15, recipients: "both", shortSummary: "南瓜＋番茄成功 → 雙方獲利＋15%", summary: "南瓜成功、番茄自動收成成功 → 兩注獲利＋15%" },
  "pumpkin|peapod": { title: "雙重保險", rate: 0.15, recipients: "both", shortSummary: "南瓜＋豌豆成功 → 雙方獲利＋15%", summary: "南瓜與豌豆都成功 Cash Out → 兩注獲利＋15%" },
  "pumpkin|mushroom": { title: "幸運護航", rate: 0.15, recipients: "both", shortSummary: "南瓜＋蘑菇成功 → 雙方獲利＋15%", summary: "南瓜與蘑菇都成功 Cash Out → 兩注獲利＋15%" },
  "tomato|mushroom": { title: "命運頭獎", rate: 0.15, recipients: "both", shortSummary: "番茄＋蘑菇成功 → 雙方獲利＋15%", summary: "番茄自動收成成功、蘑菇成功 → 兩注獲利＋15%" },
  "tomato|peapod": { title: "豆茄收成", rate: 0.15, recipients: "both", shortSummary: "番茄＋豌豆成功 → 雙方獲利＋15%", summary: "番茄自動收成成功、豌豆成功 → 兩注獲利＋15%" },
  "peapod|mushroom": { title: "逃生頭獎", rate: 0.15, recipients: "both", shortSummary: "豌豆＋蘑菇成功 → 雙方獲利＋15%", summary: "豌豆與蘑菇都成功 Cash Out → 兩注獲利＋15%" },
});

const SAME_ROLE_DESCRIPTIONS = Object.freeze({
  potato: { title: "雙馬鈴薯", shortSummary: "早收×2機率：28% → 50%", summary: "各注在 2× 前成功：50% 機率派彩×2" },
  chili: { title: "雙辣椒", shortSummary: "高倍×2機率：34% → 55%", summary: "各注在 5× 後成功：55% 機率派彩×2" },
  pumpkin: { title: "雙南瓜", shortSummary: "爆掉保本機率：5% → 10%", summary: "各注爆掉：10% 機率退回本金" },
  tomato: { title: "雙番茄", shortSummary: "自動收成×3機率：12% → 20%", summary: "各注在 2–5× 自動收成：20% 機率派彩×3" },
  peapod: { title: "雙豌豆", shortSummary: "3×逃生機率：20% → 35%", summary: "各注達 3× 後爆掉：35% 機率以 2× 結算" },
  mushroom: { title: "雙蘑菇", shortSummary: "JACKPOT機率：4.5% → 8%", summary: "各注成功 Cash Out：8% 機率派彩×8" },
});

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
  return {
    payout: Math.max(0, payout),
    note: notes.join(" · "),
    outcome: triggeredRoleIds.length ? "bonus" : "neutral",
    triggeredRoleIds,
  };
}

function normalizeWagers(wagers) {
  return wagers
    .filter((wager) => wager && Object.hasOwn(ROLE_MATH, wager.roleId) && Number.isFinite(wager.stake) && wager.stake > 0)
    .slice(0, 2)
    .map((wager) => ({ roleId: wager.roleId, stake: wager.stake, target: safeTarget(wager.target), manual: wager.manual === true }));
}

function manualTargetCandidates(peerTargets = []) {
  return [...new Set([...MANUAL_TARGET_BREAKPOINTS, ...peerTargets.flatMap((target) => [target - .01, target, target + .01])]
    .map((target) => Math.min(MAX_SETTLEMENT_MULTIPLIER, Math.max(1.01, Math.round(target * 100) / 100))))];
}

function ownTriggerChance(roleId, roundRoleIds) {
  const resonance = hasResonance(roleId, roundRoleIds);
  if (roleId === "potato") return resonance ? ROLE_MATH.potato.resonanceChance : ROLE_MATH.potato.triggerChance;
  if (roleId === "chili") return resonance ? ROLE_MATH.chili.resonanceChance : ROLE_MATH.chili.triggerChance;
  if (roleId === "pumpkin") return resonance ? ROLE_MATH.pumpkin.resonanceChance : ROLE_MATH.pumpkin.triggerChance;
  if (roleId === "tomato") return resonance ? ROLE_MATH.tomato.resonanceChance : ROLE_MATH.tomato.triggerChance;
  if (roleId === "peapod") return resonance ? ROLE_MATH.peapod.resonanceChance : ROLE_MATH.peapod.triggerChance;
  if (roleId === "mushroom") return resonance ? ROLE_MATH.mushroom.resonanceChance : ROLE_MATH.mushroom.triggerChance;
  return 0;
}

function roleConditionMet(roleId, multiplier) {
  if (roleId === "potato") return multiplier < ROLE_MATH.potato.maxMultiplier;
  if (roleId === "chili") return multiplier >= ROLE_MATH.chili.minMultiplier;
  return ["pumpkin", "tomato", "peapod", "mushroom"].includes(roleId);
}

function expectedOwnFactor(roleId, multiplier, roundRoleIds) {
  if (roleId === "potato" && multiplier < ROLE_MATH.potato.maxMultiplier) {
    return 1 + ownTriggerChance(roleId, roundRoleIds) * (ROLE_MATH.potato.payoutFactor - 1);
  }
  if (roleId === "chili" && multiplier >= ROLE_MATH.chili.minMultiplier) {
    return 1 + ownTriggerChance(roleId, roundRoleIds) * (ROLE_MATH.chili.payoutFactor - 1);
  }
  if (roleId === "tomato") {
    return 1 + ownTriggerChance(roleId, roundRoleIds) * (ROLE_MATH.tomato.payoutFactor - 1);
  }
  if (roleId === "mushroom") {
    return 1 + ownTriggerChance(roleId, roundRoleIds) * (ROLE_MATH.mushroom.payoutFactor - 1);
  }
  return 1;
}

export function describeDuoPair(roleIds) {
  const pair = normalizedRolePair(roleIds?.[0], roleIds);
  if (pair.length < 2) return { key: "", title: "再選一注", badge: "連攜預覽", shortSummary: "兩注下注後，自動啟動連攜", summary: "兩注下注後，自動啟動目前的角色連攜", roleDetails: ["等待第二隻角色", "等待第二隻角色"] };
  if (pair[0] === pair[1]) {
    const description = SAME_ROLE_DESCRIPTIONS[pair[0]];
    return { key: pairKey(pair), ...description, badge: "同角共鳴", roleDetails: [description.summary, description.summary] };
  }
  const link = MIXED_LINKS[pairKey(pair)];
  return { key: pairKey(pair), ...link, badge: "雙角連攜", roleDetails: [link.summary, link.summary] };
}

export function crashPointFromUnit(unit, baseRtp = TARGET_RTP) {
  const safeUnit = clampUnit(unit);
  const safeBaseRtp = Math.min(TARGET_RTP, Math.max(Number.EPSILON, baseRtp));
  const rawPoint = Math.min(100, Math.max(1, safeBaseRtp / Math.max(Number.EPSILON, 1 - safeUnit)));
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
  const gentleTail = safeCashAt * (1.08 + clampUnit(unit) * 0.06);
  const visualEnd = canExtend ? Math.min(99.99, Math.max(safeNaturalEnd, gentleTail)) : safeNaturalEnd;
  return {
    active: true,
    extended: visualEnd > safeNaturalEnd + 0.005,
    cashAt: safeCashAt,
    naturalEnd: safeNaturalEnd,
    visualEnd,
  };
}

export function settleSuccessfulCashout(roleId, stake, multiplier, rolls, roundRoleIds = [roleId]) {
  const safeStake = Math.max(0, stake);
  const safeMultiplier = safeTarget(multiplier);
  const resonance = hasResonance(roleId, roundRoleIds);
  const notes = [];
  const triggeredRoleIds = [];
  let payout = safeStake * safeMultiplier;

  if (roleId === "potato" && safeMultiplier < ROLE_MATH.potato.maxMultiplier && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    payout *= ROLE_MATH.potato.payoutFactor;
    notes.push(`${resonance ? "馬鈴薯共鳴" : "馬鈴薯"}：早收派彩×2`);
    triggeredRoleIds.push(roleId);
  }
  if (roleId === "chili" && safeMultiplier >= ROLE_MATH.chili.minMultiplier && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    payout *= ROLE_MATH.chili.payoutFactor;
    notes.push(`${resonance ? "辣椒共鳴" : "辣椒"}：高倍派彩×2`);
    triggeredRoleIds.push(roleId);
  }
  if (roleId === "tomato" && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    payout *= ROLE_MATH.tomato.payoutFactor;
    notes.push(`${resonance ? "番茄共鳴" : "番茄"}：自動收成派彩×3`);
    triggeredRoleIds.push(roleId);
  }
  if (roleId === "mushroom" && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    payout *= ROLE_MATH.mushroom.payoutFactor;
    notes.push(`${resonance ? "蘑菇共鳴" : "蘑菇"}：JACKPOT派彩×8`);
    triggeredRoleIds.push(roleId);
  }
  return result(payout, notes, triggeredRoleIds);
}

export function settleCrashRole(roleId, stake, crashPoint, rolls, roundRoleIds = [roleId]) {
  const safeStake = Math.max(0, stake);
  const safeCrashPoint = Math.max(1, Number.isFinite(crashPoint) ? crashPoint : 1);
  const resonance = hasResonance(roleId, roundRoleIds);
  if (roleId === "pumpkin" && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    return result(safeStake * ROLE_MATH.pumpkin.refundFactor, [`${resonance ? "雙南瓜" : "南瓜"}保本：退回本金`], [roleId]);
  }
  if (roleId === "peapod" && safeCrashPoint >= ROLE_MATH.peapod.escapeThreshold && roleRoll(rolls, roleId) < ownTriggerChance(roleId, roundRoleIds)) {
    return result(safeStake * ROLE_MATH.peapod.escapePayoutFactor, [`${resonance ? "雙豌豆" : "豌豆"}逃生：以2×結算`], [roleId]);
  }
  return result(0);
}

export function expectedSuccessfulPayout(roleId, stake, multiplier, roundRoleIds = [roleId]) {
  const safeStake = Math.max(0, stake);
  const safeMultiplier = safeTarget(multiplier);
  return safeStake * safeMultiplier * expectedOwnFactor(roleId, safeMultiplier, roundRoleIds);
}

export function expectedCrashPayout(roleId, stake, crashPoint, roundRoleIds = [roleId]) {
  const safeStake = Math.max(0, stake);
  if (roleId === "pumpkin") return safeStake * ROLE_MATH.pumpkin.refundFactor * ownTriggerChance(roleId, roundRoleIds);
  if (roleId === "peapod" && crashPoint >= ROLE_MATH.peapod.escapeThreshold) {
    return safeStake * ROLE_MATH.peapod.escapePayoutFactor * ownTriggerChance(roleId, roundRoleIds);
  }
  return 0;
}

function emptyLinkResult(description = null) {
  return { extras: [0, 0], total: 0, note: "", title: "", triggered: false, sourceIndexes: [], description };
}

export function settleDuoLink(tickets) {
  const active = Array.isArray(tickets) ? tickets.filter((ticket) => ticket?.placed !== false).slice(0, 2) : [];
  if (active.length !== 2 || active.some((ticket) => ticket.status !== "cashed" || ticket.linkAwarded)) return emptyLinkResult();
  const roleIds = active.map((ticket) => ticket.roleId);
  const description = describeDuoPair(roleIds);
  const extras = [0, 0];
  const notes = [];
  const sourceIndexes = [];
  if (roleIds[0] === roleIds[1] || !active.every((ticket) => roleConditionMet(ticket.roleId, safeTarget(ticket.cashAt)))) return emptyLinkResult(description);
  const link = MIXED_LINKS[pairKey(roleIds)];
  if (!link) return emptyLinkResult(description);
  const recipientIndexes = link.recipients === "both" ? [0, 1] : active.flatMap((ticket, index) => ticket.roleId === link.partnerRole ? [index] : []);
  for (const index of recipientIndexes) extras[index] = Math.max(0, active[index].payout - active[index].stake) * link.rate;
  sourceIndexes.push(...recipientIndexes);
  notes.push(`${description.title}：${description.summary}`);
  const total = extras[0] + extras[1];
  if (total <= 0) return emptyLinkResult(description);
  return { extras, total, note: notes.join(" · "), title: description.title, triggered: true, sourceIndexes: [...new Set(sourceIndexes)], description };
}

function expectedLinkExtra(active, roundRoleIds) {
  if (active.length !== 2) return 0;
  const [first, second] = active;
  if (first.roleId === second.roleId || !active.every((wager) => roleConditionMet(wager.roleId, wager.target))) return 0;
  const link = MIXED_LINKS[pairKey(roundRoleIds)];
  if (!link) return 0;
  const recipientIndexes = link.recipients === "both" ? [0, 1] : active.flatMap((wager, index) => wager.roleId === link.partnerRole ? [index] : []);
  return recipientIndexes.reduce((sum, index) => {
    const wager = active[index];
    const payout = expectedSuccessfulPayout(wager.roleId, wager.stake, wager.target, roundRoleIds);
    return sum + Math.max(0, payout - wager.stake) * link.rate;
  }, 0);
}

function roundReturnParts(wagers) {
  const active = normalizeWagers(wagers);
  const roundRoleIds = active.map((wager) => wager.roleId);
  const totalStake = active.reduce((sum, wager) => sum + wager.stake, 0);
  let constantReturn = 0;
  let baseCoefficient = 0;
  for (const wager of active) {
    baseCoefficient += expectedSuccessfulPayout(wager.roleId, wager.stake, wager.target, roundRoleIds) / wager.target;
    if (wager.roleId === "pumpkin") {
      const expectedRefund = wager.stake * ROLE_MATH.pumpkin.refundFactor * ownTriggerChance(wager.roleId, roundRoleIds);
      constantReturn += expectedRefund;
      baseCoefficient -= expectedRefund / wager.target;
    }
    if (wager.roleId === "peapod" && wager.target > ROLE_MATH.peapod.escapeThreshold) {
      const expectedEscape = wager.stake * ROLE_MATH.peapod.escapePayoutFactor * ownTriggerChance(wager.roleId, roundRoleIds);
      baseCoefficient += expectedEscape * (1 / ROLE_MATH.peapod.escapeThreshold - 1 / wager.target);
    }
  }
  if (active.length === 2) {
    const linkExtra = expectedLinkExtra(active, roundRoleIds);
    baseCoefficient += linkExtra / Math.max(active[0].target, active[1].target);
  }
  return { totalStake, constantReturn, baseCoefficient };
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
