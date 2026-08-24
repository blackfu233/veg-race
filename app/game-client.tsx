"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Phase = "betting" | "running" | "crashed";
type TicketStatus = "idle" | "placed" | "running" | "cashed" | "lost" | "refunded";
type RoleId =
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

type Role = {
  id: RoleId;
  name: string;
  en: string;
  tag: "痛點" | "低 VI" | "VI" | "高 VI" | "雙注";
  short: string;
  detail: string;
  risk: number;
  sprite: number;
  accent: string;
};

type Ticket = {
  enabled: boolean;
  amount: number;
  roleId: RoleId;
  status: TicketStatus;
  placed: boolean;
  payout: number;
  cashAt: number | null;
  remaining: number;
  autoBet: boolean;
  autoCash: number | null;
  eggplantTarget: number | null;
  note: string;
};

type RoundSpec = {
  seed: string;
  commitment: string;
  crashPoint: number;
};

const roles: Role[] = [
  { id: "potato", name: "馬鈴薯", en: "POTATO", tag: "VI", short: "低倍雙利", detail: "低倍率成功 Cash Out，有機會獲得雙倍利潤。", risk: 2, sprite: 0, accent: "#f0b55b" },
  { id: "chili", name: "辣椒", en: "CHILI", tag: "高 VI", short: "高倍雙利", detail: "高倍率成功 Cash Out，有機會獲得雙倍利潤。", risk: 5, sprite: 1, accent: "#ff5a4f" },
  { id: "pumpkin", name: "南瓜", en: "PUMPKIN", tag: "痛點", short: "爆掉返本", detail: "爆掉時，有機會拿回尚未結算的本金。", risk: 1, sprite: 2, accent: "#ff9d3d" },
  { id: "tomato", name: "番茄", en: "TOMATO", tag: "低 VI", short: "穩定加成", detail: "成功 Cash Out，固定獲得額外利潤。", risk: 2, sprite: 3, accent: "#ff6358" },
  { id: "eggplant", name: "茄子", en: "EGGPLANT", tag: "VI", short: "隨機兌現", detail: "不能手動，在 2×～5× 隨機 Cash Out；成功有額外利潤。", risk: 4, sprite: 4, accent: "#b66cff" },
  { id: "cauliflower", name: "花椰菜", en: "CAULIFLOWER", tag: "痛點", short: "分批兌現", detail: "可以先 Cash Out 一半，剩下一半繼續跑。", risk: 2, sprite: 5, accent: "#e9e8c9" },
  { id: "corn", name: "玉米", en: "CORN", tag: "高 VI", short: "雙倍或歸零", detail: "成功時本金落袋，但利潤隨機雙倍或歸零。", risk: 5, sprite: 6, accent: "#ffd447" },
  { id: "okra", name: "秋葵", en: "OKRA", tag: "雙注", short: "一勝一敗", detail: "一注成功、一注爆掉時，成功注獲得對沖獎勵。", risk: 3, sprite: 7, accent: "#70d858" },
  { id: "mushroom", name: "蘑菇", en: "MUSHROOM", tag: "高 VI", short: "稀有大獎", detail: "成功 Cash Out 時，有極低機率觸發高額 Jackpot。", risk: 5, sprite: 8, accent: "#d9b28a" },
  { id: "peas", name: "雙子豌豆", en: "TWIN PEAS", tag: "雙注", short: "雙注成功", detail: "兩注都成功 Cash Out，兩注一起獲得額外利潤。", risk: 3, sprite: 9, accent: "#76e46d" },
];

const roleById = Object.fromEntries(roles.map((role) => [role.id, role])) as Record<RoleId, Role>;

function blankTicket(index: number): Ticket {
  return {
    enabled: true,
    amount: 100,
    roleId: index === 0 ? "potato" : "chili",
    status: "idle",
    placed: false,
    payout: 0,
    cashAt: null,
    remaining: 1,
    autoBet: false,
    autoCash: null,
    eggplantTarget: null,
    note: "",
  };
}

