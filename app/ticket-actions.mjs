export function canEditUnplacedTicket(ticket) {
  return Boolean(ticket && !ticket.placed);
}

export function bettingWindowOpen(phase, roundReady, now, deadline) {
  return phase === "betting" && roundReady && deadline > 0 && now < deadline;
}

export function canStartRoundEarly(phase, roundReady, placedCount, now, deadline) {
  return placedCount > 0 && bettingWindowOpen(phase, roundReady, now, deadline);
}

export function isAutoCashInputDraft(value) {
  return /^\d*(?:[.,]\d{0,2})?$/.test(value);
}

export function normalizeAutoCashInput(value, min, max, fallback) {
  const input = String(value).trim();
  const parsed = input ? Number(input.replace(",", ".")) : Number.NaN;
  const resolved = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, Math.round(resolved * 100) / 100));
}

// A pending bet is reversible; a running bet is never refunded by this action.
// Repeated calls see placed=false and therefore cannot credit a second refund.
export function cancelPendingBet({ tickets, balance, index, phase, now, deadline }) {
  const unchanged = { tickets, balance, refund: 0, cancelledIndexes: [] };
  if (!bettingWindowOpen(phase, true, now, deadline)) return unchanged;
  const selected = tickets[index];
  if (!selected?.placed || selected.status !== "placed") return unchanged;
  const cancelledIndexes = [index];
  const refund = cancelledIndexes.reduce((sum, ticketIndex) => sum + tickets[ticketIndex].amount, 0);
  const nextTickets = tickets.map((ticket, ticketIndex) => cancelledIndexes.includes(ticketIndex) ? {
    ...ticket,
    placed: false,
    status: "idle",
    payout: 0,
    cashAt: null,
    remaining: 1,
    autoRoleTarget: null,
    note: "",
  } : ticket);
  return { tickets: nextTickets, balance: balance + refund, refund, cancelledIndexes };
}
