export type RecoveryPool = {
  reserve: number;
  thresholdFactor: number;
  cooldown: number;
  totalCoreMargin: number;
  totalReleasedPayout: number;
  releaseCount: number;
};
export type RecoveryPlan = { active: boolean; mode: "crash" | "ability" | null; available: number; threshold: number; crashFloor: number };
export const RECOVERY_POOL_CONFIG: Readonly<{ contributionRate: number; minThresholdFactor: number; maxThresholdFactor: number; crashReleaseChance: number }>;
export function thresholdFactorFromUnit(value: number): number;
export function cooldownFromUnit(value: number): number;
export function createRecoveryPool(thresholdUnit?: number): RecoveryPool;
export function normalizeRecoveryPool(value: unknown): RecoveryPool;
export function planRecoveryRelease(pool: RecoveryPool, totalStake: number, modeUnit?: number): RecoveryPlan;
export function reserveRecoveryPayout(pool: RecoveryPool, amount: number): { accepted: boolean; amount: number; pool: RecoveryPool };
export function settleRecoveryReservation(pool: RecoveryPool, amount: number, paid: boolean): RecoveryPool;
export function settleRecoveryPool(pool: RecoveryPool, options?: { coreStake?: number; corePayout?: number; actualPayout?: number; releaseActive?: boolean; releasedAmount?: number; thresholdUnit?: number; cooldownUnit?: number; advanceCooldown?: boolean }): RecoveryPool;
