export function canEditUnplacedTicket(ticket: { placed: boolean } | undefined): boolean;
export function bettingWindowOpen(phase: string, roundReady: boolean, now: number, deadline: number): boolean;
export function cancelPendingBet<T extends { placed: boolean; status: string; amount: number }>(args: {
  tickets: T[];
  balance: number;
  index: number;
  phase: string;
  parlayMode: boolean;
  now: number;
  deadline: number;
}): { tickets: T[]; balance: number; refund: number; cancelledIndexes: number[] };
