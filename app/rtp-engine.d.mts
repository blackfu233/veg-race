export const TARGET_RTP: number;
export const MAX_SETTLEMENT_MULTIPLIER: number;

export type RtpRoleId = "potato" | "chili" | "pumpkin" | "tomato" | "peapod" | "mushroom";
export type AbilityRolls = number | Partial<Record<RtpRoleId, number>>;
export type SettlementResult = { payout: number; note: string; outcome: "neutral" | "bonus"; triggeredRoleIds: RtpRoleId[] };
export type RtpWager = { roleId: RtpRoleId; stake: number; target: number };
export type DuoTicket = { roleId: RtpRoleId; stake: number; cashAt: number | null; payout: number; status: string; placed?: boolean; linkAwarded?: boolean };
export type DuoDescription = { key: string; title: string; badge: string; shortSummary: string; summary: string; roleDetails: string[] };
export type DuoSettlement = { extras: number[]; total: number; note: string; triggered: boolean; description: DuoDescription | null };

export const ROLE_MATH: Readonly<Record<RtpRoleId, Readonly<Record<string, number>>>>;
export const ROLE_NAMES: Readonly<Record<RtpRoleId, string>>;
export function describeDuoPair(roleIds: RtpRoleId[]): DuoDescription;
export function crashPointFromUnit(unit: number, baseRtp?: number): number;
export function survivalAt(multiplier: number, baseRtp?: number): number;
export function settleSuccessfulCashout(roleId: RtpRoleId, stake: number, multiplier: number, rolls: AbilityRolls, roundRoleIds?: RtpRoleId[]): SettlementResult;
export function settleCrashRole(): SettlementResult;
export function settleDuoLink(tickets: DuoTicket[]): DuoSettlement;
export function expectedSuccessfulPayout(roleId: RtpRoleId, stake: number, multiplier: number, roundRoleIds?: RtpRoleId[]): number;
export function expectedCrashPayout(): number;
export function expectedRoundReturn(wagers: RtpWager[], baseRtp: number): number;
export function calibrateRoundBaseRtp(wagers: RtpWager[]): number;
