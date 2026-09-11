export const TARGET_RTP = 0.96;
export const MAX_SETTLEMENT_MULTIPLIER = 99;

export const ROLE_MATH = Object.freeze({
  potato: { triggerChance: 0.28, resonanceChance: 0.5, payoutFactor: 2, maxMultiplier: 2 },
  chili: { triggerChance: 0.34, resonanceChance: 0.55, payoutFactor: 2, minMultiplier: 5 },
  pumpkin: { triggerChance: 0.25, resonanceChance: 0.4, partnerProfitShare: 0.5 },
  tomato: { triggerChance: 0.12, resonanceChance: 0.2, payoutFactor: 3, minTarget: 2, maxTarget: 5 },
  peapod: { triggerChance: 0.25, resonanceChance: 0.4, ownProfitCopy: 1 },
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
  "potato|tomato": { title: "早收等熟", rate: 0.15, recipients: "both", shortSummary: "早收＋番茄成功 → 雙方獲利＋15%", summary: "馬鈴薯在 2× 前成功、番茄自動收成成功 → 兩注獲利＋15%" },
  "potato|mushroom": { title: "小注摸大獎", rate: 0.15, recipients: "both", shortSummary: "早收＋蘑菇成功 → 雙方獲利＋15%", summary: "馬鈴薯在 2× 前成功、蘑菇成功 → 兩注獲利＋15%" },
  "chili|tomato": { title: "命運追高", rate: 0.25, recipients: "both", shortSummary: "辣椒5×＋番茄成功 → 雙方獲利＋25%", summary: "辣椒在 5× 後成功、番茄自動收成成功 → 兩注獲利＋25%" },
  "chili|mushroom": { title: "極限大獎", rate: 0.3, recipients: "both", shortSummary: "辣椒5×＋蘑菇成功 → 雙方獲利＋30%", summary: "辣椒在 5× 後成功、蘑菇成功 → 兩注獲利＋30%" },
  "tomato|mushroom": { title: "命運頭獎", rate: 0.15, recipients: "both", shortSummary: "番茄＋蘑菇成功 → 雙方獲利＋15%", summary: "番茄自動收成成功、蘑菇成功 → 兩注獲利＋15%" },
});

