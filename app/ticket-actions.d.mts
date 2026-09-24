export function canEditUnplacedTicket(ticket: { placed: boolean } | undefined): boolean;
export function bettingWindowOpen(phase: string, roundReady: boolean, now: number, deadline: number): boolean;
export function canStartRoundEarly(phase: string, roundReady: boolean, placedCount: number, now: number, deadline: number): boolean;
export function isAutoCashInputDraft(value: string): boolean;
export function normalizeAutoCashInput(value: string | number, min: number, max: number, fallback: number): number;
export function cancelPendingBet<T extends { placed: boolean; status: string; amount: number }>(args: {
  tickets: T[];
  balance: number;
  index: number;
  phase: string;
  now: number;
  deadline: number;
}): { tickets: T[]; balance: number; refund: number; cancelledIndexes: number[] };
