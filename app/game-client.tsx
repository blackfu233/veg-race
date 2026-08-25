"use client";

import Image from "next/image";
import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CanvasRunner from "./canvas-runner";
import {
  calibrateRoundBaseRtp,
  crashPointFromUnit,
  MAX_SETTLEMENT_MULTIPLIER,
  pairProfitFactor,
  settleCrashRole,
  settleSuccessfulCashout,
  TARGET_RTP,
} from "./rtp-engine.mjs";

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
  short: string;
  detail: string;
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
  autoCashTarget: number;
  eggplantTarget: number | null;
  note: string;
};

type RoundSpec = {
  seed: string;
  commitment: string;
  crashUnit: number;
  baseRtp: number;
  crashPoint: number;
  comboRoll: number;
  abilityRolls: Array<{ bonus: number; target: number }>;
};

const roles: Role[] = [
  { id: "potato", name: "馬鈴薯", short: "2× 前拚雙倍", detail: "2× 前 Cash Out，28% 機率整筆派彩雙倍。", accent: "#f0b55b" },
  { id: "chili", name: "辣椒", short: "5× 後拚雙倍", detail: "5× 後 Cash Out，34% 機率整筆派彩雙倍。", accent: "#ff5a4f" },
  { id: "pumpkin", name: "南瓜", short: "爆掉有機會返本", detail: "爆掉時，5% 機率拿回全部本金。", accent: "#ff9d3d" },
  { id: "tomato", name: "番茄", short: "成功固定加成", detail: "成功 Cash Out，整筆派彩固定加 8%。", accent: "#ff6358" },
  { id: "eggplant", name: "茄子", short: "2×～5× 自動兌現", detail: "不能手動；2×～5× 自動 Cash Out，成功派彩加 15%。", accent: "#b66cff" },
  { id: "cauliflower", name: "花椰菜", short: "一注分兩次拿", detail: "先 Cash Out 一半，另一半繼續跑；派彩加 6.67%。", accent: "#e9e8c9" },
  { id: "corn", name: "玉米", short: "成功拚雙倍", detail: "成功 Cash Out，50% 機率整筆派彩雙倍。", accent: "#ffd447" },
  { id: "okra", name: "秋葵", short: "一勝一敗有加成", detail: "雙注一勝一敗時，50% 機率讓成功注利潤加 40%。", accent: "#70d858" },
  { id: "mushroom", name: "蘑菇", short: "小機率中 8 倍", detail: "成功 Cash Out，4.5% 機率整筆派彩變 8 倍。", accent: "#d9b28a" },
  { id: "peas", name: "雙子豌豆", short: "雙注成功有加成", detail: "兩注都成功時，50% 機率讓兩注利潤各加 24%。", accent: "#76e46d" },
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
    autoCashTarget: 2,
    eggplantTarget: null,
    note: "",
  };
}

function ticketStrategyTarget(ticket: Ticket) {
  return ticket.roleId === "eggplant" && ticket.eggplantTarget
    ? ticket.eggplantTarget
    : ticket.autoCashTarget;
}

function ticketsToRtpWagers(tickets: Ticket[]) {
  return tickets
    .filter((ticket) => ticket.enabled && ticket.placed)
    .map((ticket) => ({ roleId: ticket.roleId, stake: ticket.amount, target: ticketStrategyTarget(ticket) }));
}

