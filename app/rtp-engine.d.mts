export const TARGET_RTP: number;
export const MAX_SETTLEMENT_MULTIPLIER: number;

export type RtpRoleId = "potato" | "chili" | "pumpkin" | "tomato" | "peapod" | "mushroom";
export type SharedRtpRoleId = "potato" | "chili" | "pumpkin" | "mushroom";
export type AbilityRolls = number | Partial<Record<RtpRoleId, number>>;
export type SettlementOutcome = "neutral" | "bonus";
export type SettlementResult = {
  payout: number;
  note: string;
  outcome: SettlementOutcome;
  triggeredRoleIds: RtpRoleId[];
};
export type RtpWager = { roleId: RtpRoleId; stake: number; target: number };

export const ROLE_MATH: Readonly<Record<RtpRoleId, Readonly<Record<string, number>>>>;
export const SHARED_ROLE_IDS: readonly SharedRtpRoleId[];
export function crashPointFromUnit(unit: number, baseRtp?: number): number;
export function survivalAt(multiplier: number, baseRtp?: number): number;
export function settleSuccessfulCashout(roleId: RtpRoleId, stake: number, multiplier: number, rolls: AbilityRolls, roundRoleIds?: RtpRoleId[]): SettlementResult;
export function settleCrashRole(roleId: RtpRoleId, remainingStake: number, rolls: AbilityRolls, roundRoleIds?: RtpRoleId[]): SettlementResult;
export function expectedSuccessfulPayout(roleId: RtpRoleId, stake: number, multiplier: number, roundRoleIds?: RtpRoleId[]): number;
export function expectedCrashPayout(roleId: RtpRoleId, stake: number, roundRoleIds?: RtpRoleId[]): number;
export function expectedRoundReturn(wagers: RtpWager[], baseRtp: number): number;
export function calibrateRoundBaseRtp(wagers: RtpWager[]): number;
