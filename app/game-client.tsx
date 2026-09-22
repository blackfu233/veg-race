"use client";

import Image from "next/image";
import { CSSProperties, Fragment, useCallback, useEffect, useRef, useState } from "react";
import CanvasRunner from "./canvas-runner";
import { bettingWindowOpen, cancelPendingBet, canEditUnplacedTicket, canStartRoundEarly, isAutoCashInputDraft, normalizeAutoCashInput } from "./ticket-actions.mjs";
import {
  calibratePumpkinContracts,
  calibrateRoundBaseRtp,
  crashPointFromUnit,
  createPumpkinContract,
  createVisualNearMiss,
  describeDuoPair,
  duoRuleFor,
  duoRuntimeForTicket,
  MAX_SETTLEMENT_MULTIPLIER,
  peapodPayoutFactorFromUnit,
  peapodThresholdFromUnit,
  settleCrashRole,
  settlePumpkinCashout,
  settlePumpkinCrash,
  settleSuccessfulCashout,
  TARGET_RTP,
} from "./rtp-engine.mjs";

const BETTING_SECONDS = 30;

type Phase = "betting" | "running" | "crashed";
type TicketStatus = "idle" | "placed" | "running" | "cashed" | "lost";
type RoleId =
  | "potato"
  | "chili"
  | "pumpkin"
  | "tomato"
  | "peapod"
  | "mushroom";

type AbilityRolls = Record<"potato" | "chili" | "pumpkin" | "tomato" | "peapod" | "mushroom" | "target" | "peapodTarget" | "peapodPrize", number>;

type PumpkinContract = {
  active: boolean;
  stake: number;
  target: number;
  clears: number;
  multipliers: number[];
  stages: number;
  factor: number;
  ruleKey: string;
  baseRtp: number;
};

type Role = {
  id: RoleId;
  name: string;
  short: string;
  detail: string;
  accent: string;
};

type SkillFx = {
  id: number;
  roleId: RoleId;
  ticketIndex: number | null;
  label: string;
};

type SafeRun = {
  active: boolean;
  extended: boolean;
  cashAt: number;
  naturalEnd: number;
  visualEnd: number;
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
  autoRoleTarget: number | null;
  peapodThreshold: number | null;
  peapodFactor: number | null;
  pumpkinContract: PumpkinContract;
  note: string;
};

type RoundSpec = {
  seed: string;
  commitment: string;
  crashUnit: number;
  baseRtp: number;
  crashPoint: number;
  nearMissUnit: number;
  abilityRolls: AbilityRolls[];
};

const idleSafeRun: SafeRun = { active: false, extended: false, cashAt: 0, naturalEnd: 0, visualEnd: 0 };

const roles: Role[] = [
  { id: "potato", name: "馬鈴薯", short: "2×前 Cash Out：28%機率派彩×2", detail: "2×前成功 → 28%機率派彩×2", accent: "#f0b55b" },
  { id: "chili", name: "辣椒", short: "5×後 Cash Out：34%機率派彩×2", detail: "5×後成功 → 34%機率派彩×2", accent: "#ff5a4f" },
  { id: "pumpkin", name: "南瓜", short: "鎖定BET與目標；連過3局，總倍率×3派彩", detail: "連續3局達標 → 總倍率×3派彩", accent: "#ff9d3d" },
  { id: "tomato", name: "番茄", short: "2–5×自動 Cash Out：12%機率派彩×3", detail: "2–5×自動成功 → 12%機率派彩×3", accent: "#ff6358" },
  { id: "peapod", name: "豌豆莢", short: "開跑揭曉2～5×門檻與倍獎；達標後25%機率觸發", detail: "開跑揭曉門檻與倍獎 → 達標後25%機率觸發", accent: "#70d858" },
  { id: "mushroom", name: "蘑菇", short: "Cash Out成功：4.5%機率派彩×8", detail: "成功 → 4.5%機率派彩×8", accent: "#8a5abb" },
];

const forcedAbilityRolls: AbilityRolls = {
  potato: 0,
  chili: 0,
  pumpkin: 0,
  tomato: 0,
  peapod: 0,
  mushroom: 0,
  target: 0.5,
  peapodTarget: 0.5,
  peapodPrize: 0.999,
};

const roleById = Object.fromEntries(roles.map((role) => [role.id, role])) as Record<RoleId, Role>;

function emptyContract(): PumpkinContract {
  return { active: false, stake: 0, target: 2, clears: 0, multipliers: [], stages: 3, factor: 3, ruleKey: "pumpkin", baseRtp: TARGET_RTP };
}

function runtimeForTicket(roleIds: RoleId[], spec: RoundSpec, ticketIndex: number, showcase = false) {
  const rolls = showcase ? [forcedAbilityRolls, forcedAbilityRolls] : spec.abilityRolls;
  return duoRuntimeForTicket(roleIds, rolls, ticketIndex);
}

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
    autoRoleTarget: null,
    peapodThreshold: null,
    peapodFactor: null,
    pumpkinContract: emptyContract(),
    note: "",
  };
}

function ticketStrategyTarget(ticket: Ticket) {
  return ticket.roleId === "tomato" && ticket.autoRoleTarget
    ? ticket.autoRoleTarget
    : ticket.autoCashTarget;
}

function usesTomatoAuto(ticket: Ticket) {
  return ticket.roleId === "tomato";
}

function selectedRoundRoleIds(tickets: Ticket[]) {
  return tickets
    .filter((ticket) => ticket.enabled && ticket.placed)
    .map((ticket) => ticket.roleId);
}

function ticketsToRtpWagers(tickets: Ticket[], spec: RoundSpec) {
  const active = tickets.flatMap((ticket, ticketIndex) => ticket.enabled && ticket.placed && !ticket.pumpkinContract.active ? [{ ticket, ticketIndex }] : []);
  const roleIds = active.map(({ ticket }) => ticket.roleId);
  return active.map(({ ticket, ticketIndex }) => {
    const runtime = active.length === 2 ? runtimeForTicket(roleIds, spec, ticketIndex) : null;
    const target = runtime?.rule.kind === "auto" ? runtime.autoTarget
      : runtime?.rule.kind === "reveal-auto" ? runtime.threshold
      : ticketStrategyTarget(ticket);
    return {
      roleId: ticket.roleId,
      stake: ticket.amount,
      target: target ?? ticketStrategyTarget(ticket),
      manual: !["auto", "reveal-auto"].includes(runtime?.rule.kind ?? "") && !usesTomatoAuto(ticket) && !ticket.autoCash,
      peapodThreshold: ticket.peapodThreshold ?? 3,
      peapodFactor: ticket.peapodFactor ?? 2,
      duoThreshold: runtime?.threshold,
      duoFactor: runtime?.factor,
    };
  });
}