function money(value: number) {
  return Math.max(0, value).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function historyTier(value: number) {
  if (value >= 50) return "legendary";
  if (value >= 20) return "epic";
  if (value >= 10) return "mega";
  if (value >= 5) return "hot";
  if (value >= 2) return "warm";
  if (value < 1.2) return "cold";
  return "";
}

async function digestHex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function makeRoundSpec(): Promise<RoundSpec> {
  const seed = crypto.randomUUID();
  const [commitment, crashHash, comboHash, ...abilityHashes] = await Promise.all([
    digestHex(seed),
    digestHex(seed + ":crash"),
    digestHex(seed + ":combo"),
    digestHex(seed + ":ticket:0:bonus"),
    digestHex(seed + ":ticket:0:target"),
    digestHex(seed + ":ticket:1:bonus"),
    digestHex(seed + ":ticket:1:target"),
  ]);
  const crashUnit = Number.parseInt(crashHash.slice(0, 13), 16) / 0x10000000000000;
  const comboRoll = Number.parseInt(comboHash.slice(0, 13), 16) / 0x10000000000000;
  const abilityRolls = [0, 1].map((index) => ({
    bonus: Number.parseInt(abilityHashes[index * 2].slice(0, 13), 16) / 0x10000000000000,
    target: Number.parseInt(abilityHashes[index * 2 + 1].slice(0, 13), 16) / 0x10000000000000,
  }));
  return {
    seed,
    commitment,
    crashUnit,
    baseRtp: TARGET_RTP,
    crashPoint: crashPointFromUnit(crashUnit),
    comboRoll,
    abilityRolls,
  };
}

function Sprite({ roleId, className = "" }: { roleId: RoleId; className?: string }) {
  const role = roleById[roleId];
  return (
    <div className={`veg-sprite ${className}`}>
      <Image src={`/role-icons/${roleId}.webp?v=3`} width={128} height={128} sizes="(max-width: 440px) 42px, 48px" alt={role.name} draggable={false} />
    </div>
  );
}

export default function GameClient() {
  const [phase, setPhase] = useState<Phase>("betting");
  const [countdown, setCountdown] = useState(8);
  const [multiplier, setMultiplier] = useState(1);
  const [balance, setBalance] = useState(10000);
  const [tickets, setTickets] = useState<Ticket[]>([blankTicket(0), blankTicket(1)]);
  const [autoCashInputs, setAutoCashInputs] = useState(["2.00", "2.00"]);
  const [roundNo, setRoundNo] = useState(1);
  const [roundSpec, setRoundSpec] = useState<RoundSpec | null>(null);
  const [lastReveal, setLastReveal] = useState<RoundSpec | null>(null);
  const [history, setHistory] = useState<number[]>([1.08, 2.41, 8.76, 1.22, 3.19, 1.01, 12.44]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [fairOpen, setFairOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState<{ title: string; body: string; tone: "good" | "bad" | "gold" } | null>(null);

  const ticketsRef = useRef(tickets);
  const balanceRef = useRef(balance);
  const phaseRef = useRef<Phase>(phase);
  const roundSpecRef = useRef<RoundSpec | null>(roundSpec);
  const betDeadlineRef = useRef(0);
  const runStartRef = useRef(0);
  const bonusFlagsRef = useRef({ peas: false, okra: false });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const countdownTickRef = useRef(8);

  useEffect(() => { ticketsRef.current = tickets; }, [tickets]);
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { roundSpecRef.current = roundSpec; }, [roundSpec]);

  useEffect(() => {
    if (!rulesOpen && !fairOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeSheet = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setRulesOpen(false);
      setFairOpen(false);
    };
    window.addEventListener("keydown", closeSheet);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeSheet);
    };
  }, [fairOpen, rulesOpen]);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("veggie-dash-balance"); } catch { /* Private browsing may block storage. */ }
    const timer = setTimeout(() => {
      if (saved && Number.isFinite(Number(saved))) setBalance(Math.max(0, Number(saved)));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    try { localStorage.setItem("veggie-dash-balance", String(balance)); } catch { /* Keep the demo playable without persistence. */ }
  }, [balance]);

  useEffect(() => {
    let savedMuted = false;
    try { savedMuted = localStorage.getItem("veggie-dash-muted") === "1"; } catch { /* Sound stays enabled when storage is unavailable. */ }
    const timer = setTimeout(() => setMuted(savedMuted), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    try { localStorage.setItem("veggie-dash-muted", muted ? "1" : "0"); } catch { /* Preference persistence is optional. */ }
  }, [muted]);

  const showToast = useCallback((title: string, body: string, tone: "good" | "bad" | "gold" = "good") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ title, body, tone });
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const tone = useCallback((frequency: number, duration = 0.09, type: OscillatorType = "sine") => {
    if (muted || typeof window === "undefined") return;
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = audioContextRef.current ?? new AudioCtx();
    audioContextRef.current = ctx;
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    const oscillator = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * (type === "sawtooth" ? .52 : 1.06)), ctx.currentTime + duration);
    oscillator.type = type;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(type === "sine" ? 2400 : 1450, ctx.currentTime);
    filter.Q.value = .7;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.connect(filter).connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  }, [muted]);

  const haptic = useCallback((pattern: number | number[]) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  }, []);

  useEffect(() => () => {
    if (audioContextRef.current) void audioContextRef.current.close().catch(() => undefined);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const updateTicket = useCallback((index: number, updater: (ticket: Ticket) => Ticket) => {
    const next = ticketsRef.current.map((ticket, ticketIndex) => ticketIndex === index ? updater(ticket) : ticket);
    ticketsRef.current = next;
    setTickets(next);
  }, []);

  const placeBet = useCallback((index: number) => {
    const ticket = ticketsRef.current[index];
    if (phaseRef.current !== "betting" || !roundSpecRef.current || !ticket.enabled || ticket.placed) return;
    if (balanceRef.current < ticket.amount) {
      showToast("籌碼不足", "降低下注金額再試一次", "bad");
      tone(180, 0.15);
      return;
    }
    const nextBalance = balanceRef.current - ticket.amount;
    const targetRoll = roundSpecRef.current?.abilityRolls[index]?.target ?? .5;
    balanceRef.current = nextBalance;
    setBalance(nextBalance);
    const nextTickets = ticketsRef.current.map((current, ticketIndex) => ticketIndex === index ? {
      ...current,
      placed: true,
      status: "placed" as const,
      payout: 0,
      cashAt: null,
      remaining: 1,
      note: "",
      eggplantTarget: current.roleId === "eggplant" ? 2 + targetRoll * 3 : null,
    } : current);
    ticketsRef.current = nextTickets;
    setTickets(nextTickets);
    showToast(`下注 ${index + 1} 已鎖定`, `${roleById[ticket.roleId].name} · ${money(ticket.amount)} 籌碼`, "good");
    tone(520);
    haptic(14);
  }, [haptic, showToast, tone]);

  const applyPeasSwing = useCallback((next: Ticket[]) => {
    if (bonusFlagsRef.current.peas) return { tickets: next, adjustment: 0 };
    const liveTickets = next.filter((ticket) => ticket.enabled && ticket.placed);
    const hasPeas = liveTickets.some((ticket) => ticket.roleId === "peas");
    if (!hasPeas || liveTickets.length !== 2 || !liveTickets.every((ticket) => ticket.status === "cashed")) {
      return { tickets: next, adjustment: 0 };
    }
    bonusFlagsRef.current.peas = true;
    const pairResult = pairProfitFactor("peas", roundSpecRef.current?.comboRoll ?? .5);
    let totalAdjustment = 0;
    const adjusted = next.map((ticket) => {
      if (!ticket.enabled || !ticket.placed || ticket.status !== "cashed") return ticket;
      const profit = Math.max(0, ticket.payout - ticket.amount);
      const adjustment = profit * (pairResult.factor - 1);
      totalAdjustment += adjustment;
      return { ...ticket, payout: ticket.payout + adjustment, note: pairResult.note || ticket.note };
    });
    return { tickets: adjusted, adjustment: totalAdjustment };
  }, []);

  const cashOut = useCallback((index: number, at: number, forceFull = false) => {
    if (phaseRef.current !== "running") return;
    const currentTickets = ticketsRef.current;
    const current = currentTickets[index];
    if (!current || current.status !== "running" || current.remaining <= 0) return;
    const roleRoll = roundSpecRef.current?.abilityRolls[index]?.bonus ?? .5;
    if (current.roleId === "eggplant" && !forceFull) {
      showToast("茄子拒絕手動操作", "它會在秘密倍率自動 Cash Out", "bad");
      tone(210);
      return;
    }

    const isHalf = current.roleId === "cauliflower" && current.remaining > 0.5 && !forceFull;
    const portion = isHalf ? 0.5 : current.remaining;
    const stake = current.amount * portion;
    const settlement = settleSuccessfulCashout(current.roleId, stake, at, roleRoll);
    const paid = settlement.payout;
    const note = isHalf ? "花椰菜：已兌現一半" : settlement.note;
    const skillTone: "good" | "gold" = settlement.outcome === "bonus" ? "gold" : "good";
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
    const peasResult = applyPeasSwing(next);
    const totalCredit = paid + peasResult.adjustment;
    const nextBalance = balanceRef.current + totalCredit;
    balanceRef.current = nextBalance;
    ticketsRef.current = peasResult.tickets;
    setBalance(nextBalance);
    setTickets(peasResult.tickets);

    if (peasResult.adjustment !== 0) {
      showToast("雙子豌豆加成！", `雙注利潤 +${money(peasResult.adjustment)}`, "gold");
      tone(880, 0.18);
      haptic([18, 28, 24]);
    } else {
      if (note) showToast(note, `下注 ${index + 1} +${money(paid)}`, skillTone);
      else showToast(`下注 ${index + 1} Cash Out`, `${at.toFixed(2)}× · +${money(paid)}`, "good");
      tone(skillTone === "gold" ? 930 : 720, 0.13);
      haptic(skillTone === "gold" ? [18, 28, 24] : 18);
    }
  }, [applyPeasSwing, haptic, showToast, tone]);

  const settleCrash = useCallback((crashPoint: number) => {
    let refundCredit = 0;
    let okraAdjustment = 0;
    const settled = ticketsRef.current.map((ticket, ticketIndex) => {
      if (!ticket.enabled || !ticket.placed || ticket.status !== "running" || ticket.remaining <= 0) return ticket;
      const refundableStake = ticket.amount * ticket.remaining;
      const roleRoll = roundSpecRef.current?.abilityRolls[ticketIndex]?.bonus ?? .5;
      const crashSettlement = settleCrashRole(ticket.roleId, refundableStake, roleRoll);
      if (crashSettlement.payout > 0) {
        refundCredit += crashSettlement.payout;
        return {
          ...ticket,
          status: "refunded" as const,
          remaining: 0,
          payout: ticket.payout + crashSettlement.payout,
          note: crashSettlement.note,
        };
      }
      return { ...ticket, status: "lost" as const, remaining: 0, note: `爆點 ${crashPoint.toFixed(2)}×` };
    });

    if (!bonusFlagsRef.current.okra) {
      const played = settled.filter((ticket) => ticket.enabled && ticket.placed);
      const hasOkra = played.some((ticket) => ticket.roleId === "okra");
      const winners = played.filter((ticket) => ticket.status === "cashed");
      const losers = played.filter((ticket) => ticket.status === "lost" || ticket.status === "refunded");
      if (hasOkra && played.length === 2 && winners.length === 1 && losers.length === 1) {
        bonusFlagsRef.current.okra = true;
        const winnerIndex = settled.indexOf(winners[0]);
        const profit = Math.max(0, winners[0].payout - winners[0].amount);
        const pairResult = pairProfitFactor("okra", roundSpecRef.current?.comboRoll ?? .5);
        okraAdjustment = profit * (pairResult.factor - 1);
        if (okraAdjustment !== 0) {
          settled[winnerIndex] = { ...settled[winnerIndex], payout: settled[winnerIndex].payout + okraAdjustment, note: pairResult.note };
        }
      }
    }

    const totalCredit = refundCredit + okraAdjustment;
    if (totalCredit !== 0) {
      const nextBalance = balanceRef.current + totalCredit;
      balanceRef.current = nextBalance;
      setBalance(nextBalance);
    }
    ticketsRef.current = settled;
    setTickets(settled);

    if (okraAdjustment !== 0) {
      showToast("秋葵對沖加成！", `成功注利潤 +${money(okraAdjustment)}`, "gold");
      tone(760, 0.18);
    } else if (refundCredit > 0) {
      showToast("南瓜復活！", `返還本金 +${money(refundCredit)}`, "gold");
      tone(840, 0.22);
    }
  }, [showToast, tone]);

  const beginRound = useCallback(() => {
    bonusFlagsRef.current = { peas: false, okra: false };
    countdownTickRef.current = 8;
    setMultiplier(1);
    setCountdown(8);
    roundSpecRef.current = null;
    setRoundSpec(null);
    phaseRef.current = "betting";
    setPhase("betting");
    setRoundNo((value) => value + 1);
    const nextTickets = ticketsRef.current.map((ticket) => ({
      ...ticket,
      status: "idle" as const,
      placed: false,
      payout: 0,
      cashAt: null,
      remaining: 1,
      eggplantTarget: null,
      note: "",
    }));
    ticketsRef.current = nextTickets;
    setTickets(nextTickets);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const prepare = () => {
      makeRoundSpec().then((spec) => {
        if (!cancelled) {
          roundSpecRef.current = spec;
          setRoundSpec(spec);
        }
      }).catch(() => {
        if (!cancelled) retryTimer = setTimeout(prepare, 250);
      });
    };
    prepare();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [roundNo]);

  useEffect(() => {
    if (phase !== "betting" || !roundSpec) return;
    betDeadlineRef.current = performance.now() + 8000;
    const timer = setInterval(() => {
      setCountdown(Math.max(0, (betDeadlineRef.current - performance.now()) / 1000));
    }, 100);
    return () => clearInterval(timer);
  }, [phase, roundNo, roundSpec]);

  useEffect(() => {
    if (phase !== "betting" || !roundSpec) return;
    const tick = Math.ceil(countdown);
    if (tick > 0 && tick <= 3 && countdownTickRef.current !== tick) {
      countdownTickRef.current = tick;
      tone(tick === 1 ? 660 : 520, .075, "triangle");
    }
  }, [countdown, phase, roundSpec, tone]);

  useEffect(() => {
    if (phase !== "betting" || countdown > 0 || !roundSpec) return;
    const timer = setTimeout(() => {
      const currentSpec = roundSpecRef.current;
      if (!currentSpec) return;
      const baseRtp = calibrateRoundBaseRtp(ticketsToRtpWagers(ticketsRef.current));
      const resolvedSpec = {
        ...currentSpec,
        baseRtp,
        crashPoint: crashPointFromUnit(currentSpec.crashUnit, baseRtp),
      };
      roundSpecRef.current = resolvedSpec;
      setRoundSpec(resolvedSpec);
      runStartRef.current = performance.now();
      setMultiplier(1);
      phaseRef.current = "running";
      setPhase("running");
      const nextTickets = ticketsRef.current.map((ticket) => ticket.enabled && ticket.placed ? { ...ticket, status: "running" as const } : ticket);
      ticketsRef.current = nextTickets;
      setTickets(nextTickets);
      tone(430, 0.16, "square");
    }, 0);
    return () => clearTimeout(timer);
  }, [countdown, phase, roundSpec, tone]);

  useEffect(() => {
    if (phase !== "betting") return;
    const timer = setTimeout(() => {
      ticketsRef.current.forEach((ticket, index) => {
        if (ticket.enabled && ticket.autoBet && !ticket.placed) placeBet(index);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [phase, roundNo, placeBet, roundSpec]);

  useEffect(() => {
    if (phase !== "running") return;
    let frame = 0;
    let lastRenderedAt = 0;
    const tick = (now: number) => {
      if (phaseRef.current !== "running") return;
      const elapsed = Math.max(0, now - runStartRef.current) / 1000;
      const nextMultiplier = Math.exp(elapsed / 5.2);
      const crashPoint = roundSpecRef.current?.crashPoint ?? 2.5;
      ticketsRef.current.forEach((ticket, index) => {
        if (ticket.status !== "running") return;
        const target = ticket.roleId === "eggplant" ? ticket.eggplantTarget : ticket.autoCash;
        if (target && target < crashPoint && nextMultiplier >= target) cashOut(index, target, true);
      });
      if (nextMultiplier >= crashPoint) {
        setMultiplier(crashPoint);
        if (roundSpecRef.current) setLastReveal(roundSpecRef.current);
        phaseRef.current = "crashed";
        setPhase("crashed");
        setHistory((current) => [crashPoint, ...current].slice(0, 12));
        settleCrash(crashPoint);
        tone(120, 0.35, "sawtooth");
        if (ticketsRef.current.some((ticket) => ticket.enabled && ticket.placed)) haptic([48, 28, 64]);
        return;
      }
      if (now - lastRenderedAt >= 32) {
        lastRenderedAt = now;
        setMultiplier(nextMultiplier);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cashOut, haptic, phase, settleCrash, tone]);

  useEffect(() => {
    if (phase !== "crashed") return;
    const timer = setTimeout(beginRound, 3200);
    return () => clearTimeout(timer);
  }, [beginRound, phase]);

  const placedCount = tickets.filter((ticket) => ticket.enabled && ticket.placed).length;
  const runningCount = tickets.filter((ticket) => ticket.status === "running").length;
  const caughtCount = tickets.filter((ticket) => ticket.status === "lost" || ticket.status === "refunded").length;

  const stageMessage = useMemo(() => {
    if (phase === "betting") return placedCount ? `${placedCount} 注已鎖定，準備開跑` : "選擇角色並在倒數前下注";
    if (phase === "crashed") return `爆點 ${multiplier.toFixed(2)}×`;
    if (!placedCount) return "本局觀戰中";
    if (!runningCount) return "本局已完成結算";
    return "在收割者追上前 Cash Out！";
  }, [multiplier, phase, placedCount, runningCount]);

  const stageProgress = phase === "betting"
    ? Math.max(4, ((8 - countdown) / 8) * 100)
    : Math.min(96, 12 + Math.log(Math.max(1, multiplier)) * 34);
  // This is an intentionally non-predictive show meter. It only follows visible
  // run time and never reads the committed crash point.
  const visualRunTime = Math.log(Math.max(1, multiplier)) * 5.2;
  const chasePressure = phase === "running"
    ? Math.min(84, Math.max(12,
        43
        + Math.sin(visualRunTime * 1.7) * 20
        + Math.sin(visualRunTime * 3.9 + .8) * 9
        + Math.min(9, visualRunTime * .42),
      ))
    : phase === "crashed" ? 100 : 0;
  const meterProgress = chasePressure;
  const worldSpeed = Math.max(.34, 1.05 - Math.log(Math.max(1, multiplier)) * .16);
  const runnerScale = phase === "betting" ? 1 : Math.max(.5, 1 - stageProgress * .0052);

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
    updateTicket(ticketIndex, (ticket) => {
      const nextAmount = delta > 0 && ticket.amount < 50
        ? 50
        : delta < 0 && ticket.amount <= 50
          ? 10
          : ticket.amount + delta;
      return { ...ticket, amount: Math.max(10, Math.min(5000, nextAmount)) };
    });
    tone(delta > 0 ? 610 : 460, .045, "triangle");
  };

  const toggleAutoBet = (ticketIndex: number) => {
    const ticket = ticketsRef.current[ticketIndex];
    const willEnable = !ticket.autoBet;
    updateTicket(ticketIndex, (current) => ({ ...current, autoBet: !current.autoBet }));
    tone(ticket.autoBet ? 410 : 590, .055, "triangle");
    if (willEnable && phaseRef.current === "betting" && !ticket.placed) setTimeout(() => placeBet(ticketIndex), 0);
  };

  const toggleAutoCash = (ticketIndex: number) => {
    const ticket = ticketsRef.current[ticketIndex];
    if (phase !== "betting" || ticket.placed || ticket.roleId === "eggplant") return;
    updateTicket(ticketIndex, (current) => ({ ...current, autoCash: current.autoCash ? null : current.autoCashTarget }));
    tone(ticket.autoCash ? 410 : 590, .055, "triangle");
  };

  const changeAutoCashTarget = (ticketIndex: number, nextValue: number) => {
    if (phase !== "betting" || ticketsRef.current[ticketIndex].placed) return;
    if (!Number.isFinite(nextValue)) return;
    const target = Math.min(MAX_SETTLEMENT_MULTIPLIER, Math.max(1.01, Math.round(nextValue * 100) / 100));
    updateTicket(ticketIndex, (current) => ({
      ...current,
      autoCashTarget: target,
      autoCash: current.autoCash ? target : null,
    }));
    setAutoCashInputs((current) => current.map((value, index) => index === ticketIndex ? target.toFixed(2) : value));
  };

  const commitAutoCashInput = (ticketIndex: number) => {
    const parsed = Number(autoCashInputs[ticketIndex].replace(",", "."));
    if (Number.isFinite(parsed)) {
      changeAutoCashTarget(ticketIndex, parsed);
      return;
    }
    setAutoCashInputs((current) => current.map((value, index) => index === ticketIndex
      ? ticketsRef.current[ticketIndex].autoCashTarget.toFixed(2)
      : value));
  };

  const ticketAction = (ticketIndex: number) => {
    if (phase === "betting") placeBet(ticketIndex);
    else if (phase === "running") cashOut(ticketIndex, multiplier);
  };

  const resetDemoBalance = () => {
    if (phase !== "betting" || placedCount > 0) return;
    balanceRef.current = 10000;
    setBalance(10000);
    setRulesOpen(false);
    showToast("虛擬籌碼已重設", "Balance 10,000", "good");
    tone(620, .11, "triangle");
    haptic(12);
  };

  const ticketActionLabel = (ticket: Ticket) => {
    if (phase === "betting") return ticket.placed ? "LOCKED" : roundSpec ? "BET" : "PREPARING";
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
    (phase === "betting" && (ticket.placed || !roundSpec)) ||
    phase === "crashed" ||
    (phase === "running" && ticket.status !== "running") ||
    (phase === "running" && ticket.roleId === "eggplant");

  return (
    <main className="game-shell">
      <section
        className={`game-phone phase-${phase} ${placedCount > 0 ? "has-bets" : "no-bets"} ${phase === "betting" && countdown <= 3 ? "is-countdown-urgent" : ""} ${phase === "running" && chasePressure >= 70 ? "is-chase-close" : ""}`}
        aria-label="蔬菜跑跑 Crash Game Demo"
      >
        <section
          className="race-stage"
          style={{
            "--world-speed": `${worldSpeed}s`,
            "--chase-pressure": chasePressure,
          } as CSSProperties}
        >
          <div className="history-strip" aria-label="最近爆點">
            {history.slice(0, 6).map((value, index) => <span className={historyTier(value)} key={index}>{value.toFixed(2)}×</span>)}
            <b>•••</b>
          </div>
          <button className="menu-button" aria-label="遊戲選單" onClick={() => setRulesOpen(true)}><i /><i /><i /></button>

          <div className="scene-motion" aria-hidden="true">
            <span className="horizon-glow" />
            <span className="road-flow"><i /><i /><i /><i /><i /></span>
            <span className="speed-dust"><i /><i /><i /><i /><i /><i /></span>
          </div>

          <div className="round-display">
            <strong>{phase === "betting" ? "Betting..." : phase === "running" ? "Run!" : caughtCount ? "Caught!" : "Round End"}</strong>
            <span>{phase === "betting" ? Math.ceil(countdown) : `${multiplier.toFixed(2)}×`}</span>
            <small>{phase === "betting" ? roundSpec ? `ROUND ${roundNo} · ${placedCount}/2 BETS` : "PREPARING FAIR ROUND" : stageMessage}</small>
          </div>

          {phase !== "betting" && (runningCount > 0 || caughtCount > 0) && (
            <div className="vertical-meters" aria-label="追擊距離演出" title="追擊距離為動畫演出，不代表爆點">
              <div className={`meter-unit ${phase === "crashed" ? "meter-status-caught" : ""}`}>
                <div className="vertical-meter">
                  <span style={{ height: `${meterProgress}%` }} />
                  <i /><i /><i /><i />
                </div>
              </div>
            </div>
          )}

          <div className="road-runners">
            {tickets.map((ticket, index) => {
              if (!ticket.enabled || !ticket.placed) return null;
              const progress = phase === "betting" ? 0 : stageProgress;
              const laneOrigin = placedCount === 1 ? 50 : index === 0 ? 43 : 61;
              const laneX = 50 + (laneOrigin - 50) * (1 - progress / 240);
              return (
                <div
                  className={`road-runner runner-${index + 1} status-${ticket.status}`}
                  style={{
                    "--runner-progress": progress,
                    "--runner-scale": runnerScale,
                    "--runner-badge-scale": Math.min(1.75, 1 / runnerScale),
                    "--runner-x": `${laneX}%`,
                  } as CSSProperties}
                  key={index}
                >
                  <CanvasRunner roleId={ticket.roleId} label={roleById[ticket.roleId].name} back={phase !== "betting"} active={phase === "running"} phaseOffset={index * 184} />
                  <b>{index + 1}</b>
                </div>
              );
            })}
          </div>
          {phase !== "betting" && (
            <div className="fox-pursuers" aria-hidden="true">
              {tickets.map((ticket, index) => {
                const shouldRender = phase === "running"
                  ? ticket.status === "running" || ticket.status === "cashed"
                  : phase === "crashed" && ticket.status !== "cashed";
                if (!ticket.enabled || !ticket.placed || !shouldRender) return null;
                const laneWave = Math.sin(visualRunTime * 2.35 + index * 1.9) * 7;
                const foxPressure = phase === "crashed" ? 100 : Math.min(88, Math.max(8, chasePressure + laneWave));
                const laneOrigin = placedCount === 1 ? 50 : index === 0 ? 38 : 67;
                const foxX = 50 + (laneOrigin - 50) * (1 - foxPressure / 250);
                return (
                  <div
                    className={`fox-pursuer fox-${index + 1} ${phase === "running" && ticket.status === "cashed" ? "fox-retired" : ""}`}
                    style={{
                      "--chase-pressure": foxPressure,
                      "--fox-opacity": phase === "crashed" ? 1 : Math.min(1, .7 + foxPressure / 380),
                      "--fox-x": `${foxX}%`,
                    } as CSSProperties}
                    key={index}
                  />
                );
              })}
            </div>
          )}
          {phase === "crashed" && caughtCount > 0 && (
            <div className={`capture-overlay ${caughtCount > 1 ? "capture-multi" : ""}`} role="status" aria-label={`Captured at ${multiplier.toFixed(2)} times`}>
              {tickets.map((ticket, index) => ticket.enabled && ticket.placed && ticket.status !== "cashed" && (
                <div
                  className={`capture-impact impact-${index + 1}`}
                  style={{ "--impact-x": caughtCount === 1 && placedCount === 1 ? "52%" : index === 0 ? "45%" : "59%" } as CSSProperties}
                  aria-hidden="true"
                  key={index}
                >
                  <i className="impact-ring" />
                  <i className="impact-flash" />
                  <span className="impact-smoke"><i /><i /><i /><i /><i /></span>
                  <span className="impact-sparks"><i /><i /><i /><i /><i /><i /></span>
                </div>
              ))}
            </div>
          )}
          {phase === "crashed" && placedCount > 0 && (
            <div className={`result-ribbon ${tickets.some((ticket) => ticket.enabled && ticket.placed && ticket.status === "cashed") ? "has-win" : ""}`} role="status" aria-label="本局下注結果">
              {tickets.map((ticket, index) => ticket.enabled && ticket.placed && (
                <span className={`result-${ticket.status}`} key={index}>
                  <b>{index + 1}</b>
                  <i>{ticket.status === "cashed" ? "CASH OUT SUCCESS" : ticket.status === "refunded" ? "REFUND" : ticket.payout > 0 ? "PARTIAL" : "CAUGHT"}</i>
                  <strong>{ticket.status === "cashed" ? `WIN +${money(ticket.payout)}` : ticket.status === "refunded" || ticket.payout > 0 ? `+${money(ticket.payout)}` : `${multiplier.toFixed(2)}×`}</strong>
                </span>
              ))}
            </div>
          )}
          {phase === "running" && <div className="signal-indicator" aria-label="連線穩定"><span><i /><i /><i /></span><small>LOCAL</small></div>}
          <button className="fair-link" onClick={() => setFairOpen(true)}>FAIR ✓</button>
        </section>

        <section className="bet-zone">
          {tickets.map((ticket, ticketIndex) => {
            const role = roleById[ticket.roleId];
            const canEdit = phase === "betting" && !ticket.placed && Boolean(roundSpec);
            return (
              <article className={`bet-card status-${ticket.status} ${ticket.placed ? "is-placed" : ""} ${ticket.note.includes("：") ? "skill-triggered" : ""}`} key={ticketIndex}>
                <div className="character-grid" aria-label={`下注 ${ticketIndex + 1} 選擇角色`}>
                  {roles.map((option) => (
                    <button
                      className={ticket.roleId === option.id ? "selected" : ""}
                      disabled={!canEdit}
                      aria-pressed={ticket.roleId === option.id}
                      onClick={() => chooseRole(ticketIndex, option.id)}
                      title={`${option.name}：${option.short}`}
                      key={option.id}
                    >
                      <Sprite roleId={option.id} />
                    </button>
                  ))}
                </div>

                <div className="role-info" style={{ "--role-accent": role.accent } as CSSProperties}>
                  <div className="role-name-row"><strong>{role.name}</strong></div>
                  <p>{role.detail}</p>
                </div>

                <div className="amount-stepper">
                  <button disabled={!canEdit || ticket.amount <= 10} aria-label={`下注 ${ticketIndex + 1} 減少金額`} onClick={() => changeStake(ticketIndex, -50)}>−</button>
                  <strong>{money(ticket.amount)}</strong>
                  <button disabled={!canEdit || ticket.amount >= 5000} aria-label={`下注 ${ticketIndex + 1} 增加金額`} onClick={() => changeStake(ticketIndex, 50)}>＋</button>
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
                      aria-pressed={ticket.autoBet}
                      aria-label={`下注 ${ticketIndex + 1} 自動下注`}
                      onClick={() => toggleAutoBet(ticketIndex)}
                    ><i /></button>
                  </div>
                  <div className="option-control auto-cash-control">
                    <span>AUTO CASHOUT {ticket.roleId === "eggplant" ? "RANDOM" : ""}</span>
                    {ticket.roleId !== "eggplant" && (
                      <div className="auto-cash-setting">
                        <button
                          disabled={!canEdit || ticket.autoCashTarget <= 1.01}
                          aria-label={`下注 ${ticketIndex + 1} 降低自動 Cash Out 倍率`}
                          onClick={() => changeAutoCashTarget(ticketIndex, ticket.autoCashTarget <= 1.1 ? 1.01 : ticket.autoCashTarget - .1)}
                        >−</button>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="1.01"
                          max={MAX_SETTLEMENT_MULTIPLIER}
                          step="0.01"
                          value={autoCashInputs[ticketIndex]}
                          disabled={!canEdit}
                          aria-label={`下注 ${ticketIndex + 1} 自動 Cash Out 倍率`}
                          onChange={(event) => setAutoCashInputs((current) => current.map((value, index) => index === ticketIndex ? event.target.value : value))}
                          onBlur={() => commitAutoCashInput(ticketIndex)}
                          onFocus={(event) => event.currentTarget.select()}
                          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                        />
                        <b>×</b>
                        <button
                          disabled={!canEdit || ticket.autoCashTarget >= MAX_SETTLEMENT_MULTIPLIER}
                          aria-label={`下注 ${ticketIndex + 1} 提高自動 Cash Out 倍率`}
                          onClick={() => changeAutoCashTarget(ticketIndex, ticket.autoCashTarget <= 1.01 ? 1.1 : ticket.autoCashTarget + .1)}
                        >＋</button>
                      </div>
                    )}
                    <button
                      className={`toggle ${ticket.autoCash || ticket.roleId === "eggplant" ? "on" : ""}`}
                      disabled={!canEdit || ticket.roleId === "eggplant"}
                      aria-pressed={Boolean(ticket.autoCash || ticket.roleId === "eggplant")}
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
          <button className={muted ? "muted" : ""} aria-label={muted ? "開啟音效" : "關閉音效"} aria-pressed={muted} onClick={() => setMuted((value) => !value)}>{muted ? "🔇" : "🔊"}</button>
        </footer>

        {toast && <div className={`game-toast ${toast.tone}`} role="status" aria-live="polite"><strong>{toast.title}</strong><span>{toast.body}</span></div>}

        {rulesOpen && (
          <div className="sheet-backdrop">
            <button className="backdrop-dismiss" aria-label="關閉遊戲說明" onClick={() => setRulesOpen(false)} />
            <section className="info-sheet" role="dialog" aria-modal="true" aria-labelledby="rules-title">
              <div className="sheet-handle" />
              <header><div><small>GAME MENU</small><h2 id="rules-title">遊戲選單</h2></div><button aria-label="關閉遊戲選單" onClick={() => setRulesOpen(false)}>×</button></header>
              <div className="rule-steps">
                <article><b>01</b><div><strong>8 秒選角下注</strong><span>最多同時兩注，兩注角色與金額可不同。</span></div></article>
                <article><b>02</b><div><strong>倍率持續成長</strong><span>角色越跑越遠，派彩由 1.00× 不斷上升。</span></div></article>
                <article><b>03</b><div><strong>被抓前 Cash Out</strong><span>成功取得下注額 × 當下倍率；爆掉則失去未結算部位。</span></div></article>
              </div>
              <h3 className="role-guide-title">角色能力</h3>
              <div className="role-guide">
                {roles.map((role) => (
                  <article key={role.id}>
                    <Sprite roleId={role.id} />
                    <div><strong>{role.name}</strong><span>{role.short}</span></div>
                  </article>
                ))}
              </div>
              <div className="menu-actions">
                <button onClick={() => { setRulesOpen(false); setFairOpen(true); }}><span>公平性驗證</span><b>查看本局資料 ›</b></button>
                <button onClick={() => setMuted((value) => !value)}><span>遊戲音效</span><b>{muted ? "關閉" : "開啟"}</b></button>
              </div>
              <button className="sheet-secondary" disabled={phase !== "betting" || placedCount > 0} onClick={resetDemoBalance}>重設虛擬籌碼</button>
              <p className="responsible-note">18+ · 請理性娛樂</p>
              <button className="sheet-primary" onClick={() => setRulesOpen(false)}>返回遊戲</button>
            </section>
          </div>
        )}

        {fairOpen && (
          <div className="sheet-backdrop">
            <button className="backdrop-dismiss" aria-label="關閉公平性說明" onClick={() => setFairOpen(false)} />
            <section className="info-sheet fair-sheet" role="dialog" aria-modal="true" aria-labelledby="fair-title">
              <div className="sheet-handle" />
              <header><div><small>PROVABLY FAIR DEMO</small><h2 id="fair-title">本局公平性</h2></div><button aria-label="關閉公平性說明" onClick={() => setFairOpen(false)}>×</button></header>
              <span className="field-label">開局承諾 Hash</span>
              <code>{roundSpec?.commitment ?? "Generating…"}</code>
              <span className="field-label">Server Seed</span>
              <code>{phase === "crashed" ? roundSpec?.seed : "本局結束後公開"}</code>
              {phase !== "crashed" && lastReveal && (
                <div className="previous-reveal">
                  <span className="field-label">上局承諾 Hash</span>
                  <code>{lastReveal.commitment}</code>
                  <span className="field-label">上局 Server Seed · 爆點 {lastReveal.crashPoint.toFixed(2)}× · 基礎曲線 {(lastReveal.baseRtp * 100).toFixed(2)}%</span>
                  <code>{lastReveal.seed}</code>
                </div>
              )}
              <span className="field-label">本局角色／組合 VI 曲線</span>
              <code>{phase === "betting" ? "下注鎖定後計算" : `${((roundSpec?.baseRtp ?? TARGET_RTP) * 100).toFixed(2)}% 基礎曲線 → 含角色能力後目標 ${(TARGET_RTP * 100).toFixed(0)}%`}</code>
              <span className="field-label">演算法</span>
              <code>SHA-256 · committed crash unit + selected VI curve + ticket rolls</code>
              <p>開局先承諾 Seed 與爆點亂數；下注鎖定後，再依角色、組合、投注比例與面板策略倍率，將同一個亂數映射到對應 VI 爆點曲線。角色能力只會加成或不觸發，整體長期理論 RTP 目標為 {(TARGET_RTP * 100).toFixed(0)}%，不依玩家歷史輸贏動態調整。手動改變兌現時機會改變該策略的實際回報。</p>
              <button className="sheet-primary" onClick={() => setFairOpen(false)}>完成</button>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
