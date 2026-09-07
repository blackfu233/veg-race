export const TARGET_RTP = 0.96;
export const MAX_SETTLEMENT_MULTIPLIER = 99;

export const ROLE_MATH = Object.freeze({
  potato: { triggerChance: 0.28, resonanceChance: 0.5, payoutFactor: 2, maxMultiplier: 2 },
  chili: { triggerChance: 0.34, resonanceChance: 0.55, payoutFactor: 2, minMultiplier: 5 },
  pumpkin: { tier2: 0.1, tier4: 0.25, tier6: 0.5, resonanceTier2: 0.2, resonanceTier4: 0.4, resonanceTier6: 0.7 },
  tomato: { triggerChance: 0.12, resonanceChance: 0.2, payoutFactor: 3, minTarget: 2, maxTarget: 5 },
  peapod: { resonanceProfitBonus: 0.3, supportMinimum: 2 },
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

const MIXED_LINKS = Object.freeze({
  "potato|chili": { title: "兩端包夾", rate: 0.3, recipients: "both", summary: "馬鈴薯在 2× 前成功、辣椒在 5× 後成功 → 兩注獲利＋30%" },
  "potato|pumpkin": { title: "穩穩長大", rate: 0.2, recipients: "both", summary: "馬鈴薯在 2× 前成功、南瓜在 4× 後成功 → 兩注獲利＋20%" },
  "potato|tomato": { title: "早收等熟", rate: 0.15, recipients: "both", summary: "馬鈴薯在 2× 前成功、番茄自動收成成功 → 兩注獲利＋15%" },
  "potato|peapod": { title: "豆子補給", rate: 0.3, recipients: "partner", partnerRole: "potato", summary: "豌豆莢在 2× 後成功、馬鈴薯在 2× 前成功 → 馬鈴薯獲利＋30%" },
  "potato|mushroom": { title: "小注摸大獎", rate: 0.15, recipients: "both", summary: "馬鈴薯在 2× 前成功、蘑菇成功 → 兩注獲利＋15%" },
  "chili|pumpkin": { title: "高倍豐收", rate: 0.3, recipients: "both", summary: "辣椒在 5× 後成功、南瓜在 4× 後成功 → 兩注獲利＋30%" },
  "chili|tomato": { title: "命運追高", rate: 0.25, recipients: "both", summary: "辣椒在 5× 後成功、番茄自動收成成功 → 兩注獲利＋25%" },
  "chili|peapod": { title: "豌豆助燃", rate: 0.4, recipients: "partner", partnerRole: "chili", summary: "豌豆莢在 2× 後成功、辣椒在 5× 後成功 → 辣椒獲利＋40%" },
  "chili|mushroom": { title: "極限大獎", rate: 0.3, recipients: "both", summary: "辣椒在 5× 後成功、蘑菇成功 → 兩注獲利＋30%" },
  "pumpkin|tomato": { title: "成熟收成", rate: 0.2, recipients: "both", summary: "南瓜在 4× 後成功、番茄自動收成成功 → 兩注獲利＋20%" },
  "pumpkin|peapod": { title: "里程補給", rate: 0.3, recipients: "partner", partnerRole: "pumpkin", summary: "豌豆莢在 2× 後成功、南瓜在 4× 後成功 → 南瓜獲利＋30%" },
  "pumpkin|mushroom": { title: "巨型豐收", rate: 0.2, recipients: "both", summary: "南瓜在 4× 後成功、蘑菇成功 → 兩注獲利＋20%" },
  "tomato|peapod": { title: "自動接豆", rate: 0.25, recipients: "partner", partnerRole: "tomato", summary: "豌豆莢在 2× 後成功、番茄自動收成成功 → 番茄獲利＋25%" },
  "tomato|mushroom": { title: "命運頭獎", rate: 0.15, recipients: "both", summary: "番茄自動收成成功、蘑菇成功 → 兩注獲利＋15%" },
  "peapod|mushroom": { title: "幸運孢子", rate: 0.25, recipients: "partner", partnerRole: "mushroom", summary: "豌豆莢在 2× 後成功、蘑菇成功 → 蘑菇獲利＋25%" },
});

const SAME_ROLE_DESCRIPTIONS = Object.freeze({
  potato: { title: "馬鈴薯共鳴", summary: "雙馬鈴薯上場：各自在 2× 前成功時，50% 機率派彩×2" },
  chili: { title: "辣椒共鳴", summary: "雙辣椒上場：各自在 5× 後成功時，55% 機率派彩×2" },
  pumpkin: { title: "南瓜共鳴", summary: "雙南瓜上場：2×／4×／6× 成功時，獲利＋20%／40%／70%" },
  tomato: { title: "番茄共鳴", summary: "雙番茄上場：各自隨機 2–5× 自動收成，20% 機率派彩×3" },
  peapod: { title: "豌豆共鳴", summary: "兩注都在 2× 後成功 → 兩注獲利＋30%" },
  mushroom: { title: "蘑菇共鳴", summary: "雙蘑菇上場：各自成功時，8% 機率派彩×8" },
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
    .map((wager) => ({ roleId: wager.roleId, stake: wager.stake, target: safeTarget(wager.target) }));
}

function pumpkinProfitRate(multiplier, resonance) {
  if (multiplier >= 6) return resonance ? ROLE_MATH.pumpkin.resonanceTier6 : ROLE_MATH.pumpkin.tier6;
  if (multiplier >= 4) return resonance ? ROLE_MATH.pumpkin.resonanceTier4 : ROLE_MATH.pumpkin.tier4;
  if (multiplier >= 2) return resonance ? ROLE_MATH.pumpkin.resonanceTier2 : ROLE_MATH.pumpkin.tier2;
  return 0;
}

function ownTriggerChance(roleId, roundRoleIds) {
  const resonance = hasResonance(roleId, roundRoleIds);
  if (roleId === "potato") return resonance ? ROLE_MATH.potato.resonanceChance : ROLE_MATH.potato.triggerChance;
  if (roleId === "chili") return resonance ? ROLE_MATH.chili.resonanceChance : ROLE_MATH.chili.triggerChance;
  if (roleId === "tomato") return resonance ? ROLE_MATH.tomato.resonanceChance : ROLE_MATH.tomato.triggerChance;
  if (roleId === "mushroom") return resonance ? ROLE_MATH.mushroom.resonanceChance : ROLE_MATH.mushroom.triggerChance;
  return 0;
}

function roleConditionMet(roleId, multiplier) {
  if (roleId === "potato") return multiplier < ROLE_MATH.potato.maxMultiplier;
  if (roleId === "chili") return multiplier >= ROLE_MATH.chili.minMultiplier;
  if (roleId === "pumpkin") return multiplier >= 4;
  if (roleId === "peapod") return multiplier >= ROLE_MATH.peapod.supportMinimum;
  return roleId === "tomato" || roleId === "mushroom";
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
  if (pair.length < 2) return { key: "", title: "再選一注", badge: "連攜預覽", summary: "兩注都下注後，依角色組合自動啟動連攜", roleDetails: ["等待第二隻角色", "等待第二隻角色"] };
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
  return Math.min(100, Math.max(1, safeBaseRtp / Math.max(Number.EPSILON, 1 - safeUnit)));
}

export function survivalAt(multiplier, baseRtp = TARGET_RTP) {
  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier >= 100) return 0;
  return Math.min(1, Math.max(0, baseRtp) / multiplier);
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
  if (roleId === "pumpkin") {
    const rate = pumpkinProfitRate(safeMultiplier, resonance);
    if (rate > 0) {
      payout += Math.max(0, payout - safeStake) * rate;
      notes.push(`${resonance ? "南瓜共鳴" : "南瓜"}：里程獲利＋${Math.round(rate * 100)}%`);
      triggeredRoleIds.push(roleId);
    }
  }
  return result(payout, notes, triggeredRoleIds);
}

export function settleCrashRole() {
  return result(0);
}

export function expectedSuccessfulPayout(roleId, stake, multiplier, roundRoleIds = [roleId]) {
  const safeStake = Math.max(0, stake);
  const safeMultiplier = safeTarget(multiplier);
  let payout = safeStake * safeMultiplier * expectedOwnFactor(roleId, safeMultiplier, roundRoleIds);
  if (roleId === "pumpkin") payout += Math.max(0, payout - safeStake) * pumpkinProfitRate(safeMultiplier, hasResonance(roleId, roundRoleIds));
  return payout;
}

export function expectedCrashPayout() {
  return 0;
}

function emptyLinkResult(description = null) {
  return { extras: [0, 0], total: 0, note: "", triggered: false, description };
}

export function settleDuoLink(tickets) {
  const active = Array.isArray(tickets) ? tickets.filter((ticket) => ticket?.placed !== false).slice(0, 2) : [];
  if (active.length !== 2 || active.some((ticket) => ticket.status !== "cashed" || ticket.linkAwarded)) return emptyLinkResult();
  const roleIds = active.map((ticket) => ticket.roleId);
  const description = describeDuoPair(roleIds);
  if (roleIds[0] === roleIds[1] && roleIds[0] !== "peapod") return emptyLinkResult(description);
  if (!active.every((ticket) => roleConditionMet(ticket.roleId, safeTarget(ticket.cashAt)))) return emptyLinkResult(description);

  let rate;
  let recipientIndexes;
  if (roleIds[0] === "peapod" && roleIds[1] === "peapod") {
    rate = ROLE_MATH.peapod.resonanceProfitBonus;
    recipientIndexes = [0, 1];
  } else {
    const link = MIXED_LINKS[pairKey(roleIds)];
    if (!link) return emptyLinkResult(description);
    rate = link.rate;
    recipientIndexes = link.recipients === "both"
      ? [0, 1]
      : active.flatMap((ticket, index) => ticket.roleId === link.partnerRole ? [index] : []);
  }
  const extras = [0, 0];
  for (const index of recipientIndexes) extras[index] = Math.max(0, active[index].payout - active[index].stake) * rate;
  const total = extras[0] + extras[1];
  if (total <= 0) return emptyLinkResult(description);
  return { extras, total, note: `${description.title}：${description.summary}`, triggered: true, description };
}

function expectedLinkExtra(active, roundRoleIds) {
  if (active.length !== 2) return 0;
  const [first, second] = active;
  if (first.roleId === second.roleId && first.roleId !== "peapod") return 0;
  if (!active.every((wager) => roleConditionMet(wager.roleId, wager.target))) return 0;
  let rate;
  let recipientIndexes;
  if (first.roleId === "peapod" && second.roleId === "peapod") {
    rate = ROLE_MATH.peapod.resonanceProfitBonus;
    recipientIndexes = [0, 1];
  } else {
    const link = MIXED_LINKS[pairKey(roundRoleIds)];
    if (!link) return 0;
    rate = link.rate;
    recipientIndexes = link.recipients === "both"
      ? [0, 1]
      : active.flatMap((wager, index) => wager.roleId === link.partnerRole ? [index] : []);
  }
  return recipientIndexes.reduce((sum, index) => {
    const wager = active[index];
    const payout = expectedSuccessfulPayout(wager.roleId, wager.stake, wager.target, roundRoleIds);
    return sum + Math.max(0, payout - wager.stake) * rate;
  }, 0);
}

function roundReturnParts(wagers) {
  const active = normalizeWagers(wagers);
  const roundRoleIds = active.map((wager) => wager.roleId);
  const totalStake = active.reduce((sum, wager) => sum + wager.stake, 0);
  let baseCoefficient = 0;
  for (const wager of active) {
    baseCoefficient += expectedSuccessfulPayout(wager.roleId, wager.stake, wager.target, roundRoleIds) / wager.target;
  }
  if (active.length === 2) {
    const linkExtra = expectedLinkExtra(active, roundRoleIds);
    baseCoefficient += linkExtra / Math.max(active[0].target, active[1].target);
  }
  return { totalStake, baseCoefficient };
}

export function expectedRoundReturn(wagers, baseRtp) {
  const { baseCoefficient } = roundReturnParts(wagers);
  return Math.max(0, baseRtp) * baseCoefficient;
}

export function calibrateRoundBaseRtp(wagers) {
  const { totalStake, baseCoefficient } = roundReturnParts(wagers);
  if (totalStake <= 0 || baseCoefficient <= 0) return TARGET_RTP;
  return Math.min(TARGET_RTP, Math.max(Number.EPSILON, TARGET_RTP * totalStake / baseCoefficient));
}