function applyLockedAbilitySetup(tickets: Ticket[], spec: RoundSpec) {
  const placedIndexes = tickets.flatMap((ticket, index) => ticket.enabled && ticket.placed ? [index] : []);
  if (placedIndexes.length === 2) {
    const roleIds = placedIndexes.map((index) => tickets[index].roleId);
    const runtime = runtimeForTicket(roleIds, spec, placedIndexes[0]);
    if (runtime?.rule.kind === "contract") {
      const targetSourceIndex = placedIndexes.find((index) => tickets[index].roleId === "pumpkin") ?? placedIndexes[0];
      const selectedTarget = Math.min(runtime.rule.max ? runtime.rule.max - .01 : 2.88, tickets[targetSourceIndex].autoCashTarget);
      const configured = tickets.map((ticket, index) => {
        if (!placedIndexes.includes(index)) return ticket;
        const ticketRuntime = runtimeForTicket(roleIds, spec, index);
        const target = ticketRuntime?.contractTarget ?? selectedTarget;
        return {
          ...ticket,
          pumpkinContract: ticket.pumpkinContract.active && ticket.pumpkinContract.ruleKey === runtime.key
            ? ticket.pumpkinContract
            : createPumpkinContract(ticket.amount, target, {
                stages: runtime.rule.stages,
                factor: runtime.factor,
                ruleKey: runtime.key,
              }),
        };
      });
      const activeContracts = configured.flatMap((ticket, index) => placedIndexes.includes(index) ? [ticket.pumpkinContract] : []);
      const baseRtp = calibratePumpkinContracts(activeContracts);
      return configured.map((ticket, index) => placedIndexes.includes(index)
        ? { ...ticket, pumpkinContract: { ...ticket.pumpkinContract, baseRtp } }
        : ticket);
    }
    return tickets.map((ticket, index) => placedIndexes.includes(index) ? { ...ticket, pumpkinContract: emptyContract() } : ticket);
  }
  if (placedIndexes.length === 1) {
    const placedIndex = placedIndexes[0];
    return tickets.map((ticket, index) => {
      if (index !== placedIndex) return ticket;
      if (ticket.roleId !== "pumpkin") return { ...ticket, pumpkinContract: emptyContract() };
      return {
        ...ticket,
        pumpkinContract: ticket.pumpkinContract.active && ticket.pumpkinContract.ruleKey === "pumpkin"
          ? ticket.pumpkinContract
          : createPumpkinContract(ticket.amount, Math.min(2.88, ticket.autoCashTarget)),
      };
    });
  }
  return tickets;
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
  const abilityKeys = ["potato", "chili", "pumpkin", "tomato", "peapod", "mushroom", "target", "peapodTarget", "peapodPrize"] as const;
  const [commitment, crashHash, nearMissHash, ...abilityHashes] = await Promise.all([
    digestHex(seed),
    digestHex(seed + ":crash"),
    digestHex(seed + ":near-miss"),
    ...[0, 1].flatMap((index) => abilityKeys.map((key) => digestHex(`${seed}:ticket:${index}:${key}`))),
  ]);
  const crashUnit = Number.parseInt(crashHash.slice(0, 13), 16) / 0x10000000000000;
  const nearMissUnit = Number.parseInt(nearMissHash.slice(0, 13), 16) / 0x10000000000000;
  const abilityRolls = [0, 1].map((index) => Object.fromEntries(abilityKeys.map((key, keyIndex) => [
    key,
    Number.parseInt(abilityHashes[index * abilityKeys.length + keyIndex].slice(0, 13), 16) / 0x10000000000000,
  ]))) as AbilityRolls[];
  return {
    seed,
    commitment,
    crashUnit,
    baseRtp: TARGET_RTP,
    crashPoint: crashPointFromUnit(crashUnit),
    nearMissUnit,
    abilityRolls,
  };
}

function Sprite({ roleId, className = "" }: { roleId: RoleId; className?: string }) {
  const role = roleById[roleId];
  return (
    <div className={`veg-sprite ${className}`}>
      <Image src={`/role-icons/${roleId}.webp?v=5`} width={128} height={128} sizes="(max-width: 440px) 42px, 48px" alt={role.name} draggable={false} unoptimized />
    </div>
  );
}

function SkillEffect({ effect, x }: { effect: SkillFx; x: number }) {
  return (
    <div
      className={`skill-fx fx-${effect.roleId}`}
      style={{ "--fx-x": `${x}%` } as CSSProperties}
      role="status"
      aria-label={effect.label}
    >
      <span className="fx-shape">
        <Image className="fx-role-art fx-role-main" src={`/role-icons/${effect.roleId}.webp?v=5`} width={128} height={128} alt="" aria-hidden="true" unoptimized />
        <Image className="fx-role-art fx-role-copy" src={`/role-icons/${effect.roleId}.webp?v=5`} width={128} height={128} alt="" aria-hidden="true" unoptimized />
        <span className="fx-particles"><i /><i /><i /><i /><i /><i /><i /><i /></span>
      </span>
      <strong>{effect.label}</strong>
    </div>
  );
}

