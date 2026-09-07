export function canEditUnplacedTicket(ticket) {
  return Boolean(ticket && !ticket.placed);
}

export function bettingWindowOpen(phase, roundReady, now, deadline) {
  return phase === "betting" && roundReady && deadline > 0 && now < deadline;
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
    linkAwarded: false,
    note: "",
  } : ticket);
  return { tickets: nextTickets, balance: balance + refund, refund, cancelledIndexes };
}