function money(value: number) {
  return Math.max(0, value).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

async function digestHex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function makeRoundSpec(): Promise<RoundSpec> {
  const seed = crypto.randomUUID();
  const commitment = await digestHex(seed);
  const crashHash = await digestHex(seed + ":crash");
  const unit = Number.parseInt(crashHash.slice(0, 13), 16) / 0x10000000000000;
  const raw = Math.max(1, 0.97 / Math.max(0.000001, 1 - unit));
  return { seed, commitment, crashPoint: Math.min(100, Math.floor(raw * 100) / 100) };
}

function Sprite({ roleId, className = "" }: { roleId: RoleId; className?: string }) {
  const role = roleById[roleId];
  const col = role.sprite % 5;
  const row = Math.floor(role.sprite / 5);
  const style = {
    "--sprite-x": `${col * 25}%`,
    "--sprite-y": `${row * 100}%`,
  } as CSSProperties;
  return <div className={`veg-sprite ${className}`} style={style} aria-label={role.name} />;
}

export default function GameClient() {
  const [phase, setPhase] = useState<Phase>("betting");
  const [countdown, setCountdown] = useState(8);
  const [multiplier, setMultiplier] = useState(1);
  const [balance, setBalance] = useState(10000);
  const [tickets, setTickets] = useState<Ticket[]>([blankTicket(0), blankTicket(1)]);
  const [roundNo, setRoundNo] = useState(1);
  const [roundSpec, setRoundSpec] = useState<RoundSpec | null>(null);
  const [history, setHistory] = useState<number[]>([1.08, 2.41, 8.76, 1.22, 3.19, 1.01, 12.44]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [fairOpen, setFairOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState<{ title: string; body: string; tone: "good" | "bad" | "gold" } | null>(null);

  const ticketsRef = useRef(tickets);
  const balanceRef = useRef(balance);
  const phaseRef = useRef<Phase>(phase);
  const roundSpecRef = useRef<RoundSpec | null>(roundSpec);
  const runStartRef = useRef(0);
  const bonusFlagsRef = useRef({ peas: false, okra: false });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { ticketsRef.current = tickets; }, [tickets]);
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { roundSpecRef.current = roundSpec; }, [roundSpec]);

  useEffect(() => {
    const saved = localStorage.getItem("veggie-dash-balance");
    const timer = setTimeout(() => {
      if (saved && Number.isFinite(Number(saved))) setBalance(Number(saved));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem("veggie-dash-balance", String(balance));
  }, [balance]);

  const showToast = useCallback((title: string, body: string, tone: "good" | "bad" | "gold" = "good") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ title, body, tone });
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const tone = useCallback((frequency: number, duration = 0.09) => {
    if (muted || typeof window === "undefined") return;
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  }, [muted]);

  const updateTicket = useCallback((index: number, updater: (ticket: Ticket) => Ticket) => {
    setTickets((current) => current.map((ticket, ticketIndex) => ticketIndex === index ? updater(ticket) : ticket));
  }, []);

  const placeBet = useCallback((index: number) => {
    const ticket = ticketsRef.current[index];
    if (phaseRef.current !== "betting" || !ticket.enabled || ticket.placed) return;
    if (balanceRef.current < ticket.amount) {
      showToast("籌碼不足", "降低下注金額再試一次", "bad");
      tone(180, 0.15);
      return;
    }
    setBalance((value) => value - ticket.amount);
    updateTicket(index, (current) => ({
      ...current,
      placed: true,
      status: "placed",
      payout: 0,
      cashAt: null,
      remaining: 1,
      note: "",
      eggplantTarget: current.roleId === "eggplant" ? 2 + Math.random() * 3 : null,
    }));
    showToast(`下注 ${index + 1} 已鎖定`, `${roleById[ticket.roleId].name} · ${money(ticket.amount)} 籌碼`, "good");
    tone(520);
  }, [showToast, tone, updateTicket]);

  const applyPeasBonus = useCallback((next: Ticket[]) => {
    if (bonusFlagsRef.current.peas) return next;
    const liveTickets = next.filter((ticket) => ticket.enabled && ticket.placed);
    const hasPeas = liveTickets.some((ticket) => ticket.roleId === "peas");
    if (!hasPeas || liveTickets.length !== 2 || !liveTickets.every((ticket) => ticket.status === "cashed")) return next;
    bonusFlagsRef.current.peas = true;
    let totalBonus = 0;
    const withBonus = next.map((ticket) => {
      if (!ticket.enabled || !ticket.placed || ticket.status !== "cashed") return ticket;
      const profit = Math.max(0, ticket.payout - ticket.amount);
      const bonus = profit * 0.12;
      totalBonus += bonus;
      return { ...ticket, payout: ticket.payout + bonus, note: "雙子豌豆：雙注成功加成" };
    });
    if (totalBonus > 0) {
      setBalance((value) => value + totalBonus);
      showToast("雙子豌豆觸發！", `雙注成功 +${money(totalBonus)}`, "gold");
      tone(880, 0.18);
    }
    return withBonus;
  }, [showToast, tone]);

  const cashOut = useCallback((index: number, at: number, forceFull = false) => {
    if (phaseRef.current !== "running") return;
    setTickets((currentTickets) => {
      const current = currentTickets[index];
      if (!current || current.status !== "running" || current.remaining <= 0) return currentTickets;
      if (current.roleId === "eggplant" && !forceFull) {
        showToast("茄子拒絕手動操作", "它會在秘密倍率自動 Cash Out", "bad");
        tone(210);
        return currentTickets;
      }

      const isHalf = current.roleId === "cauliflower" && current.remaining > 0.5 && !forceFull;
      const portion = isHalf ? 0.5 : current.remaining;
      const stake = current.amount * portion;
      let profit = Math.max(0, stake * (at - 1));
      let note = isHalf ? "花椰菜：已兌現一半" : "";
      let skillTone: "good" | "gold" = "good";

      if (current.roleId === "potato" && at < 2 && Math.random() < 0.28) {
        profit *= 2;
        note = "馬鈴薯：低倍雙利！";
        skillTone = "gold";
      }
      if (current.roleId === "chili" && at >= 5 && Math.random() < 0.34) {
        profit *= 2;
        note = "辣椒：高倍雙利！";
        skillTone = "gold";
      }
      if (current.roleId === "tomato") {
        profit *= 1.08;
        note = "番茄：穩定利潤加成";
      }
      if (current.roleId === "eggplant") {
        profit *= 1.15;
        note = "茄子：隨機兌現加成";
      }
      if (current.roleId === "corn") {
        const doubled = Math.random() < 0.5;
        profit = doubled ? profit * 2 : 0;
        note = doubled ? "玉米：利潤雙倍！" : "玉米：利潤歸零";
        skillTone = doubled ? "gold" : "good";
      }
      if (current.roleId === "mushroom" && Math.random() < 0.045) {
        profit *= 8;
        note = "蘑菇：JACKPOT ×8！";
        skillTone = "gold";
      }

      const paid = stake + profit;
      setBalance((value) => value + paid);
      const next = currentTickets.map((ticket, ticketIndex) => {
        if (ticketIndex !== index) return ticket;
        const remaining = Math.max(0, ticket.remaining - portion);
        return {
          ...ticket,
          payout: ticket.payout + paid,
          cashAt: at,
          remaining,
          status: remaining > 0 ? "running" as const : "cashed" as const,
          note,
        };
      });

      if (note) showToast(note, `下注 ${index + 1} +${money(paid)}`, skillTone);
      else showToast(`下注 ${index + 1} Cash Out`, `${at.toFixed(2)}× · +${money(paid)}`, "good");
      tone(skillTone === "gold" ? 930 : 720, 0.13);
      return applyPeasBonus(next);
    });
  }, [applyPeasBonus, showToast, tone]);

  const settleCrash = useCallback((crashPoint: number) => {
    setTickets((currentTickets) => {
      let refundCredit = 0;
      const settled = currentTickets.map((ticket) => {
        if (!ticket.enabled || !ticket.placed || ticket.status !== "running" || ticket.remaining <= 0) return ticket;
        const refundableStake = ticket.amount * ticket.remaining;
        if (ticket.roleId === "pumpkin" && Math.random() < 0.2) {
          refundCredit += refundableStake;
          return {
            ...ticket,
            status: "refunded" as const,
            remaining: 0,
            payout: ticket.payout + refundableStake,
            note: "南瓜：爆掉返本！",
          };
        }
        return { ...ticket, status: "lost" as const, remaining: 0, note: `爆點 ${crashPoint.toFixed(2)}×` };
      });

      if (refundCredit > 0) {
        setBalance((value) => value + refundCredit);
        showToast("南瓜復活！", `返還本金 +${money(refundCredit)}`, "gold");
        tone(840, 0.22);
      }

      if (!bonusFlagsRef.current.okra) {
        const played = settled.filter((ticket) => ticket.enabled && ticket.placed);
        const hasOkra = played.some((ticket) => ticket.roleId === "okra");
        const winners = played.filter((ticket) => ticket.status === "cashed");
        const losers = played.filter((ticket) => ticket.status === "lost" || ticket.status === "refunded");
        if (hasOkra && played.length === 2 && winners.length === 1 && losers.length === 1) {
          bonusFlagsRef.current.okra = true;
          const winnerIndex = settled.indexOf(winners[0]);
          const profit = Math.max(0, winners[0].payout - winners[0].amount);
          const bonus = profit * 0.2;
          if (bonus > 0) {
            settled[winnerIndex] = { ...settled[winnerIndex], payout: settled[winnerIndex].payout + bonus, note: "秋葵：一勝一敗對沖獎勵" };
            setBalance((value) => value + bonus);
            showToast("秋葵對沖！", `成功注 +${money(bonus)}`, "gold");
            tone(760, 0.18);
          }
        }
      }
      return settled;
    });
  }, [showToast, tone]);

  const beginRound = useCallback(() => {
    bonusFlagsRef.current = { peas: false, okra: false };
    setMultiplier(1);
    setCountdown(8);
    setPhase("betting");
    setRoundNo((value) => value + 1);
    setTickets((current) => current.map((ticket) => ({
      ...ticket,
      status: "idle",
      placed: false,
      payout: 0,
      cashAt: null,
      remaining: 1,
      eggplantTarget: null,
      note: "",
    })));
  }, []);

  useEffect(() => {
    let cancelled = false;
    makeRoundSpec().then((spec) => {
      if (!cancelled) setRoundSpec(spec);
    });
    return () => { cancelled = true; };
  }, [roundNo]);

  useEffect(() => {
    if (phase !== "betting") return;
    const timer = setInterval(() => {
      setCountdown((value) => Math.max(0, value - 0.1));
    }, 100);
    return () => clearInterval(timer);
  }, [phase, roundNo]);

  useEffect(() => {
    if (phase !== "betting" || countdown > 0) return;
    const timer = setTimeout(() => {
      runStartRef.current = performance.now();
      setMultiplier(1);
      setPhase("running");
      setTickets((current) => current.map((ticket) => ticket.enabled && ticket.placed ? { ...ticket, status: "running" } : ticket));
      tone(430, 0.16);
    }, 0);
    return () => clearTimeout(timer);
  }, [countdown, phase, tone]);

  useEffect(() => {
    if (phase !== "betting") return;
    const timer = setTimeout(() => {
      ticketsRef.current.forEach((ticket, index) => {
        if (ticket.enabled && ticket.autoBet && !ticket.placed) placeBet(index);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [phase, roundNo, placeBet]);

  useEffect(() => {
    if (phase !== "running") return;
    let frame = 0;
    const tick = (now: number) => {
      if (phaseRef.current !== "running") return;
      const elapsed = Math.max(0, now - runStartRef.current) / 1000;
      const nextMultiplier = Math.exp(elapsed / 5.2);
      const crashPoint = roundSpecRef.current?.crashPoint ?? 2.5;
      if (nextMultiplier >= crashPoint) {
        setMultiplier(crashPoint);
        setPhase("crashed");
        setHistory((current) => [crashPoint, ...current].slice(0, 12));
        settleCrash(crashPoint);
        tone(120, 0.35);
        return;
      }
      setMultiplier(nextMultiplier);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, settleCrash, tone]);

  useEffect(() => {
    if (phase !== "running") return;
    tickets.forEach((ticket, index) => {
      if (ticket.status !== "running") return;
      const target = ticket.roleId === "eggplant" ? ticket.eggplantTarget : ticket.autoCash;
      if (target && multiplier >= target) cashOut(index, target, true);
    });
  }, [cashOut, multiplier, phase, tickets]);

  useEffect(() => {
    if (phase !== "crashed") return;
    const timer = setTimeout(beginRound, 3200);
    return () => clearTimeout(timer);
  }, [beginRound, phase]);

  const placedCount = tickets.filter((ticket) => ticket.enabled && ticket.placed).length;
  const runningCount = tickets.filter((ticket) => ticket.status === "running").length;

  const stageMessage = useMemo(() => {
    if (phase === "betting") return placedCount ? `${placedCount} 注已鎖定，準備開跑` : "選擇角色並在倒數前下注";
    if (phase === "crashed") return `爆點 ${multiplier.toFixed(2)}×`;
    if (!runningCount) return "本局已完成結算";
    return "在收割者追上前 Cash Out！";
  }, [multiplier, phase, placedCount, runningCount]);

  const stageProgress = phase === "betting"
    ? Math.max(4, ((8 - countdown) / 8) * 100)
    : phase === "crashed"
      ? 100
      : Math.min(96, 12 + Math.log(Math.max(1, multiplier)) * 34);

  const chooseRole = (ticketIndex: number, roleId: RoleId) => {
    const ticket = ticketsRef.current[ticketIndex];
    if (phase !== "betting" || ticket.placed) return;
    updateTicket(ticketIndex, (current) => ({
      ...current,
      roleId,
      autoCash: roleId === "eggplant" ? null : current.autoCash,
    }));
    tone(650);
  };

  const changeStake = (ticketIndex: number, delta: number) => {
    if (phase !== "betting" || ticketsRef.current[ticketIndex].placed) return;
    updateTicket(ticketIndex, (ticket) => ({ ...ticket, amount: Math.max(10, Math.min(5000, ticket.amount + delta)) }));
  };

  const toggleAutoCash = (ticketIndex: number) => {
    const ticket = ticketsRef.current[ticketIndex];
    if (phase !== "betting" || ticket.placed || ticket.roleId === "eggplant") return;
    updateTicket(ticketIndex, (current) => ({ ...current, autoCash: current.autoCash ? null : 2 }));
  };

  const ticketAction = (ticketIndex: number) => {
    if (phase === "betting") placeBet(ticketIndex);
    else if (phase === "running") cashOut(ticketIndex, multiplier);
  };

  const ticketActionLabel = (ticket: Ticket) => {
    if (phase === "betting") return ticket.placed ? "LOCKED" : "BET";
    if (phase === "crashed") {
      if (ticket.status === "cashed") return `WIN ${money(ticket.payout)}`;
      if (ticket.status === "refunded") return "REFUNDED";
      return "NEXT ROUND";
    }
    if (!ticket.placed) return "NO BET";
    if (ticket.status === "cashed") return `WIN ${money(ticket.payout)}`;
    if (ticket.roleId === "eggplant") return "AUTO CASHOUT";
    if (ticket.status !== "running") return "SETTLED";
    return ticket.roleId === "cauliflower" && ticket.remaining === 1
      ? `CASH 50% · ${money(ticket.amount * .5 * multiplier)}`
      : `CASH OUT · ${money(ticket.amount * ticket.remaining * multiplier)}`;
  };

  const ticketActionDisabled = (ticket: Ticket) =>
    (phase === "betting" && ticket.placed) ||
    phase === "crashed" ||
    (phase === "running" && ticket.status !== "running") ||
    (phase === "running" && ticket.roleId === "eggplant");

  return (
    <main className="game-shell">
      <section className={`game-phone phase-${phase}`} aria-label="蔬菜跑跑 Crash Game Demo">
        <section className="race-stage">
          <div className="history-strip" aria-label="最近爆點">
            {history.slice(0, 6).map((value, index) => <span className={value >= 10 ? "mega" : value >= 5 ? "hot" : value < 1.2 ? "cold" : ""} key={index}>{value.toFixed(2)}×</span>)}
            <b>•••</b>
          </div>
          <button className="menu-button" aria-label="遊戲選單" onClick={() => setRulesOpen(true)}><i /><i /><i /></button>

          <div className="round-display">
            <strong>{phase === "betting" ? "Betting..." : phase === "running" ? "Run!" : "Caught!"}</strong>
            <span>{phase === "betting" ? Math.ceil(countdown) : `${multiplier.toFixed(2)}×`}</span>
            <small>{phase === "betting" ? `ROUND ${roundNo} · ${placedCount}/2 BETS` : stageMessage}</small>
          </div>

          <div className="vertical-meters" aria-label={`雙注進度 ${Math.round(stageProgress)}%`}>
            {tickets.map((ticket, index) => (
              <div className={`meter-unit meter-${index + 1}`} key={index}>
                <Sprite roleId={ticket.roleId} className="meter-sprite" />
                <div className="vertical-meter">
                  <span style={{ height: `${stageProgress}%` }} />
                  <i /><i /><i /><i />
                </div>
              </div>
            ))}
          </div>

          <div className="road-runners">
            {tickets.map((ticket, index) => ticket.enabled && (ticket.placed || phase === "betting") && (
              <div
                className={`road-runner runner-${index + 1} status-${ticket.status}`}
                style={{ "--runner-progress": phase === "running" ? stageProgress : phase === "crashed" ? 100 : 0 } as CSSProperties}
                key={index}
              >
                <Sprite roleId={ticket.roleId} className="runner-sprite" />
                <b>{index + 1}</b>
              </div>
            ))}
          </div>
          <div className="pursuers" aria-hidden="true"><i /><i /></div>
          <button className="fair-link" onClick={() => setFairOpen(true)}>FAIR ✓</button>
        </section>

        <section className="bet-zone">
          {tickets.map((ticket, ticketIndex) => {
            const role = roleById[ticket.roleId];
            const canEdit = phase === "betting" && !ticket.placed;
            return (
              <article className={`bet-card ${ticket.placed ? "is-placed" : ""}`} key={ticketIndex}>
                <div className="character-grid" aria-label={`下注 ${ticketIndex + 1} 選擇角色`}>
                  {roles.map((option) => (
                    <button
                      className={ticket.roleId === option.id ? "selected" : ""}
                      disabled={!canEdit}
                      onClick={() => chooseRole(ticketIndex, option.id)}
                      title={`${option.name}：${option.short}`}
                      key={option.id}
                    >
                      <Sprite roleId={option.id} />
                    </button>
                  ))}
                </div>

                <div className="role-info">
                  <strong>{role.name}</strong>
                  <span>{role.short}</span>
                  <p>{role.detail}</p>
                </div>

                <div className="amount-stepper">
                  <button disabled={!canEdit} onClick={() => changeStake(ticketIndex, -50)}>−</button>
                  <strong>{money(ticket.amount)}</strong>
                  <button disabled={!canEdit} onClick={() => changeStake(ticketIndex, 50)}>＋</button>
                </div>

                <button
                  className={`bet-action ${phase === "running" && ticket.status === "running" ? "cash-mode" : ""}`}
                  disabled={ticketActionDisabled(ticket)}
                  onClick={() => ticketAction(ticketIndex)}
                >
                  {ticketActionLabel(ticket)}
                </button>

                <div className="card-options">
                  <div className="option-control">
                    <span>AUTO</span>
                    <button
                      className={`toggle ${ticket.autoBet ? "on" : ""}`}
                      disabled={!canEdit}
                      aria-label={`下注 ${ticketIndex + 1} 自動下注`}
                      onClick={() => updateTicket(ticketIndex, (current) => ({ ...current, autoBet: !current.autoBet }))}
                    ><i /></button>
                  </div>
                  <div className="option-control">
                    <span>AUTO CASHOUT {ticket.roleId === "eggplant" ? "RANDOM" : ticket.autoCash ? `${ticket.autoCash.toFixed(2)}×` : ""}</span>
                    <button
                      className={`toggle ${ticket.autoCash || ticket.roleId === "eggplant" ? "on" : ""}`}
                      disabled={!canEdit || ticket.roleId === "eggplant"}
                      aria-label={`下注 ${ticketIndex + 1} 自動 Cash Out`}
                      onClick={() => toggleAutoCash(ticketIndex)}
                    ><i /></button>
                  </div>
                </div>

                {ticket.note && <div className="ticket-note">{ticket.note}</div>}
              </article>
            );
          })}
        </section>

        <footer className="account-bar">
          <span className="player-avatar">V</span>
          <small>1787557890862508</small>
          <strong>BALANCE: {money(balance)}</strong>
          <button aria-label={muted ? "開啟音效" : "關閉音效"} onClick={() => setMuted((value) => !value)}>{muted ? "◌" : "◉"}</button>
        </footer>

        {toast && <div className={`game-toast ${toast.tone}`}><strong>{toast.title}</strong><span>{toast.body}</span></div>}

        {rulesOpen && (
          <div className="sheet-backdrop">
            <button className="backdrop-dismiss" aria-label="關閉遊戲說明" onClick={() => setRulesOpen(false)} />
            <section className="info-sheet">
              <div className="sheet-handle" />
              <header><div><small>HOW TO PLAY</small><h2>蔬菜跑跑</h2></div><button onClick={() => setRulesOpen(false)}>×</button></header>
              <div className="rule-steps">
                <article><b>01</b><div><strong>8 秒選角下注</strong><span>最多同時兩注，兩注角色與金額可不同。</span></div></article>
                <article><b>02</b><div><strong>倍率持續成長</strong><span>角色越跑越遠，派彩由 1.00× 不斷上升。</span></div></article>
                <article><b>03</b><div><strong>被抓前 Cash Out</strong><span>成功取得下注額 × 當下倍率；爆掉則失去未結算部位。</span></div></article>
              </div>
              <div className="demo-note">此版本只使用虛擬籌碼，角色機率為遊戲體驗展示值。</div>
              <button className="sheet-primary" onClick={() => setRulesOpen(false)}>開始遊戲</button>
            </section>
          </div>
        )}

        {fairOpen && (
          <div className="sheet-backdrop">
            <button className="backdrop-dismiss" aria-label="關閉公平性說明" onClick={() => setFairOpen(false)} />
            <section className="info-sheet fair-sheet">
              <div className="sheet-handle" />
              <header><div><small>PROVABLY FAIR DEMO</small><h2>本局公平性</h2></div><button onClick={() => setFairOpen(false)}>×</button></header>
              <span className="field-label">開局承諾 Hash</span>
              <code>{roundSpec?.commitment ?? "Generating…"}</code>
              <span className="field-label">Server Seed</span>
              <code>{phase === "crashed" ? roundSpec?.seed : "本局結束後公開"}</code>
              <p>Demo 以本局 Seed 的 SHA-256 結果產生爆點。開局先顯示承諾 Hash，結束後公開 Seed。</p>
              <button className="sheet-primary" onClick={() => setFairOpen(false)}>完成</button>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