export default function GameClient() {
  const [phase, setPhase] = useState<Phase>("betting");
  const [countdown, setCountdown] = useState(BETTING_SECONDS);
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
  const [showcaseMode, setShowcaseMode] = useState(false);
  const [toast, setToast] = useState<{ title: string; body: string; tone: "good" | "bad" | "gold" } | null>(null);
  const [skillEffects, setSkillEffects] = useState<SkillFx[]>([]);
  const [safeRun, setSafeRun] = useState<SafeRun>(idleSafeRun);

  const ticketsRef = useRef(tickets);
  const balanceRef = useRef(balance);
  const phaseRef = useRef<Phase>(phase);
  const roundSpecRef = useRef<RoundSpec | null>(roundSpec);
  const showcaseModeRef = useRef(showcaseMode);
  const safeRunRef = useRef<SafeRun>(idleSafeRun);
  const betDeadlineRef = useRef(0);
  const cancelledAutoBetRef = useRef(new Set<number>());
  const runStartRef = useRef(0);
  const roundStartCommittedRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const countdownTickRef = useRef(BETTING_SECONDS);
  const skillFxIdRef = useRef(0);
  const skillFxTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => { ticketsRef.current = tickets; }, [tickets]);
  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { roundSpecRef.current = roundSpec; }, [roundSpec]);
  useEffect(() => { showcaseModeRef.current = showcaseMode; }, [showcaseMode]);
  useEffect(() => { safeRunRef.current = safeRun; }, [safeRun]);

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

  useEffect(() => {
    const localOnly = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const enabled = localOnly && new URLSearchParams(window.location.search).get("showcase") === "1";
    const timer = setTimeout(() => {
      showcaseModeRef.current = enabled;
      setShowcaseMode(enabled);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const showToast = useCallback((title: string, body: string, tone: "good" | "bad" | "gold" = "good") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ title, body, tone });
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const triggerSkillFx = useCallback((roleId: RoleId, ticketIndex: number | null, label: string) => {
    skillFxIdRef.current += 1;
    const id = skillFxIdRef.current;
    setSkillEffects((current) => [...current, { id, roleId, ticketIndex, label }]);
    const timer = setTimeout(() => {
      setSkillEffects((current) => current.filter((effect) => effect.id !== id));
      skillFxTimersRef.current = skillFxTimersRef.current.filter((currentTimer) => currentTimer !== timer);
    }, 1650);
    skillFxTimersRef.current.push(timer);
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
    skillFxTimersRef.current.forEach((timer) => clearTimeout(timer));
  }, []);

  const updateTicket = useCallback((index: number, updater: (ticket: Ticket) => Ticket) => {
    const next = ticketsRef.current.map((ticket, ticketIndex) => ticketIndex === index ? updater(ticket) : ticket);
    ticketsRef.current = next;
    setTickets(next);
  }, []);

  const placeBet = useCallback((index: number, automatic = false) => {
    const ticket = ticketsRef.current[index];
    const spec = roundSpecRef.current;
    if (!bettingWindowOpen(phaseRef.current, Boolean(roundSpecRef.current), performance.now(), betDeadlineRef.current)
      || !spec || !ticket.enabled || ticket.placed || (automatic && (!ticket.autoBet || cancelledAutoBetRef.current.has(index)))) return;

    if (balanceRef.current < ticket.amount) {
      showToast("籌碼不足", "降低下注金額再試一次", "bad");
      tone(180, 0.15);
      return;
    }
    const nextBalance = balanceRef.current - ticket.amount;
    const targetRoll = spec.abilityRolls[index].target;
    const peapodTargetRoll = spec.abilityRolls[index].peapodTarget;
    const peapodPrizeRoll = spec.abilityRolls[index].peapodPrize;
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
      peapodThreshold: current.roleId === "peapod" ? peapodThresholdFromUnit(peapodTargetRoll) : null,
      peapodFactor: current.roleId === "peapod" ? peapodPayoutFactorFromUnit(peapodPrizeRoll) : null,
      autoRoleTarget: current.roleId === "tomato" ? Math.round((2 + targetRoll * 3) * 100) / 100 : null,
    } : current);
    const configuredTickets = applyLockedAbilitySetup(nextTickets, spec);
    ticketsRef.current = configuredTickets;
    cancelledAutoBetRef.current.delete(index);
    setTickets(configuredTickets);
    const choiceName = roleById[ticket.roleId].name;
    showToast(`下注 ${index + 1} 已鎖定`, `${choiceName} · ${money(ticket.amount)} 籌碼`, "good");
    tone(520);
    haptic(14);
  }, [haptic, showToast, tone]);

  const cancelBet = useCallback((index: number) => {
    const result = cancelPendingBet({
      tickets: ticketsRef.current,
      balance: balanceRef.current,
      index,
      phase: phaseRef.current,
      now: performance.now(),
      deadline: betDeadlineRef.current,
    });
    if (!result.refund) return;
    result.cancelledIndexes.forEach((ticketIndex) => cancelledAutoBetRef.current.add(ticketIndex));
    balanceRef.current = result.balance;
    const resetTickets = result.tickets.map((ticket, ticketIndex) => result.cancelledIndexes.includes(ticketIndex) ? {
      ...ticket,
      peapodThreshold: null,
      peapodFactor: null,
      pumpkinContract: settlePumpkinCrash(ticket.pumpkinContract),
    } : ticket);
    const cancelledTickets = roundSpecRef.current ? applyLockedAbilitySetup(resetTickets, roundSpecRef.current) : resetTickets;
    ticketsRef.current = cancelledTickets;
    setBalance(result.balance);
    setTickets(cancelledTickets);
    const autoNextRound = result.cancelledIndexes.some((ticketIndex) => cancelledTickets[ticketIndex].autoBet);
    showToast(
      `已取消下注 ${index + 1}`,
      `退回 ${money(result.refund)} 籌碼${autoNextRound ? " · AUTO 下一局繼續" : ""}`,
      "good",
    );
    tone(440, .1, "triangle");
    haptic(12);
  }, [haptic, showToast, tone]);

  const activateSafeRun = useCallback((settledTickets: Ticket[]) => {
    if (safeRunRef.current.active) return;
    const activeTickets = settledTickets.filter((ticket) => ticket.enabled && ticket.placed);
    if (!activeTickets.length || activeTickets.some((ticket) => ticket.status !== "cashed" || !ticket.cashAt)) return;
    const spec = roundSpecRef.current;
    if (!spec) return;
    const cashAt = Math.max(...activeTickets.map((ticket) => ticket.cashAt ?? 1));
    const nextSafeRun = createVisualNearMiss(cashAt, spec.crashPoint, spec.nearMissUnit);
    safeRunRef.current = nextSafeRun;
    setSafeRun(nextSafeRun);
  }, []);

  const cashOut = useCallback((index: number, at: number, automatic = false) => {
    if (phaseRef.current !== "running") return;
    const currentTickets = ticketsRef.current;
    const current = currentTickets[index];
    if (!current || current.status !== "running" || current.remaining <= 0) return;
    const abilityRolls = showcaseModeRef.current
      ? forcedAbilityRolls
      : roundSpecRef.current?.abilityRolls[index] ?? forcedAbilityRolls;
    const roundRoleIds = selectedRoundRoleIds(currentTickets);
    const spec = roundSpecRef.current;
    const duoRuntime = roundRoleIds.length === 2 && spec ? runtimeForTicket(roundRoleIds, spec, index, showcaseModeRef.current) : null;
    if ((current.roleId === "tomato" || ["auto", "reveal-auto"].includes(duoRuntime?.rule.kind ?? "")) && !automatic) {
      showToast("本局會自動 Cash Out", duoRuntime ? "融合能力已鎖定本局收成點" : "番茄將在 2.00×–5.00× 自動收成", "bad");
      tone(210);
      return;
    }

    if (current.pumpkinContract.active) {
      const contract = current.pumpkinContract;
      if (!contract.active || at + 1e-9 < contract.target) {
        showToast("連續挑戰尚未達標", `本關需到 ${contract.target.toFixed(2)}×`, "bad");
        tone(210);
        return;
      }
      const challenge = settlePumpkinCashout(contract, at);
      if (!challenge.accepted) return;
      const cleared = challenge.complete ? contract.stages : challenge.contract.clears;
      const contractTitle = duoRuleFor(roundRoleIds)?.title ?? "南瓜三連關";
      const note = challenge.complete
        ? `${contractTitle}完成：總倍率×${contract.factor}`
        : `${contractTitle}第 ${cleared}/${contract.stages} 關成功：等待下一局`;
      const next = currentTickets.map((ticket, ticketIndex) => ticketIndex === index ? {
        ...ticket,
        payout: challenge.payout,
        cashAt: at,
        remaining: 0,
        status: "cashed" as const,
        pumpkinContract: challenge.contract,
        note,
      } : ticket);
      if (challenge.payout > 0) {
        const nextBalance = balanceRef.current + challenge.payout;
        balanceRef.current = nextBalance;
        setBalance(nextBalance);
      }
      ticketsRef.current = next;
      setTickets(next);
      activateSafeRun(next);
      triggerSkillFx(current.roleId, index, challenge.complete ? `${contractTitle} ×${contract.factor}！` : `${contractTitle} ${cleared}/${contract.stages}！`);
      showToast(
        challenge.complete ? `${contractTitle}完成！` : `${contractTitle}第 ${cleared}/${contract.stages} 關成功`,
        challenge.complete ? `派彩 +${money(challenge.payout)}` : `已記錄 ${at.toFixed(2)}× · BET繼續鎖定`,
        "gold",
      );
      tone(challenge.complete ? 1080 : 820, challenge.complete ? .22 : .14, "triangle");
      haptic(challenge.complete ? [20, 22, 20, 22, 40] : [18, 24, 18]);
      return;
    }

    const stake = current.amount;
    const settlement = settleSuccessfulCashout(current.roleId, stake, at, abilityRolls, roundRoleIds, {
      peapodThreshold: current.peapodThreshold ?? undefined,
      peapodFactor: current.peapodFactor ?? undefined,
      duoRuntime: duoRuntime ?? undefined,
    });
    const paid = settlement.payout;
    const roleNote = current.roleId === "tomato" && !settlement.note
      ? `番茄：在 ${at.toFixed(2)}× 自動收成`
      : "";
    const note = [roleNote, settlement.note].filter(Boolean).join(" · ");
    const skillTone: "good" | "gold" = settlement.outcome === "bonus" ? "gold" : "good";
    if (current.roleId === "tomato" && !settlement.triggeredRoleIds.includes("tomato")) {
      triggerSkillFx("tomato", index, "隨機收成！");
    }
    const labels: Partial<Record<RoleId, string>> = {
      potato: "馬鈴薯 · 早收 ×2！",
      chili: "辣椒 · 高倍 ×2！",
      tomato: "番茄旋轉收成 ×3！",
      peapod: `豌豆暴擊 ×${Math.round(paid / Math.max(1, stake * at))}！`,
      mushroom: "蘑菇 · JACKPOT ×8！",
    };
    settlement.triggeredRoleIds.forEach((roleId) => triggerSkillFx(
      roleId,
      index,
      duoRuntime ? `${duoRuntime.rule.title} ×${duoRuntime.factor}！` : labels[roleId] ?? "角色能力觸發！",
    ));
    const next = currentTickets.map((ticket, ticketIndex) => {
      if (ticketIndex !== index) return ticket;
      return {
        ...ticket,
        payout: paid,
        cashAt: at,
        remaining: 0,
        status: "cashed" as const,
        note,
      };
    });

    const nextBalance = balanceRef.current + paid;
    balanceRef.current = nextBalance;
    ticketsRef.current = next;
    setBalance(nextBalance);
    setTickets(next);
    activateSafeRun(next);

    if (note) showToast(note, `下注 ${index + 1} +${money(paid)}`, skillTone);
    else showToast(`下注 ${index + 1} Cash Out`, `${at.toFixed(2)}× · +${money(paid)}`, "good");
    tone(skillTone === "gold" ? 930 : 720, .13, "sine");
    haptic(skillTone === "gold" ? [18, 28, 24] : 18);
  }, [activateSafeRun, haptic, showToast, tone, triggerSkillFx]);

  const settleCrash = useCallback((crashPoint: number) => {
    const currentTickets = ticketsRef.current;
    const roundRoleIds = selectedRoundRoleIds(currentTickets);
    let recovered = 0;
    const triggered: { roleId: RoleId; ticketIndex: number; label: string }[] = [];
    const settled = currentTickets.map((ticket, ticketIndex) => {
      if (!ticket.enabled || !ticket.placed || ticket.status !== "running" || ticket.remaining <= 0) return ticket;
      if (ticket.pumpkinContract.active) return {
        ...ticket,
        status: "lost" as const,
        payout: 0,
        remaining: 0,
        pumpkinContract: settlePumpkinCrash(ticket.pumpkinContract),
        note: `連續挑戰失敗：爆點 ${crashPoint.toFixed(2)}×`,
      };
      const abilityRolls = showcaseModeRef.current
        ? forcedAbilityRolls
        : roundSpecRef.current?.abilityRolls[ticketIndex] ?? forcedAbilityRolls;
      const settlement = settleCrashRole(ticket.roleId, ticket.amount, crashPoint, abilityRolls, roundRoleIds);
      recovered += settlement.payout;
      if (settlement.triggeredRoleIds.length) {
        triggered.push({
          roleId: ticket.roleId,
          ticketIndex,
          label: "角色能力觸發！",
        });
      }
      return {
        ...ticket,
        status: "lost" as const,
        payout: settlement.payout,
        remaining: 0,
        note: settlement.note || `爆點 ${crashPoint.toFixed(2)}×`,
      };
    });
    if (recovered > 0) {
      const nextBalance = balanceRef.current + recovered;
      balanceRef.current = nextBalance;
      setBalance(nextBalance);
      triggered.forEach((effect) => triggerSkillFx(effect.roleId, effect.ticketIndex, effect.label));
      showToast("爆掉救援成功！", `返還 +${money(recovered)}`, "gold");
      tone(980, .2, "triangle");
      haptic([20, 20, 34]);
    }
    ticketsRef.current = settled;
    setTickets(settled);
  }, [haptic, showToast, tone, triggerSkillFx]);

  const startRace = useCallback(() => {
    const currentSpec = roundSpecRef.current;
    if (phaseRef.current !== "betting" || !currentSpec || roundStartCommittedRef.current) return false;
    roundStartCommittedRef.current = true;
    betDeadlineRef.current = 0;
    const currentTickets = ticketsRef.current;
    const regularBaseRtp = calibrateRoundBaseRtp(ticketsToRtpWagers(currentTickets, currentSpec));
    const activeContracts = currentTickets.flatMap((ticket) => ticket.enabled && ticket.placed && ticket.pumpkinContract.active ? [ticket.pumpkinContract] : []);
    const baseRtp = activeContracts.length ? activeContracts[0].baseRtp : regularBaseRtp;
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
    const nextTickets = currentTickets.map((ticket) => ticket.enabled && ticket.placed ? { ...ticket, status: "running" as const } : ticket);
    ticketsRef.current = nextTickets;
    setTickets(nextTickets);
    setAutoCashInputs(nextTickets.map((ticket) => ticket.pumpkinContract.active
      ? (ticket.pumpkinContract.ruleKey === "chili|pumpkin" ? Math.max(ticket.pumpkinContract.target, ticket.autoCashTarget) : ticket.pumpkinContract.target).toFixed(2)
      : ticket.autoCashTarget.toFixed(2)));
    tone(430, 0.16, "square");
    return true;
  }, [tone]);

  const startRaceEarly = useCallback(() => {
    if (!canStartRoundEarly(phaseRef.current, Boolean(roundSpecRef.current), ticketsRef.current.filter((ticket) => ticket.enabled && ticket.placed).length, performance.now(), betDeadlineRef.current)) return;
    startRace();
  }, [startRace]);

  const beginRound = useCallback(() => {
    cancelledAutoBetRef.current.clear();
    betDeadlineRef.current = 0;
    roundStartCommittedRef.current = false;
    countdownTickRef.current = BETTING_SECONDS;
    setMultiplier(1);
    setCountdown(BETTING_SECONDS);
    roundSpecRef.current = null;
    setRoundSpec(null);
    phaseRef.current = "betting";
    setPhase("betting");
    setRoundNo((value) => value + 1);
    setSkillEffects([]);
    safeRunRef.current = idleSafeRun;
    setSafeRun(idleSafeRun);
    const nextTickets = ticketsRef.current.map((ticket) => {
      const continuesContract = ticket.pumpkinContract.active;
      return {
        ...ticket,
        status: continuesContract ? "placed" as const : "idle" as const,
        placed: continuesContract,
        payout: 0,
        cashAt: null,
        remaining: 1,
        autoRoleTarget: null,
        peapodThreshold: null,
        peapodFactor: null,
        note: continuesContract ? `連續挑戰第 ${ticket.pumpkinContract.clears + 1}/${ticket.pumpkinContract.stages} 關待跑` : "",
      };
    });
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
    betDeadlineRef.current = performance.now() + BETTING_SECONDS * 1000;
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
    startRace();
  }, [countdown, phase, roundSpec, startRace]);

  useEffect(() => {
    if (phase !== "betting") return;
    const timer = setTimeout(() => {
      ticketsRef.current.forEach((ticket, index) => {
        if (ticket.enabled && ticket.autoBet && !ticket.placed) placeBet(index, true);
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
      const placedRoleIds = selectedRoundRoleIds(ticketsRef.current);
      ticketsRef.current.forEach((ticket, index) => {
        if (ticket.status !== "running") return;
        const spec = roundSpecRef.current;
        const runtime = placedRoleIds.length === 2 && spec ? runtimeForTicket(placedRoleIds, spec, index, showcaseModeRef.current) : null;
        const manualContract = ticket.pumpkinContract.active && ticket.pumpkinContract.ruleKey === "chili|pumpkin";
        const target = manualContract
          ? ticket.autoCash ? Math.max(ticket.pumpkinContract.target, ticket.autoCash) : null
          : ticket.pumpkinContract.active
          ? ticket.pumpkinContract.target
          : runtime?.rule.kind === "auto" ? runtime.autoTarget
          : runtime?.rule.kind === "reveal-auto" ? runtime.threshold
          : usesTomatoAuto(ticket) ? ticket.autoRoleTarget : ticket.autoCash;
        if (target && target <= crashPoint && nextMultiplier >= target) cashOut(index, target, true);
      });
      const roundEndPoint = safeRunRef.current.active ? safeRunRef.current.visualEnd : crashPoint;
      if (nextMultiplier >= roundEndPoint) {
        setMultiplier(roundEndPoint);
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
  const caughtCount = tickets.filter((ticket) => ticket.status === "lost").length;
  const stakeLocked = tickets.some((ticket) => ticket.placed || ticket.pumpkinContract.active);
  const selectedRoleIds = tickets.map((ticket) => ticket.roleId);
  const placedRoleIds = tickets.filter((ticket) => ticket.enabled && ticket.placed).map((ticket) => ticket.roleId);
  const duoDescription = describeDuoPair(selectedRoleIds);
  const selectedDuoRule = duoRuleFor(selectedRoleIds);
  const duoActive = placedCount === 2;
  const duoPreviewActive = phase === "betting" && !duoActive;
  const duoFusionActive = duoActive;
  const duoIdentityVisible = duoActive || duoPreviewActive;
  const fixedManualContract = (phase === "betting" || duoActive) && selectedDuoRule?.kind === "contract" && selectedDuoRule.targetMode === "fixed";
  const duoSameRole = selectedRoleIds[0] === selectedRoleIds[1];
  const currentDuoRuntimes = tickets.map((_, ticketIndex) => duoActive && roundSpec
    ? runtimeForTicket(placedRoleIds, roundSpec, ticketIndex, showcaseMode)
    : null);
  const currentDuoRuntime = currentDuoRuntimes[0];
  const selectedAutoRange = selectedDuoRule?.kind === "auto"
    ? `${selectedDuoRule.autoMin}–${selectedDuoRule.autoMax}×`
    : selectedDuoRule?.kind === "reveal-auto"
      ? `${selectedDuoRule.thresholds?.[0]}–${selectedDuoRule.thresholds?.at(-1)}×`
      : "";
  const duoCardDetail = (ticket: Ticket, ticketIndex: number) => {
    const runtime = currentDuoRuntimes[ticketIndex];
    if (ticket.pumpkinContract.active && (phase !== "betting" || ticket.pumpkinContract.clears > 0)) {
      return `${duoDescription.summary}｜本注 ${ticket.pumpkinContract.target.toFixed(2)}×｜進度 ${ticket.pumpkinContract.clears}/${ticket.pumpkinContract.stages}`;
    }
    if (phase !== "betting" && runtime && ["reveal", "reveal-auto"].includes(runtime.rule.kind)) {
      return `本注門檻 ${runtime.threshold}×｜倍獎×${runtime.factor}｜${Math.round((runtime.rule.chance ?? 0) * 100)}%機率觸發`;
    }
    if (phase !== "betting" && runtime?.rule.kind === "auto") {
      return `本注 ${runtime.autoTarget?.toFixed(2)}× 自動Cash Out｜${Math.round((runtime.rule.chance ?? 0) * 100)}%機率派彩×${runtime.factor}`;
    }
    return duoDescription.summary;
  };
  const manualCurveActive = !["auto", "reveal-auto"].includes(currentDuoRuntime?.rule.kind ?? "")
    && tickets.some((ticket) => ticket.enabled && ticket.placed && !ticket.pumpkinContract.active && !usesTomatoAuto(ticket) && !ticket.autoCash);

  const stageMessage = (() => {
    if (phase === "betting") {
      if (duoActive) return `${duoDescription.title}已啟動，準備開跑`;
      return placedCount ? `${placedCount} 注已鎖定，準備開跑` : "選擇角色並在倒數前下注";
    }
    if (phase === "crashed") return `爆點 ${(safeRun.active ? safeRun.naturalEnd : multiplier).toFixed(2)}×`;
    if (!placedCount) return "本局觀戰中";
    if (safeRun.active) return "已全數 Cash Out";
    if (!runningCount) return "本局已完成結算";
    if (duoActive) return duoDescription.shortSummary;
    return "在收割者追上前 Cash Out！";
  })();

  const stageProgress = phase === "betting"
    ? Math.max(4, ((BETTING_SECONDS - countdown) / BETTING_SECONDS) * 100)
    : Math.min(96, 12 + Math.log(Math.max(1, multiplier)) * 34);
  // This is an intentionally non-predictive show meter. It only follows visible
  // run time and never reads the committed crash point.
  const visualRunTime = Math.log(Math.max(1, multiplier)) * 5.2;
  let chasePressure = phase === "running"
    ? Math.min(84, Math.max(12,
        43
        + Math.sin(visualRunTime * 1.7) * 20
        + Math.sin(visualRunTime * 3.9 + .8) * 9
        + Math.min(9, visualRunTime * .42),
      ))
    : phase === "crashed" ? 100 : 0;
  if (phase === "running" && safeRun.extended) {
    const tailSpan = Math.max(.01, safeRun.visualEnd - safeRun.cashAt);
    const tailProgress = Math.min(1, Math.max(0, (multiplier - safeRun.cashAt) / tailSpan));
    chasePressure = Math.min(92, Math.max(chasePressure, 68 + tailProgress * 19 + Math.sin(visualRunTime * 4.1) * 4));
  }
  const meterProgress = chasePressure;
  const worldSpeed = Math.max(.34, 1.05 - Math.log(Math.max(1, multiplier)) * .16);
  const runnerScale = phase === "betting" ? 1 : Math.max(.5, 1 - stageProgress * .0052);

  const chooseRole = (ticketIndex: number, roleId: RoleId) => {
    const ticket = ticketsRef.current[ticketIndex];
    if (!canEditUnplacedTicket(ticket)) return;
    const next = ticketsRef.current.map((current, index) => index === ticketIndex ? {
      ...current,
      roleId,
      autoCash: roleId === "tomato" ? null : current.autoCash,
    } : current);
    const nextRule = duoRuleFor(next.map((current) => current.roleId));
    const nextFixedTarget = nextRule?.kind === "contract" && nextRule.targetMode === "fixed" ? nextRule.target : null;
    ticketsRef.current = next;
    setTickets(next);
    setAutoCashInputs(next.map((current) => nextFixedTarget
      ? Math.max(nextFixedTarget, current.autoCashTarget).toFixed(2)
      : current.autoCashTarget.toFixed(2)));
    tone(650);
  };

  const changeStake = (ticketIndex: number, delta: number) => {
    if (stakeLocked || !canEditUnplacedTicket(ticketsRef.current[ticketIndex])) return;
    const currentAmount = ticketsRef.current[ticketIndex].amount;
    const nextAmount = delta > 0 && currentAmount < 50
        ? 50
        : delta < 0 && currentAmount <= 50
          ? 10
          : currentAmount + delta;
    const sharedAmount = Math.max(10, Math.min(5000, nextAmount));
    const next = ticketsRef.current.map((ticket) => ({ ...ticket, amount: sharedAmount }));
    ticketsRef.current = next;
    setTickets(next);
    tone(delta > 0 ? 610 : 460, .045, "triangle");
  };

  const toggleAutoBet = (ticketIndex: number) => {
    const ticket = ticketsRef.current[ticketIndex];
    if (ticket.pumpkinContract.active) return;
    const willEnable = !ticket.autoBet;
    if (willEnable) cancelledAutoBetRef.current.delete(ticketIndex);
    updateTicket(ticketIndex, (current) => ({ ...current, autoBet: !current.autoBet }));
    tone(ticket.autoBet ? 410 : 590, .055, "triangle");
    if (willEnable && phaseRef.current === "betting" && !ticket.placed) setTimeout(() => placeBet(ticketIndex, true), 0);
  };

  const toggleAutoCash = (ticketIndex: number) => {
    const ticket = ticketsRef.current[ticketIndex];
    if (!canEditUnplacedTicket(ticket) || usesTomatoAuto(ticket)) return;
    const minTarget = fixedManualContract ? selectedDuoRule.target : 1.01;
    const maxTarget = !fixedManualContract && ticket.roleId === "pumpkin" ? 2.88 : MAX_SETTLEMENT_MULTIPLIER;
    const target = normalizeAutoCashInput(ticket.autoCashTarget, minTarget, maxTarget, minTarget);
    updateTicket(ticketIndex, (current) => ({ ...current, autoCashTarget: target, autoCash: current.autoCash ? null : target }));
    setAutoCashInputs((current) => current.map((value, index) => index === ticketIndex ? target.toFixed(2) : value));
    tone(ticket.autoCash ? 410 : 590, .055, "triangle");
  };

  const changeAutoCashTarget = (ticketIndex: number, nextValue: number) => {
    const ticket = ticketsRef.current[ticketIndex];
    if (!canEditUnplacedTicket(ticket)) return;
    const minTarget = fixedManualContract ? selectedDuoRule.target : 1.01;
    const maxTarget = !fixedManualContract && ticket.roleId === "pumpkin" ? 2.88 : MAX_SETTLEMENT_MULTIPLIER;
    const target = normalizeAutoCashInput(nextValue, minTarget, maxTarget, ticket.autoCashTarget);
    updateTicket(ticketIndex, (current) => ({
      ...current,
      autoCashTarget: target,
      autoCash: current.autoCash ? target : null,
    }));
    setAutoCashInputs((current) => current.map((value, index) => index === ticketIndex ? target.toFixed(2) : value));
  };

  const commitAutoCashInput = (ticketIndex: number) => {
    const ticket = ticketsRef.current[ticketIndex];
    const minTarget = fixedManualContract ? selectedDuoRule.target : 1.01;
    const maxTarget = !fixedManualContract && ticket.roleId === "pumpkin" ? 2.88 : MAX_SETTLEMENT_MULTIPLIER;
    changeAutoCashTarget(ticketIndex, normalizeAutoCashInput(autoCashInputs[ticketIndex], minTarget, maxTarget, ticket.autoCashTarget));
  };

  const ticketAction = (ticketIndex: number) => {
    if (phaseRef.current === "betting") {
      if (ticketsRef.current[ticketIndex].placed) cancelBet(ticketIndex);
      else placeBet(ticketIndex);
    } else if (phaseRef.current === "running") cashOut(ticketIndex, Math.floor(multiplier * 100 + 1e-9) / 100);
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

  const ticketActionLabel = (ticket: Ticket, ticketIndex: number) => {
    const ticketDuoRuntime = currentDuoRuntimes[ticketIndex];
    if (phase === "betting" && ticket.pumpkinContract.active && ticket.pumpkinContract.clears > 0) {
      return `BET LOCKED · ${ticket.pumpkinContract.clears + 1}/${ticket.pumpkinContract.stages}`;
    }
    if (phase === "betting") return ticket.placed
      ? "取消下注"
      : roundSpec ? "BET" : "PREPARING";
    if (phase === "crashed") {
      if (ticket.status === "cashed" && ticket.pumpkinContract.active) return "STAGE CLEAR";
      if (ticket.note.includes("完成：總倍率")) return `WIN ${money(ticket.payout)}`;
      if (ticket.note.includes("連續挑戰失敗")) return "CHALLENGE LOST";
      if (ticket.status === "cashed") return `WIN ${money(ticket.payout)}`;
      return "NEXT ROUND";
    }
    if (!ticket.placed) return "NO BET";
    if (ticket.status === "cashed" && ticket.pumpkinContract.active) return `STAGE ${ticket.pumpkinContract.clears}/${ticket.pumpkinContract.stages} CLEAR`;
    if (ticket.status === "cashed") return `WIN ${money(ticket.payout)}`;
    if (["auto", "reveal-auto"].includes(ticketDuoRuntime?.rule.kind ?? "")) return `AUTO ${(ticketDuoRuntime?.autoTarget ?? ticketDuoRuntime?.threshold)?.toFixed(2)}×`;
    if (usesTomatoAuto(ticket)) return "AUTO 2–5×";
    if (ticket.status !== "running") return "SETTLED";
    return `CASH OUT · ${money(ticket.amount * multiplier)}`;
  };

  const ticketActionDisabled = (ticket: Ticket, ticketIndex: number) =>
    (phase === "betting" && (!roundSpec || countdown <= 0)) ||
    (phase === "betting" && ticket.pumpkinContract.active && ticket.pumpkinContract.clears > 0) ||
    phase === "crashed" ||
    (phase === "running" && ticket.status !== "running") ||
    (phase === "running" && multiplier < 1.01) ||
    (phase === "running" && (usesTomatoAuto(ticket) || ["auto", "reveal-auto"].includes(currentDuoRuntimes[ticketIndex]?.rule.kind ?? "")));

  return (
    <main className="game-shell">
      <section
        className={`game-phone phase-${phase} ${placedCount > 0 ? "has-bets" : "no-bets"} ${duoFusionActive ? "duo-active" : ""} ${safeRun.active ? "safe-run-active" : ""} ${safeRun.extended ? "near-miss-active" : ""} ${phase === "betting" && countdown <= 3 ? "is-countdown-urgent" : ""} ${phase === "running" && chasePressure >= 70 ? "is-chase-close" : ""}`}
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
            <span>{phase === "betting" ? Math.ceil(countdown) : `${(phase === "crashed" && safeRun.active ? safeRun.naturalEnd : multiplier).toFixed(2)}×`}</span>
            <small>{phase === "betting" ? roundSpec ? `ROUND ${roundNo} · ${placedCount}/2 BETS` : "PREPARING FAIR ROUND" : stageMessage}</small>
            {phase === "betting" && <button className="run-now-button" disabled={!roundSpec || placedCount < 1 || countdown <= 0} onClick={startRaceEarly}>RUN</button>}
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
                  className={`road-runner runner-${index + 1} status-${ticket.status} ${phase === "running" && ticket.status === "cashed" ? "cashout-lap" : ""} ${skillEffects.some((effect) => effect.ticketIndex === index) ? "skill-active" : ""}`}
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
          <div className="skill-fx-layer" aria-live="polite">
            {skillEffects.map((effect) => {
              const laneOrigin = effect.ticketIndex === null || placedCount === 1
                ? 50
                : effect.ticketIndex === 0 ? 43 : 61;
              const x = 50 + (laneOrigin - 50) * (1 - stageProgress / 240);
              return <SkillEffect effect={effect} x={x} key={effect.id} />;
            })}
          </div>
          {phase !== "betting" && (
            <div className="fox-pursuers" aria-hidden="true">
              {(() => {
                const hasPlacedTicket = tickets.some((ticket) => ticket.enabled && ticket.placed);
                const hasUnfinishedTicket = tickets.some((ticket) => ticket.enabled && ticket.placed && ticket.status === "running");
                const shouldRender = hasPlacedTicket && (phase === "running" || (phase === "crashed" && caughtCount > 0));
                if (!shouldRender) return null;
                const laneWave = Math.sin(visualRunTime * 2.35) * 5;
                const foxPressure = phase === "crashed" ? 100 : Math.min(88, Math.max(8, chasePressure + laneWave));
                const foxX = 50 + laneWave * .2;
                return (
                  <div
                    className={`fox-pursuer fox-shared ${phase === "running" && !hasUnfinishedTicket && !safeRun.active ? "fox-retired" : ""}`}
                    style={{
                      "--chase-pressure": foxPressure,
                      "--fox-opacity": phase === "crashed" ? 1 : Math.min(1, .7 + foxPressure / 380),
                      "--fox-x": `${foxX}%`,
                    } as CSSProperties}
                  />
                );
              })()}
            </div>
          )}
          {phase === "crashed" && caughtCount > 0 && (
            <div className={`capture-overlay ${caughtCount > 1 ? "capture-multi" : ""}`} role="status" aria-label={`Captured at ${multiplier.toFixed(2)} times`}>
              {tickets.map((ticket, index) => ticket.enabled && ticket.placed && ticket.status === "lost" && (
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
            <div className={`result-ribbon ${tickets.some((ticket) => ticket.enabled && ticket.placed && ticket.payout > 0) ? "has-win" : ""}`} role="status" aria-label="本局下注結果">
              {tickets.map((ticket, index) => {
                if (!ticket.enabled || !ticket.placed) return null;
                const recovered = ticket.status === "lost" && ticket.payout > 0;
                const contractClear = ticket.status === "cashed" && ticket.pumpkinContract.active;
                const contractComplete = ticket.note.includes("完成：總倍率");
                const contractLost = ticket.note.includes("連續挑戰失敗");
                const resultLabel = contractClear
                  ? `STAGE ${ticket.pumpkinContract.clears} CLEAR`
                  : contractComplete ? `${ticket.pumpkinContract.stages} STAGE WIN`
                  : contractLost ? "CHALLENGE LOST"
                  : ticket.status === "cashed"
                  ? "CASH OUT SUCCESS"
                  : recovered ? "RECOVERED" : "CAUGHT";
                const resultValue = contractClear
                  ? `LOCKED ${ticket.pumpkinContract.multipliers.reduce((sum, value) => sum + value, 0).toFixed(2)}×`
                  : ticket.payout > 0 ? `WIN +${money(ticket.payout)}` : `${multiplier.toFixed(2)}×`;
                return (
                  <span className={recovered ? "result-cashed result-recovered" : `result-${ticket.status}`} key={index}>
                    <b>{index + 1}</b>
                    <i>{resultLabel}</i>
                    <strong>{resultValue}</strong>
                  </span>
                );
              })}
            </div>
          )}
          {phase === "running" && <div className="signal-indicator" aria-label="連線穩定"><span><i /><i /><i /></span><small>LOCAL</small></div>}
          {phase === "betting" && duoFusionActive && (
            <div className="duo-activation" role="status" aria-live="polite">
              <span>DUO LINK</span>
              <strong>連攜啟動！</strong>
              <b>{duoDescription.title}</b>
              <small>{duoDescription.shortSummary}</small>
            </div>
          )}
          <button className="fair-link" onClick={() => setFairOpen(true)}>FAIR ✓</button>
        </section>

        <section className="bet-zone">
          {duoFusionActive && phase === "betting" && <div className="duo-bridge" aria-label={`${duoDescription.title}融合中`}><i>🔗</i><strong>{duoDescription.title}</strong><span>融合中</span></div>}
          {tickets.map((ticket, ticketIndex) => {
            const role = roleById[ticket.roleId];
            const canEdit = canEditUnplacedTicket(ticket);
            const duoForcesAuto = duoActive && ["auto", "reveal-auto"].includes(selectedDuoRule?.kind ?? "");
            const tomatoAuto = usesTomatoAuto(ticket) || duoForcesAuto;
            const duoContract = duoActive && selectedDuoRule?.kind === "contract";
            const pumpkinChallenge = !fixedManualContract && (ticket.roleId === "pumpkin" || ticket.pumpkinContract.active || duoContract);
            const challengeTargetEditable = !duoContract || selectedDuoRule?.targetMode === "selected";
            const minAutoCash = fixedManualContract ? selectedDuoRule.target : 1.01;
            const maxAutoCash = !fixedManualContract && ticket.roleId === "pumpkin" ? 2.88 : MAX_SETTLEMENT_MULTIPLIER;
            const roleDetail = duoActive || duoPreviewActive
              ? duoCardDetail(ticket, ticketIndex)
              : ticket.roleId === "peapod"
                ? phase === "betting" || !ticket.placed || ticket.peapodThreshold === null || ticket.peapodFactor === null
                  ? "開跑揭曉2～5×門檻與倍獎"
                  : `本局門檻 ${ticket.peapodThreshold?.toFixed(0)}×｜倍獎×${ticket.peapodFactor}`
                : ticket.pumpkinContract.active
                  ? `連續挑戰 ${ticket.pumpkinContract.clears}/${ticket.pumpkinContract.stages} · 目標 ${ticket.pumpkinContract.target.toFixed(2)}× · 完成×${ticket.pumpkinContract.factor}`
                  : role.detail;
            return (
              <article className={`bet-card status-${ticket.status} ${ticket.placed ? "is-placed" : ""} ${ticket.note.includes("：") ? "skill-triggered" : ""} ${duoFusionActive ? "has-duo" : ""}`} key={ticketIndex}>
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
                  <div className={`role-name-row ${duoIdentityVisible ? "is-duo" : ""}`}>
                    <strong>{duoIdentityVisible
                      ? duoSameRole
                        ? <span className="duo-role is-current">{role.name}×2</span>
                        : <>{selectedRoleIds.map((roleId, index) => <Fragment key={roleId}><span className={`duo-role ${index === ticketIndex ? "is-current" : "is-partner"}`}>{roleById[roleId].name}</span>{index === 0 && <span className="duo-plus">＋</span>}</Fragment>)}</>
                      : role.name}</strong>
                    {duoIdentityVisible && <small className="role-ticket-label">{ticketIndex + 1} · {role.name}</small>}
                  </div>
                  <p>{duoIdentityVisible && <><b className="duo-inline-title">{duoDescription.title}</b>｜</>}{roleDetail}</p>
                </div>

                <div className="amount-stepper">
                  <button disabled={stakeLocked || !canEdit || ticket.amount <= 10} aria-label={`下注 ${ticketIndex + 1} 減少金額`} onClick={() => changeStake(ticketIndex, -50)}>−</button>
                  <strong>{money(ticket.amount)}</strong>
                  <button disabled={stakeLocked || !canEdit || ticket.amount >= 5000} aria-label={`下注 ${ticketIndex + 1} 增加金額`} onClick={() => changeStake(ticketIndex, 50)}>＋</button>
                </div>

                <button
                  className={`bet-action ${phase === "running" && ticket.status === "running" ? "cash-mode" : ""} ${phase === "betting" && ticket.placed ? "cancel-mode" : ""}`}
                  disabled={ticketActionDisabled(ticket, ticketIndex)}
                  onClick={() => ticketAction(ticketIndex)}
                >
                  {ticketActionLabel(ticket, ticketIndex)}
                </button>

                <div className="card-options">
                  <div className="option-control">
                    <span>AUTO</span>
                    <button
                      className={`toggle ${ticket.autoBet ? "on" : ""}`}
                      disabled={ticket.pumpkinContract.active}
                      aria-pressed={ticket.autoBet}
                      aria-label={`下注 ${ticketIndex + 1} 自動下注`}
                      onClick={() => toggleAutoBet(ticketIndex)}
                    ><i /></button>
                  </div>
                  <div className="option-control auto-cash-control">
                    <span>{pumpkinChallenge ? "CHALLENGE TARGET" : `AUTO CASHOUT ${fixedManualContract ? `${selectedDuoRule.target}×+` : duoForcesAuto ? selectedAutoRange : tomatoAuto ? "2–5×" : ""}`}</span>
                    {!tomatoAuto && (!pumpkinChallenge || challengeTargetEditable) && (
                      <div className="auto-cash-setting">
                        <button
                          disabled={!canEdit || ticket.autoCashTarget <= minAutoCash}
                          aria-label={`下注 ${ticketIndex + 1} 降低自動 Cash Out 倍率`}
                          onClick={() => changeAutoCashTarget(ticketIndex, ticket.autoCashTarget <= minAutoCash + .09 ? minAutoCash : ticket.autoCashTarget - .1)}
                        >−</button>
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*[.,]?[0-9]{0,2}"
                          value={autoCashInputs[ticketIndex]}
                          disabled={!canEdit}
                          aria-label={`下注 ${ticketIndex + 1} 自動 Cash Out 倍率`}
                          onChange={(event) => isAutoCashInputDraft(event.target.value) && setAutoCashInputs((current) => current.map((value, index) => index === ticketIndex ? event.target.value : value))}
                          onBlur={() => commitAutoCashInput(ticketIndex)}
                          onFocus={(event) => event.currentTarget.select()}
                          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                        />
                        <b>×</b>
                        <button
                          disabled={!canEdit || ticket.autoCashTarget >= maxAutoCash}
                          aria-label={`下注 ${ticketIndex + 1} 提高自動 Cash Out 倍率`}
                          onClick={() => changeAutoCashTarget(ticketIndex, ticket.autoCashTarget <= 1.01 ? 1.1 : ticket.autoCashTarget + .1)}
                        >＋</button>
                      </div>
                    )}
                    <button
                      className={`toggle ${ticket.autoCash || tomatoAuto || pumpkinChallenge ? "on" : ""}`}
                      disabled={!canEdit || tomatoAuto || pumpkinChallenge}
                      aria-pressed={Boolean(ticket.autoCash || tomatoAuto || pumpkinChallenge)}
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
                <article><b>01</b><div><strong>30 秒選角下注</strong><span>下注後可按 RUN 提早開跑；開跑前每注都可單獨取消並退回籌碼。</span></div></article>
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
              <div className="ability-sharing-note">
                <strong>🔗 雙角融合</strong>
                <span>同時下兩注時，兩個角色融合成同一條能力；兩張卡會顯示相同條件，各注獨立判定派彩。</span>
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
              <span className="field-label">本局玩法／組合 VI 曲線</span>
              <code>{phase === "betting" ? "下注鎖定後計算" : `${duoActive ? duoDescription.title : "單注"} · ${((roundSpec?.baseRtp ?? TARGET_RTP) * 100).toFixed(2)}% 基礎曲線 → ${manualCurveActive ? "手動策略最高" : "固定策略"} ${(TARGET_RTP * 100).toFixed(0)}%`}</code>
              <span className="field-label">演算法</span>
              <code>SHA-256 · committed crash unit + selected VI curve + ticket rolls + presentation unit</code>
              <p>開局先承諾 Seed、爆點亂數與角色亂數；下注鎖定後，再依單角或雙角融合能力映射對應 VI 曲線。固定 Auto Cash Out 與連續挑戰依鎖定目標校準至 {(TARGET_RTP * 100).toFixed(0)}%；手動策略使用不高於 {(TARGET_RTP * 100).toFixed(0)}% 的安全曲線。兩注共用同一結算爆點，各注獨立判定能力；Cash Out 後的追跑只屬演出，不改變爆點、派彩或 RTP。</p>
              <button className="sheet-primary" onClick={() => setFairOpen(false)}>完成</button>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
