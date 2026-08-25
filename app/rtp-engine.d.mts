export const TARGET_RTP: number;
export const MAX_SETTLEMENT_MULTIPLIER: number;

export type RtpRoleId =
  | "potato"
  | "chili"
  | "pumpkin"
  | "tomato"
  | "eggplant"
  | "cauliflower"
  | "corn"
  | "okra"
  | "mushroom"
  | "peas";

export type SettlementOutcome = "neutral" | "bonus";
export type SettlementResult = { payout: number; note: string; outcome: SettlementOutcome };
export type RtpWager = { roleId: RtpRoleId; stake: number; target: number };

export const ROLE_MATH: Readonly<Record<RtpRoleId, Readonly<Record<string, number>>>>;
export function crashPointFromUnit(unit: number, baseRtp?: number): number;
export function survivalAt(multiplier: number, baseRtp?: number): number;
export function settleSuccessfulCashout(roleId: RtpRoleId, stake: number, multiplier: number, roll: number): SettlementResult;
export function settleCrashRole(roleId: RtpRoleId, remainingStake: number, roll: number): SettlementResult;
export function pairProfitFactor(kind: "okra" | "peas", roll: number): { factor: number; outcome: SettlementOutcome; note: string };
export function expectedSuccessfulPayout(roleId: RtpRoleId, stake: number, multiplier: number): number;
export function expectedCrashPayout(roleId: RtpRoleId, stake: number): number;
export function expectedRoundReturn(wagers: RtpWager[], baseRtp: number): number;
export function calibrateRoundBaseRtp(wagers: RtpWager[]): number;