const SAME_ROLE_DESCRIPTIONS = Object.freeze({
  potato: { title: "馬鈴薯共鳴", shortSummary: "兩注2×前成功 → 各50%派彩×2", summary: "雙馬鈴薯上場：各自在 2× 前成功時，50% 機率派彩×2" },
  chili: { title: "辣椒共鳴", shortSummary: "兩注5×後成功 → 各55%派彩×2", summary: "雙辣椒上場：各自在 5× 後成功時，55% 機率派彩×2" },
  tomato: { title: "番茄共鳴", shortSummary: "兩注自動收成 → ×3機率升至20%", summary: "雙番茄上場：各自隨機 2–5× 自動收成，20% 機率派彩×3" },
  mushroom: { title: "蘑菇共鳴", shortSummary: "兩注成功 → ×8機率升至8%", summary: "雙蘑菇上場：各自成功時，8% 機率派彩×8" },
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
  if (roleId === "tomato") return resonance ? ROLE_MATH.tomato.resonanceChance : ROLE_MATH.tomato.triggerChance;
  if (roleId === "mushroom") return resonance ? ROLE_MATH.mushroom.resonanceChance : ROLE_MATH.mushroom.triggerChance;
  return 0;
}

function roleConditionMet(roleId, multiplier) {
  if (roleId === "potato") return multiplier < ROLE_MATH.potato.maxMultiplier;
  if (roleId === "chili") return multiplier >= ROLE_MATH.chili.minMultiplier;
  return roleId === "tomato" || roleId === "mushroom";
}

function transferChance(roleId, roundRoleIds) {
  const math = ROLE_MATH[roleId];
  return hasResonance(roleId, roundRoleIds) ? math.resonanceChance : math.triggerChance;
}

function baseProfit(wager) {
  return Math.max(0, wager.stake * (safeTarget(wager.cashAt ?? wager.target) - 1));
}

function describeTransferPair(pair) {
  const names = pair.map((roleId) => ROLE_NAMES[roleId]);
  const peaCount = pair.filter((roleId) => roleId === "peapod").length;
  const pumpkinCount = pair.filter((roleId) => roleId === "pumpkin").length;
  const peaChance = Math.round(transferChance("peapod", pair) * 100);
  const pumpkinChance = Math.round(transferChance("pumpkin", pair) * 100);
  const title = peaCount === 2 ? "雙豆補給" : pumpkinCount === 2 ? "雙藤收成" : peaCount && pumpkinCount ? "豆藤連攜" : peaCount ? `${names.find((name) => name !== "豌豆莢")}補給` : `${names.find((name) => name !== "南瓜")}藤蔓`;
  const shortSummary = peaCount && pumpkinCount
    ? `雙方成功：豌豆${peaChance}%送獲利／南瓜${pumpkinChance}%收一半`
    : peaCount === 2
      ? `雙方成功 → 各${peaChance}%把獲利送給對方`
      : pumpkinCount === 2
        ? `雙方成功 → 各${pumpkinChance}%取得對方50%獲利`
        : peaCount
          ? `雙方成功 → 豌豆${peaChance}%把獲利送給${names.find((name) => name !== "豌豆莢")}`
          : `雙方成功 → 南瓜${pumpkinChance}%取得${names.find((name) => name !== "南瓜")}50%獲利`;
  const roleDetails = pair.map((roleId, index) => {
    const partnerName = names[1 - index];
    if (roleId === "peapod") return `雙注都成功 → ${peaChance}%把本注獲利加給${partnerName}`;
    if (roleId === "pumpkin") return `雙注都成功 → ${pumpkinChance}%取得${partnerName}的50%獲利`;
    if (peaCount) return `豌豆觸發 → 本注再加上豌豆的同額獲利`;
    return `南瓜觸發 → 複製本注50%獲利給南瓜，不扣本注`;
  });
  return { title, shortSummary, summary: `${roleDetails[0]}；${roleDetails[1]}`, roleDetails };
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
  if (pair.length < 2) return { key: "", title: "再選一注", badge: "連攜預覽", shortSummary: "兩注都下注後，自動啟動角色連攜", summary: "兩注都下注後，依角色組合自動啟動連攜", roleDetails: ["等待第二隻角色", "等待第二隻角色"] };
  if (pair.some((roleId) => roleId === "pumpkin" || roleId === "peapod")) return { key: pairKey(pair), ...describeTransferPair(pair), badge: pair[0] === pair[1] ? "同角共鳴" : "雙角連攜" };
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

export function settleCrashRole() {
  return result(0);
}

export function expectedSuccessfulPayout(roleId, stake, multiplier, roundRoleIds = [roleId]) {
  const safeStake = Math.max(0, stake);
  const safeMultiplier = safeTarget(multiplier);
  return safeStake * safeMultiplier * expectedOwnFactor(roleId, safeMultiplier, roundRoleIds);
}

export function expectedCrashPayout() {
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
  if (roleIds.some((roleId) => roleId === "pumpkin" || roleId === "peapod")) {
    active.forEach((ticket, index) => {
      const partnerIndex = 1 - index;
      if (ticket.roleId === "peapod" && clampUnit(ticket.abilityRoll) < transferChance("peapod", roleIds)) {
        extras[partnerIndex] += baseProfit(ticket) * ROLE_MATH.peapod.ownProfitCopy;
        notes.push(`豌豆補給：把本注獲利加給${ROLE_NAMES[active[partnerIndex].roleId]}`);
        sourceIndexes.push(index);
      }
      if (ticket.roleId === "pumpkin" && clampUnit(ticket.abilityRoll) < transferChance("pumpkin", roleIds)) {
        extras[index] += baseProfit(active[partnerIndex]) * ROLE_MATH.pumpkin.partnerProfitShare;
        notes.push(`南瓜藤蔓：追加${ROLE_NAMES[active[partnerIndex].roleId]}50%獲利`);
        sourceIndexes.push(index);
      }
    });
  } else {
    if (roleIds[0] === roleIds[1] || !active.every((ticket) => roleConditionMet(ticket.roleId, safeTarget(ticket.cashAt)))) return emptyLinkResult(description);
    const link = MIXED_LINKS[pairKey(roleIds)];
    if (!link) return emptyLinkResult(description);
    const recipientIndexes = link.recipients === "both" ? [0, 1] : active.flatMap((ticket, index) => ticket.roleId === link.partnerRole ? [index] : []);
    for (const index of recipientIndexes) extras[index] = Math.max(0, active[index].payout - active[index].stake) * link.rate;
    sourceIndexes.push(...recipientIndexes);
    notes.push(`${description.title}：${description.summary}`);
  }
  const total = extras[0] + extras[1];
  if (total <= 0) return emptyLinkResult(description);
  return { extras, total, note: notes.join(" · "), title: description.title, triggered: true, sourceIndexes: [...new Set(sourceIndexes)], description };
}

function expectedLinkExtra(active, roundRoleIds) {
  if (active.length !== 2) return 0;
  const [first, second] = active;
  if (roundRoleIds.some((roleId) => roleId === "pumpkin" || roleId === "peapod")) {
    return active.reduce((sum, wager, index) => {
      if (wager.roleId === "peapod") return sum + transferChance("peapod", roundRoleIds) * baseProfit(wager) * ROLE_MATH.peapod.ownProfitCopy;
      if (wager.roleId === "pumpkin") return sum + transferChance("pumpkin", roundRoleIds) * baseProfit(active[1 - index]) * ROLE_MATH.pumpkin.partnerProfitShare;
      return sum;
    }, 0);
  }
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

function manualSafeRoundParts(wagers) {
  const active = normalizeWagers(wagers);
  const totalStake = active.reduce((sum, wager) => sum + wager.stake, 0);
  const fixedTargets = active.filter((wager) => !wager.manual).map((wager) => wager.target);
  const targetSets = active.map((wager) => wager.manual ? manualTargetCandidates(fixedTargets) : [wager.target]);
  let baseCoefficient = 0;
  for (const firstTarget of targetSets[0] ?? []) {
    for (const secondTarget of targetSets[1] ?? [null]) {
      const candidates = active.map((wager, index) => ({ ...wager, target: index === 0 ? firstTarget : secondTarget }));
      baseCoefficient = Math.max(baseCoefficient, roundReturnParts(candidates).baseCoefficient);
    }
  }
  return { totalStake, baseCoefficient };
}

export function expectedRoundReturn(wagers, baseRtp) {
  const { baseCoefficient } = roundReturnParts(wagers);
  return Math.max(0, baseRtp) * baseCoefficient;
}

export function calibrateRoundBaseRtp(wagers) {
  const { totalStake, baseCoefficient } = manualSafeRoundParts(wagers);
  if (totalStake <= 0 || baseCoefficient <= 0) return TARGET_RTP;
  return Math.min(TARGET_RTP, Math.max(Number.EPSILON, TARGET_RTP * totalStake / baseCoefficient));
}
