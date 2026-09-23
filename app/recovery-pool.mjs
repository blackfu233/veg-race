export const RECOVERY_POOL_CONFIG = Object.freeze({
  contributionRate: 0.5,
  minThresholdFactor: 5,
  maxThresholdFactor: 7,
  crashReleaseChance: 0.7,
});

export const RECOVERY_CORE_SCALES = Object.freeze({
  potato: .891016,
  chili: .777637,
  pumpkin: .947266,
  tomato: .833447,
  peapod: .80708,
  mushroom: .505762,
  "potato|potato": .914746,
  "chili|potato": .765332,
  "potato|pumpkin": .942432,
  "potato|tomato": .912109,
  "peapod|potato": .852783,
  "mushroom|potato": .746436,
  "chili|chili": .760938,
  "chili|pumpkin": .872559,
  "chili|tomato": .765332,
  "chili|peapod": .803564,
  "chili|mushroom": .712598,
  "pumpkin|pumpkin": .93916,
  "pumpkin|tomato": .879687,
  "peapod|pumpkin": .862451,
  "mushroom|pumpkin": .936719,
  "tomato|tomato": .846631,
  "peapod|tomato": .853223,
  "mushroom|tomato": .79082,
  "peapod|peapod": .823633,
  "mushroom|peapod": .682715,
  "mushroom|mushroom": .733252,
});

export function recoveryCoreScale(roleIds) {
  const key = [...roleIds].sort().join("|");
  return RECOVERY_CORE_SCALES[key] ?? 1;
}

function unit(value) {
  return Math.min(1 - Number.EPSILON, Math.max(0, Number.isFinite(value) ? value : .5));
}

export function thresholdFactorFromUnit(value) {
  const { minThresholdFactor, maxThresholdFactor } = RECOVERY_POOL_CONFIG;
  return Math.round((minThresholdFactor + unit(value) * (maxThresholdFactor - minThresholdFactor)) * 100) / 100;
}

export function cooldownFromUnit(value) {
  const roll = unit(value);
  return roll < .5 ? 1 : roll < .85 ? 2 : 3;
}

export function createRecoveryPool(thresholdUnit = .5) {
  return {
    reserve: 0,
    thresholdFactor: thresholdFactorFromUnit(thresholdUnit),
    cooldown: 0,
    totalCoreMargin: 0,
    totalReleasedProfit: 0,
    releaseCount: 0,
  };
}

export function normalizeRecoveryPool(value) {
  const fallback = createRecoveryPool();
  if (!value || typeof value !== "object") return fallback;
  return {
    reserve: Number.isFinite(value.reserve) ? Math.max(0, value.reserve) : 0,
    thresholdFactor: Number.isFinite(value.thresholdFactor)
      ? Math.min(RECOVERY_POOL_CONFIG.maxThresholdFactor, Math.max(RECOVERY_POOL_CONFIG.minThresholdFactor, value.thresholdFactor))
      : fallback.thresholdFactor,
    cooldown: Number.isFinite(value.cooldown) ? Math.max(0, Math.floor(value.cooldown)) : 0,
    totalCoreMargin: Number.isFinite(value.totalCoreMargin) ? value.totalCoreMargin : 0,
    totalReleasedProfit: Number.isFinite(value.totalReleasedProfit) ? Math.max(0, value.totalReleasedProfit) : 0,
    releaseCount: Number.isFinite(value.releaseCount) ? Math.max(0, Math.floor(value.releaseCount)) : 0,
  };
}

export function planRecoveryRelease(pool, totalStake, modeUnit = .5) {
  const state = normalizeRecoveryPool(pool);
  const stake = Math.max(0, Number.isFinite(totalStake) ? totalStake : 0);
  const available = Math.max(0, state.reserve);
  const threshold = state.thresholdFactor * stake;
  if (stake <= 0 || state.cooldown > 0 || available + 1e-9 < threshold) {
    return { active: false, mode: null, available, threshold, crashFloor: 0 };
  }
  const mode = unit(modeUnit) < RECOVERY_POOL_CONFIG.crashReleaseChance ? "crash" : "ability";
  return {
    active: true,
    mode,
    available,
    threshold,
    crashFloor: Math.min(99, Math.max(RECOVERY_POOL_CONFIG.minThresholdFactor, Math.floor((1 + available / stake) * 100) / 100)),
  };
}

export function reserveRecoveryProfit(pool, amount) {
  const state = normalizeRecoveryPool(pool);
  const requested = Math.max(0, Number.isFinite(amount) ? amount : 0);
  if (requested > state.reserve + 1e-9) return { accepted: false, amount: 0, pool: state };
  return { accepted: true, amount: requested, pool: { ...state, reserve: Math.max(0, state.reserve - requested) } };
}

export function settleRecoveryReservation(pool, amount, paid) {
  const state = normalizeRecoveryPool(pool);
  const reserved = Math.max(0, Number.isFinite(amount) ? amount : 0);
  return paid
    ? { ...state, totalReleasedProfit: state.totalReleasedProfit + reserved }
    : { ...state, reserve: state.reserve + reserved };
}

export function settleRecoveryPool(pool, {
  coreStake = 0,
  corePayout = 0,
  actualPayout = 0,
  releaseActive = false,
  releasedProfit,
  thresholdUnit = .5,
  cooldownUnit = .5,
  advanceCooldown = true,
} = {}) {
  const state = normalizeRecoveryPool(pool);
  const stake = Math.max(0, Number.isFinite(coreStake) ? coreStake : 0);
  const corePaid = Math.max(0, Number.isFinite(corePayout) ? corePayout : 0);
  const actualPaid = Math.max(0, Number.isFinite(actualPayout) ? actualPayout : 0);
  const coreMargin = stake - corePaid;
  const paidFromPool = Number.isFinite(releasedProfit)
    ? Math.max(0, releasedProfit)
    : releaseActive ? Math.max(0, actualPaid - stake) : 0;
  return {
    reserve: Math.max(0, state.reserve + coreMargin * RECOVERY_POOL_CONFIG.contributionRate - paidFromPool),
    thresholdFactor: releaseActive ? thresholdFactorFromUnit(thresholdUnit) : state.thresholdFactor,
    cooldown: releaseActive ? cooldownFromUnit(cooldownUnit) : advanceCooldown ? Math.max(0, state.cooldown - 1) : state.cooldown,
    totalCoreMargin: state.totalCoreMargin + coreMargin,
    totalReleasedProfit: state.totalReleasedProfit + paidFromPool,
    releaseCount: state.releaseCount + (releaseActive ? 1 : 0),
  };
}
