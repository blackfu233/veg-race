import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { bettingWindowOpen, cancelPendingBet, canEditUnplacedTicket, canStartRoundEarly, isAutoCashInputDraft, normalizeAutoCashInput } from "../app/ticket-actions.mjs";
import { createRecoveryPool, normalizeRecoveryPool, planRecoveryRelease, reserveRecoveryPayout, settleRecoveryPool, settleRecoveryReservation } from "../app/recovery-pool.mjs";
import {
  calibratePumpkinContracts,
  calibratePumpkinCrashCurve,
  calibrateRoundBaseRtp,
  calibrateRoundCrashCurve,
  CORE_RTP,
  crashPointFromUnit,
  crashPointFromCurveUnit,
  createPumpkinContract,
  createVisualNearMiss,
  describeDuoPair,
  DUO_RULES,
  duoRuntimeForTicket,
  duoRuntimeFromRolls,
  expectedCrashPayout,
  expectedRoundReturn,
  expectedSuccessfulPayout,
  expectedPumpkinContractReturn,
  expectedPumpkinContractReturnForCurve,
  expectedRoundReturnForCurve,
  peapodPayoutFactorFromUnit,
  peapodThresholdFromUnit,
  PUMPKIN_MIN_TARGET,
  PUMPKIN_MAX_TARGET,
  pumpkinContractBaseRtp,
  settleCrashRole,
  settlePumpkinCashout,
  settlePumpkinCrash,
  settleSuccessfulCashout,
  survivalAtCurve,
  TARGET_RTP,
} from "../app/rtp-engine.mjs";

const roleIds = ["potato", "chili", "pumpkin", "tomato", "peapod", "mushroom"];
const neutralRolls = { potato: 0.99, chili: 0.99, pumpkin: 0.99, tomato: 0.99, peapod: 0.99, mushroom: 0.99 };
const hitRolls = { potato: 0, chili: 0, pumpkin: 0, tomato: 0, peapod: 0, mushroom: 0 };

test("unplaced panels stay editable independently of the round phase", async () => {
  assert.equal(canEditUnplacedTicket({ placed: false }), true);
  assert.equal(canEditUnplacedTicket({ placed: true }), false);
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.match(source, /const canEdit = canEditUnplacedTicket\(ticket\)/);
  assert.match(source, /cancelledAutoBetRef\.current\.add\(ticketIndex\)/);
  assert.match(source, /automatic && \(!ticket\.autoBet \|\| cancelledAutoBetRef\.current\.has\(index\)\)/);
});

test("keeps both bet panels on one shared stake", async () => {
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.match(source, /const stakeLocked = tickets\.some/);
  assert.match(source, /ticketsRef\.current\.map\(\(ticket\) => \(\{ \.\.\.ticket, amount: sharedAmount \}\)\)/);
  assert.match(source, /disabled=\{stakeLocked \|\| !canEdit/);
});

test("cancellation refunds exactly one pending independent bet and is idempotent", () => {
  const tickets = [
    { placed: true, status: "placed", amount: 100, roleId: "potato", autoBet: true },
    { placed: true, status: "placed", amount: 250, roleId: "chili", autoBet: false },
  ];
  const args = { tickets, balance: 650, index: 0, phase: "betting", now: 100, deadline: 200 };
  const first = cancelPendingBet(args);
  assert.equal(first.balance, 750);
  assert.equal(first.refund, 100);
  assert.deepEqual(first.cancelledIndexes, [0]);
  assert.equal(first.tickets[0].placed, false);
  assert.equal(first.tickets[0].autoBet, true);
  assert.equal(first.tickets[1], tickets[1]);
  assert.equal(tickets[0].placed, true, "input must not be mutated");
  const repeated = cancelPendingBet({ ...args, tickets: first.tickets, balance: first.balance });
  assert.equal(repeated.balance, 750);
  assert.equal(repeated.refund, 0);
});

test("each pending bet can be cancelled separately before the deadline only", () => {
  const tickets = [
    { placed: true, status: "placed", amount: 100 },
    { placed: true, status: "placed", amount: 250 },
  ];
  const args = { tickets, balance: 650, index: 1, phase: "betting", now: 199, deadline: 200 };
  const result = cancelPendingBet(args);
  assert.equal(result.balance, 900);
  assert.equal(result.refund, 250);
  assert.deepEqual(result.cancelledIndexes, [1]);
  assert.equal(result.tickets[0].placed, true);
  assert.equal(result.tickets[1].placed, false);
  assert.equal(cancelPendingBet({ ...args, now: 200 }).refund, 0);
  assert.equal(cancelPendingBet({ ...args, phase: "running" }).refund, 0);
  assert.equal(cancelPendingBet({ ...args, phase: "crashed" }).refund, 0);
  assert.equal(bettingWindowOpen("betting", true, 199, 200), true);
  assert.equal(bettingWindowOpen("betting", false, 199, 200), false);
  assert.equal(bettingWindowOpen("betting", true, 200, 200), false);
});

test("enables early RUN only while betting with at least one placed bet", () => {
  assert.equal(canStartRoundEarly("betting", true, 1, 100, 200), true);
  assert.equal(canStartRoundEarly("betting", true, 0, 100, 200), false);
  assert.equal(canStartRoundEarly("running", true, 1, 100, 200), false);
  assert.equal(canStartRoundEarly("betting", true, 1, 200, 200), false);
});

test("accepts mobile decimal drafts and normalizes auto cashout safely", () => {
  for (const value of ["", "1.", "1,25", "99.00"]) assert.equal(isAutoCashInputDraft(value), true);
  for (const value of ["-1", "1.234", "1..2", "abc"]) assert.equal(isAutoCashInputDraft(value), false);
  assert.equal(normalizeAutoCashInput("1,25", 1.01, 99, 2), 1.25);
  assert.equal(normalizeAutoCashInput("", 1.01, 99, 2), 2);
  assert.equal(normalizeAutoCashInput("3", 5, 99, 5), 5);
  assert.equal(normalizeAutoCashInput("120", 1.01, 99, 2), 99);
});

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("renders the six-role Veggie Dash mobile game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const roleName of ["馬鈴薯", "辣椒", "南瓜", "番茄", "豌豆莢", "蘑菇"]) {
    assert.match(html, new RegExp(roleName));
  }
  for (const removedRoleName of ["秋葵", "雙色玉米", "雙葉青蔥", "花生"]) {
    assert.doesNotMatch(html, new RegExp(removedRoleName));
  }
  assert.match(html, /AUTO CASH OUT/);
  assert.match(html, /type="text"/);
  assert.match(html, /inputMode="decimal"/);
  assert.match(html, />RUN<\/button>/);
  assert.match(html, />30<\/span>/);
  assert.doesNotMatch(html, /特效展示模式|FX 100%/);
  assert.doesNotMatch(html, /class="road-runner\b/, "the road must stay empty before a bet is placed");
  assert.doesNotMatch(html, /class="vertical-meters\b/, "the chase meter must stay hidden during betting");
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.match(source, /雙角融合/);
  assert.match(source, /鎖定下注；連過3局：總獎金×2\.5/);
  assert.match(source, /開跑抽2–5×目標與獎金倍數；達標後20%機率觸發/);
  assert.match(source, /連攜啟動！/);
  assert.match(source, /className="duo-activation"/);
  assert.match(source, /className="duo-bridge"/);
  assert.match(source, /duoDescription\.shortSummary/);
  assert.match(source, /const duoPreviewActive = phase === "betting" && !duoActive/);
  assert.match(source, /duoActive \|\| duoPreviewActive/);
  assert.doesNotMatch(source, /雙注預覽｜/);
  assert.doesNotMatch(source, /stage-duo-preview|目前雙注效果/);
  assert.doesNotMatch(html, /目前雙注效果/);
  assert.equal((html.match(/4×後 Cash Out：35%機率獎金×1\.8/g) ?? []).length, 2);
  assert.equal((html.match(/辣味升級/g) ?? []).length, 2);
  assert.match(source, /selectedRoleIds\[0\] === selectedRoleIds\[1\]/);
  assert.match(source, /className="duo-role is-current"/);
  assert.match(source, /index === ticketIndex \? "is-current" : "is-partner"/);
  assert.match(source, /className="duo-plus">＋<\/span>/);
  assert.match(source, /role-ticket-label/);
  assert.doesNotMatch(source, /combo-copy|combo-badge/);
  assert.doesNotMatch(source, /同場串關|BET BOTH|兩關相乘/);
  assert.doesNotMatch(source, /雙注共享|本注限定/);
  assert.doesNotMatch(source, /主角＋支援|支援醬料|番茄醬|美乃滋|芥末醬|山葵醬|switchGameMode/);
  assert.match(source, /\["localhost", "127\.0\.0\.1"\]\.includes\(window\.location\.hostname\)/);
  assert.match(source, /get\("showcase"\) === "1"/);
});

test("locks the viewport and keeps touch controls zoom-free", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(layout, /maximumScale: 1/);
  assert.match(layout, /userScalable: false/);
  assert.match(styles, /touch-action:manipulation/);
  assert.match(styles, /auto-cash-setting input \{[^}]*font-size:16px/);
  assert.match(styles, /character-grid \{[^}]*repeat\(3/);
  assert.match(styles, /game-phone \{[^}]*height:min\(100dvh,905px\)/);
  assert.match(styles, /grid-template-rows:var\(--stage-height\) minmax\(0,1fr\) var\(--footer-height\)/);
  assert.match(styles, /race-stage \{[^}]*height:100%; min-height:0/);
  assert.match(styles, /bet-zone \{[^}]*grid-template-rows:repeat\(2,minmax\(0,1fr\)\)[^}]*position:relative/);
  assert.doesNotMatch(styles, /race-stage \{[^}]*min-height:3[5-9]0px/);
});

test("ships the active runner and pursuer art set", async () => {
  const assets = [
    "../public/farm-road.webp",
    "../public/pursuer-fox-run.webp",
    "../public/favicon.png",
    "../public/apple-touch-icon.png",
    "../public/og.png",
    ...roleIds.flatMap((roleId) => [
      `../public/role-icons/${roleId}.webp`,
      `../public/runner-sprites/${roleId}-ready.webp`,
      `../public/runner-sprites/${roleId}-run.webp`,
    ]),
  ];
  for (const asset of assets) {
    const info = await stat(new URL(asset, import.meta.url));
    assert.ok(info.size > 1000, `${asset} should contain a usable image`);
  }
});

test("keeps crash and per-role rolls deterministic for each committed round", async () => {
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Math\.random/);
  assert.match(source, /abilityRolls/);
  assert.match(source, /digestHex\(seed \+ ":crash"\)/);
  assert.match(source, /digestHex\(seed \+ ":near-miss"\)/);
  assert.match(source, /abilityKeys = \["potato", "chili", "pumpkin", "tomato", "peapod", "mushroom", "target", "peapodTarget", "peapodPrize"\]/);
  assert.match(source, /digestHex\(`\$\{seed\}:ticket:\$\{index\}:\$\{key\}`\)/);
  assert.match(source, /calibrateRoundCrashCurve\(ticketsToRtpWagers\(currentTickets, currentSpec\)\)/);
});

test("keeps the post-cashout chase visual-only, bounded, and unlabeled", async () => {
  const close = createVisualNearMiss(2, 2.08, 0.5);
  assert.equal(close.active, true);
  assert.equal(close.extended, true);
  assert.equal(close.naturalEnd, 2.08);
  assert.ok(close.visualEnd >= 2.08 && close.visualEnd <= 2.28);
  const far = createVisualNearMiss(2, 3, 0.5);
  assert.equal(far.extended, false);
  assert.equal(far.visualEnd, 3);

  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.match(source, /activeTickets\.some\(\(ticket\) => ticket\.status !== "cashed"/);
  assert.match(source, /roundEndPoint = safeRunRef\.current\.active \? safeRunRef\.current\.visualEnd : crashPoint/);
  assert.match(source, /setHistory\(\(current\) => \[crashPoint,/);
  assert.match(source, /settleCrash\(crashPoint\)/);
  assert.match(source, /Cash Out 後追跑只是演出/);
  assert.doesNotMatch(source, />NEAR MISS</);
  assert.doesNotMatch(source, /安全演出|安全領跑|自然 Near Miss/);
});

test("keeps every duo on one shared crash without parlay settlement", async () => {
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.match(source, /duoRuntimeForTicket/);
  assert.doesNotMatch(source, /settleDuoLink/);
  assert.match(source, /fox-pursuer fox-shared/);
  assert.match(source, /type RoundSpec = \{[\s\S]*?crashPoint: number;[\s\S]*?abilityRolls/);
  assert.doesNotMatch(source, /crashPoint2|crashPoints/);
  assert.doesNotMatch(source, /combinedFactor|parlayMode/);
});

test("replaces both base abilities with one fused rule", () => {
  const potatoChili = duoRuntimeFromRolls(["potato", "chili"], hitRolls);
  assert.equal(settleSuccessfulCashout("chili", 100, 3.99, hitRolls, ["potato", "chili"], { duoRuntime: potatoChili }).payout, 399);
  assert.equal(settleSuccessfulCashout("potato", 100, 4, hitRolls, ["potato", "chili"], { duoRuntime: potatoChili }).payout, 720);

  const chiliMushroom = duoRuntimeFromRolls(["chili", "mushroom"], hitRolls);
  assert.equal(settleSuccessfulCashout("chili", 100, 5, hitRolls, ["chili", "mushroom"], { duoRuntime: chiliMushroom }).payout, 3000);
  assert.equal(settleSuccessfulCashout("mushroom", 100, 5, neutralRolls, ["chili", "mushroom"], { duoRuntime: chiliMushroom }).payout, 500);

  const peaMushroom = duoRuntimeFromRolls(["peapod", "mushroom"], { ...hitRolls, peapodTarget: .99, peapodPrize: .99 });
  assert.equal(peaMushroom.threshold, 5);
  assert.equal(peaMushroom.factor, 8);
  assert.equal(settleSuccessfulCashout("peapod", 100, 4.99, hitRolls, ["peapod", "mushroom"], { duoRuntime: peaMushroom }).payout, 499);
  assert.equal(settleSuccessfulCashout("peapod", 100, 5, hitRolls, ["peapod", "mushroom"], { duoRuntime: peaMushroom }).payout, 4000);
});

test("keeps thresholds and showcase forcing honest", () => {
  assert.equal(settleSuccessfulCashout("potato", 100, 1.5, hitRolls).outcome, "bonus");
  assert.equal(settleSuccessfulCashout("potato", 100, 2, hitRolls).outcome, "neutral");
  assert.equal(settleSuccessfulCashout("chili", 100, 5, hitRolls).outcome, "bonus");
  assert.equal(settleSuccessfulCashout("chili", 100, 4.99, hitRolls).outcome, "neutral");
  assert.equal(settleSuccessfulCashout("mushroom", 100, 2, hitRolls).payout, 1200);
  const peaHit = { ...hitRolls, peapodPrize: .999 };
  assert.equal(settleSuccessfulCashout("peapod", 100, 2.99, peaHit, ["peapod"], { peapodThreshold: 3 }).payout, 299);
  assert.equal(settleSuccessfulCashout("peapod", 100, 3, peaHit, ["peapod"], { peapodThreshold: 3 }).payout, 2400);
  assert.equal(settleSuccessfulCashout("peapod", 100, 3, neutralRolls, ["peapod"], { peapodThreshold: 3 }).payout, 300);
  assert.deepEqual([0, .25, .5, .75, .999].map(peapodThresholdFromUnit), [2, 3, 4, 5, 5]);
  assert.deepEqual([0, .75, .92, .981, .996].map(peapodPayoutFactorFromUnit), [1.5, 3, 5, 8, 8]);
  assert.equal(settleCrashRole("pumpkin", 100, 1.2, hitRolls).payout, 0);
  assert.equal(settleCrashRole("peapod", 100, 8, hitRolls).payout, 0);
});

test("locks one pumpkin stake across three consecutive successful rounds", () => {
  assert.equal(PUMPKIN_MIN_TARGET, 2);
  const initial = createPumpkinContract(100, 2);
  assert.ok(1 - initial.crashCurve.openingSurvival <= .25);
  assert.equal(initial.baseRtp, pumpkinContractBaseRtp(2));
  assert.equal(settlePumpkinCashout(initial, 1.99).accepted, false);
  const first = settlePumpkinCashout(initial, 2);
  assert.equal(first.payout, 0);
  assert.equal(first.contract.clears, 1);
  const second = settlePumpkinCashout(first.contract, 2.2);
  assert.equal(second.payout, 0);
  assert.equal(second.contract.clears, 2);
  const third = settlePumpkinCashout(second.contract, 2.4);
  assert.equal(third.complete, true);
  assert.equal(third.payout, 1650);
  assert.equal(third.contract.active, false);
  assert.equal(settlePumpkinCrash(second.contract).active, false);

  for (const target of [1.01, 1.5, 2, 2.5, PUMPKIN_MAX_TARGET]) {
    const baseRtp = pumpkinContractBaseRtp(target);
    assert.ok(Math.abs(expectedPumpkinContractReturn(100, target, baseRtp) / 100 - CORE_RTP) < 1e-12);
  }
});

test("draws independent auto targets for both tomato-link tickets", async () => {
  const rolls = [{ target: 0 }, { target: .999 }];
  const first = duoRuntimeForTicket(["potato", "tomato"], rolls, 0);
  const second = duoRuntimeForTicket(["potato", "tomato"], rolls, 1);
  assert.equal(first.autoTarget, 1.5);
  assert.equal(second.autoTarget, 3);
  const wagers = [
    { roleId: "potato", stake: 100, target: first.autoTarget, duoThreshold: first.threshold, duoFactor: first.factor },
    { roleId: "tomato", stake: 100, target: second.autoTarget, duoThreshold: second.threshold, duoFactor: second.factor },
  ];
  const crashCurve = calibrateRoundCrashCurve(wagers);
  assert.ok(Math.abs(expectedRoundReturnForCurve(wagers, crashCurve) / 200 - CORE_RTP) < 1e-9);

  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.match(source, /function runtimeForTicket/);
  assert.match(source, /runtimeForTicket\(placedRoleIds, spec, index/);
  assert.match(source, /runtimeForTicket\(roundRoleIds, spec, index/);
  assert.match(source, /usesTomatoAuto\(ticket\) \|\| duoForcesAuto/);
  assert.match(source, /!fixedManualContract && \(ticket\.roleId === "pumpkin" \|\| ticket\.pumpkinContract\.active \|\| duoContract\)/);
});

test("keeps chili and pumpkin manual while allowing an optional configured auto cashout", async () => {
  assert.match(DUO_RULES["chili|pumpkin"].summary, /5×後 Cash Out，連過2局/);
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.match(source, /ticket\.pumpkinContract\.ruleKey === "chili\|pumpkin"/);
  assert.match(source, /ticket\.autoCash \? Math\.max\(ticket\.pumpkinContract\.target, ticket\.autoCash\) : null/);
  assert.match(source, /AUTO CASH OUT \$\{fixedManualContract/);
  assert.doesNotMatch(source, /特效展示模式已開啟|展示模式會覆寫角色機率/);
});

test("removes the obsolete pumpkin refund label", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(styles, /本金退回/);
  assert.match(styles, /content:"闖關成功"/);
});

test("calibrates and locks two independently drawn pumpkin-tomato contract targets to the 92% core", async () => {
  const first = createPumpkinContract(100, 2, { stages: 2, factor: 5, ruleKey: "pumpkin|tomato" });
  const second = createPumpkinContract(100, 5, { stages: 2, factor: 5, ruleKey: "pumpkin|tomato" });
  const crashCurve = calibratePumpkinCrashCurve([first, second]);
  const expected = expectedPumpkinContractReturnForCurve(100, 2, crashCurve, { stages: 2, factor: 5 })
    + expectedPumpkinContractReturnForCurve(100, 5, crashCurve, { stages: 2, factor: 5 });
  assert.ok(Math.abs(expected / 200 - CORE_RTP) < 1e-9);
  const locked = [first, second].map((contract) => ({ ...contract, crashCurve }));
  assert.deepEqual(locked[0].crashCurve, locked[1].crashCurve);
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.match(source, /pumpkinContract: \{ \.\.\.ticket\.pumpkinContract, crashCurve \}/);
  assert.match(source, /activeContracts\.length \? activeContracts\[0\]\.crashCurve : regularCrashCurve/);
});

test("keeps the chase meter cosmetic and emphasizes large results", async () => {
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /intentionally non-predictive show meter/);
  assert.doesNotMatch(source, /Math\.log\(multiplier\) \/ Math\.log\(crashPoint\)/);
  assert.match(source, /title="追擊距離為動畫演出，不代表爆點"/);
  for (const tier of ["cold", "warm", "hot", "mega", "epic", "legendary"]) {
    assert.match(styles, new RegExp(`\\.history-strip \\.${tier}`));
  }
  assert.match(source, /Cash Out 成功/);
  assert.match(styles, /@keyframes winResultPop/);
});

test("keeps every role settlement positive-only", () => {
  for (const roleId of roleIds) {
    for (const multiplier of [1.2, 1.5, 2, 3, 5, 10, 50]) {
      for (const rolls of [hitRolls, neutralRolls]) {
        const settlement = settleSuccessfulCashout(roleId, 100, multiplier, rolls);
        assert.ok(settlement.payout >= 100 * multiplier, `${roleId} reduced a ${multiplier}x success`);
      }
    }
  }
  for (const roleId of roleIds) assert.ok(settleCrashRole(roleId, 100, 5, hitRolls).payout >= 0);
});

test("matches the analytical feature budget for each single role", () => {
  const sampleCount = 200_000;
  for (const roleId of roleIds) {
    for (const multiplier of [1.5, 2, 5, 10]) {
      let successfulTotal = 0;
      let crashTotal = 0;
      for (let index = 0; index < sampleCount; index += 1) {
        const roll = (index + 0.5) / sampleCount;
        const rolls = roleId === "peapod"
          ? { peapod: roll, peapodPrize: ((index * 7919) % sampleCount + .5) / sampleCount }
          : roll;
        successfulTotal += settleSuccessfulCashout(roleId, 1, multiplier, rolls).payout;
        crashTotal += settleCrashRole(roleId, 1, multiplier, roll).payout;
      }
      assert.ok(Math.abs(successfulTotal / sampleCount - expectedSuccessfulPayout(roleId, 1, multiplier)) < 0.001);
      assert.ok(Math.abs(crashTotal / sampleCount - expectedCrashPayout(roleId, 1, multiplier)) < 0.001);
    }
  }
});

test("calibrates all six single-role and 21 unordered two-role VI curves to the 92% core RTP", () => {
  let combinationCount = 0;
  for (const roleId of roleIds) {
    if (roleId === "pumpkin") {
      const contract = createPumpkinContract(1, 2);
      assert.ok(Math.abs(expectedPumpkinContractReturn(1, 2, contract.baseRtp, contract) - CORE_RTP) < 1e-12);
    } else {
      const target = roleId === "potato" ? 1.99 : roleId === "chili" ? 5 : roleId === "peapod" ? 4 : 2;
      const wager = { roleId, stake: 1, target, manual: roleId !== "tomato", peapodThreshold: 4, peapodFactor: 3 };
      const baseRtp = calibrateRoundBaseRtp([wager]);
      assert.ok(Math.abs(expectedRoundReturn([wager], baseRtp) - CORE_RTP) < 1e-9, `${roleId} returned ${expectedRoundReturn([wager], baseRtp)}`);
    }
    combinationCount += 1;
  }
  for (let first = 0; first < roleIds.length; first += 1) {
    for (let second = first; second < roleIds.length; second += 1) {
      const pair = [roleIds[first], roleIds[second]];
      const runtime = duoRuntimeFromRolls(pair, { target: .5, peapodTarget: .5, peapodPrize: .5 });
      if (runtime.rule.kind === "contract") {
        const target = runtime.contractTarget ?? 2;
        const contracts = pair.map(() => createPumpkinContract(100, target, { stages: runtime.rule.stages, factor: runtime.factor }));
        const baseRtp = calibratePumpkinContracts(contracts);
        const expected = contracts.reduce((sum, contract) => sum + expectedPumpkinContractReturn(100, target, baseRtp, contract), 0);
        assert.ok(Math.abs(expected / 200 - CORE_RTP) < 1e-12);
        combinationCount += 1;
        continue;
      }
      const target = runtime.rule.kind === "auto" ? runtime.autoTarget
        : runtime.rule.kind === "reveal-auto" || runtime.rule.kind === "reveal" ? runtime.threshold
        : runtime.rule.min ?? Math.min(1.5, (runtime.rule.max ?? 2) - .01);
      const wagers = [
        { roleId: roleIds[first], stake: 1, target, duoThreshold: runtime.threshold, duoFactor: runtime.factor },
        { roleId: roleIds[second], stake: 1 + ((first + second) % 4), target, duoThreshold: runtime.threshold, duoFactor: runtime.factor },
      ];
      const baseRtp = calibrateRoundBaseRtp(wagers);
      const combinedRtp = expectedRoundReturn(wagers, baseRtp) / wagers.reduce((sum, wager) => sum + wager.stake, 0);
      assert.ok(baseRtp <= CORE_RTP);
      assert.ok(Math.abs(combinedRtp - CORE_RTP) < 1e-9, `${roleIds[first]} + ${roleIds[second]} returned ${combinedRtp}`);
      combinationCount += 1;
    }
  }
  assert.equal(combinationCount, 27);
});

test("holds 92% core RTP across an exhaustive duo target and stake matrix", () => {
  const targets = [1.2, 1.5, 1.99, 2, 3, 4, 4.99, 5, 6, 10, 25, 50, 99];
  const stakePairs = [[1, 1], [1, 3], [3, 1], [10, 37]];
  let duoCases = 0;
  for (let first = 0; first < roleIds.length; first += 1) {
    for (let second = first; second < roleIds.length; second += 1) {
      const pair = [roleIds[first], roleIds[second]];
      const runtime = duoRuntimeFromRolls(pair, { target: .5, peapodTarget: .5, peapodPrize: .5 });
      if (runtime.rule.kind === "contract") continue;
      for (const firstTarget of targets) for (const secondTarget of targets) for (const [firstStake, secondStake] of stakePairs) {
        const wagers = [
          { roleId: roleIds[first], stake: firstStake, target: firstTarget, duoThreshold: runtime.threshold, duoFactor: runtime.factor },
          { roleId: roleIds[second], stake: secondStake, target: secondTarget, duoThreshold: runtime.threshold, duoFactor: runtime.factor },
        ];
        const baseRtp = calibrateRoundBaseRtp(wagers);
        const rtp = expectedRoundReturn(wagers, baseRtp) / (firstStake + secondStake);
        assert.ok(Math.abs(rtp - CORE_RTP) < 1e-9);
        duoCases += 1;
      }
    }
  }
  assert.ok(duoCases > 9000);
});

test("keeps every tested manual cashout strategy at or below the 92% core", () => {
  const targets = [1.01, 1.2, 1.5, 1.98, 1.99, 2, 2.01, 2.5, 2.99, 3, 3.01, 4.99, 5, 5.01, 10, 50, 99];
  const stakePairs = [[1, 1], [1, 3], [3, 1]];
  const assertCapped = (rtp, label) => assert.ok(rtp <= CORE_RTP + 1e-9, `${label} returned ${rtp}`);

  for (let first = 0; first < roleIds.length; first += 1) {
    for (let second = first; second < roleIds.length; second += 1) {
      const runtime = duoRuntimeFromRolls([roleIds[first], roleIds[second]], { target: .5, peapodTarget: .5, peapodPrize: .5 });
      if (runtime.rule.kind === "contract") continue;
      for (const [firstStake, secondStake] of stakePairs) {
        const bothManual = [
          { roleId: roleIds[first], stake: firstStake, target: 2, manual: true, duoThreshold: runtime.threshold, duoFactor: runtime.factor },
          { roleId: roleIds[second], stake: secondStake, target: 2, manual: true, duoThreshold: runtime.threshold, duoFactor: runtime.factor },
        ];
        const bothManualBase = calibrateRoundBaseRtp(bothManual);
        for (const firstTarget of targets) for (const secondTarget of targets) {
          const actual = bothManual.map((wager, index) => ({ ...wager, target: index ? secondTarget : firstTarget }));
          assertCapped(expectedRoundReturn(actual, bothManualBase) / (firstStake + secondStake), `${roleIds[first]} + ${roleIds[second]} manual ${firstTarget}/${secondTarget}`);
        }

        for (const fixedIndex of [0, 1]) for (const fixedTarget of targets) {
          const planned = bothManual.map((wager, index) => ({ ...wager, target: index === fixedIndex ? fixedTarget : 2, manual: index !== fixedIndex }));
          const baseRtp = calibrateRoundBaseRtp(planned);
          for (const manualTarget of targets) {
            const actual = planned.map((wager, index) => index === fixedIndex ? wager : { ...wager, target: manualTarget });
            assertCapped(expectedRoundReturn(actual, baseRtp) / (firstStake + secondStake), `${roleIds[first]} + ${roleIds[second]} mixed ${fixedTarget}/${manualTarget}`);
          }
        }
      }
    }
  }

});

test("ignores the editable target when a wager is marked for manual cashout", () => {
  const earlyPlan = [{ roleId: "potato", stake: 100, target: 1.5, manual: true }];
  const latePlan = [{ roleId: "potato", stake: 100, target: 50, manual: true }];
  const baseRtp = calibrateRoundBaseRtp(earlyPlan);
  assert.equal(baseRtp, calibrateRoundBaseRtp(latePlan));
  assert.ok(Math.abs(expectedRoundReturn([{ ...earlyPlan[0], target: 1.5 }], baseRtp) / 100 - CORE_RTP) < 1e-9);
  assert.ok(expectedRoundReturn([{ ...earlyPlan[0], target: 2 }], baseRtp) / 100 < CORE_RTP);
});

test("defines a visible description for all 21 unordered role pairs", () => {
  const keys = new Set();
  for (let first = 0; first < roleIds.length; first += 1) {
    for (let second = first; second < roleIds.length; second += 1) {
      const description = describeDuoPair([roleIds[first], roleIds[second]]);
      assert.ok(description.title.length > 2);
      assert.ok(description.shortSummary.length > 2);
      assert.match(description.summary, /Cash Out|達標|連過|獎金/);
      assert.equal(description.roleDetails.length, 2);
      assert.equal(description.roleDetails[0], description.roleDetails[1]);
      keys.add(description.key);
    }
  }
  assert.equal(keys.size, 21);
  assert.equal(Object.keys(DUO_RULES).length, 21);
});

test("keeps role and fusion copy short and consistent", async () => {
  for (const rule of Object.values(DUO_RULES)) {
    assert.doesNotMatch(rule.summary, /鎖定BET|自動Cash Out|門檻|回合|成功Cash Out|×前成功|×後成功|自動收成/);
  }
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /派彩|倍獎|成功 →|自動成功|總倍率×3|開跑揭曉.*門檻/);
});

test("maps the committed crash unit through the selected shaped VI curve", () => {
  const sampleCount = 200_000;
  const curves = [
    calibrateRoundCrashCurve([{ roleId: "potato", stake: 1, target: 1.99, manual: true }]),
    calibrateRoundCrashCurve([{ roleId: "chili", stake: 1, target: 5, manual: true }]),
    calibrateRoundCrashCurve([
      { roleId: "potato", stake: 1, target: 4, manual: true, duoThreshold: 4, duoFactor: 1.8 },
      { roleId: "chili", stake: 1, target: 4, manual: true, duoThreshold: 4, duoFactor: 1.8 },
    ]),
  ];
  for (const curve of curves) {
    for (const multiplier of [1.01, 1.5, 2, 5, 10, 50, 99.9]) {
      let wins = 0;
      for (let index = 0; index < sampleCount; index += 1) {
        if (multiplier <= crashPointFromCurveUnit((index + 0.5) / sampleCount, curve)) wins += 1;
      }
      assert.ok(Math.abs(wins / sampleCount - survivalAtCurve(multiplier, curve)) < 0.0005);
    }
  }
});

test("caps the tuned instant-bust concentration while keeping each core curve at 92%", () => {
  const cases = [
    [{ roleId: "potato", stake: 1, target: 1.99, manual: true }],
    [{ roleId: "mushroom", stake: 1, target: 2, manual: true }],
    [
      { roleId: "potato", stake: 1, target: 1.99, manual: true, duoThreshold: 2, duoFactor: 1.7 },
      { roleId: "potato", stake: 1, target: 1.99, manual: true, duoThreshold: 2, duoFactor: 1.7 },
    ],
    [
      { roleId: "potato", stake: 1, target: 1.99, manual: true, duoThreshold: 2, duoFactor: 5 },
      { roleId: "mushroom", stake: 1, target: 1.99, manual: true, duoThreshold: 2, duoFactor: 5 },
    ],
  ];
  for (const wagers of cases) {
    const curve = calibrateRoundCrashCurve(wagers);
    assert.ok(1 - curve.openingSurvival <= .25 + 1e-9);
    assert.ok(expectedRoundReturnForCurve(wagers, curve) <= CORE_RTP * wagers.reduce((sum, wager) => sum + wager.stake, 0) + 1e-9);
  }
});

test("uses the same two-decimal boundary for 1.01x display and auto cashout", async () => {
  const exactUnit = 1 - CORE_RTP / 1.01;
  const belowUnit = 1 - CORE_RTP / 1.009;
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.equal(crashPointFromUnit(exactUnit), 1.01);
  assert.equal(crashPointFromUnit(belowUnit), 1);
  assert.match(source, /target <= crashPoint && nextMultiplier >= target/);
  assert.match(source, /Math\.floor\(multiplier \* 100 \+ 1e-9\) \/ 100/);
  assert.match(source, /Math\.round\(\(2 \+ targetRoll \* 3\) \* 100\) \/ 100/);
  assert.match(source, /cashOut\(ticketIndex, Math\.floor\(multiplier \* 100 \+ 1e-9\) \/ 100\)/);
});

test("strong abilities and links lower the base curve while preserving the 92% core target", () => {
  const plain = [{ roleId: "peapod", stake: 1, target: 3, peapodThreshold: 3, peapodFactor: 5 }];
  const runtime = duoRuntimeFromRolls(["mushroom", "tomato"], { target: .5, peapodTarget: .5, peapodPrize: .5 });
  const shared = [
    { roleId: "mushroom", stake: 1, target: runtime.autoTarget, duoThreshold: runtime.threshold, duoFactor: runtime.factor },
    { roleId: "tomato", stake: 1, target: runtime.autoTarget, duoThreshold: runtime.threshold, duoFactor: runtime.factor },
  ];
  const plainBaseRtp = calibrateRoundBaseRtp(plain);
  const sharedBaseRtp = calibrateRoundBaseRtp(shared);
  assert.ok(plainBaseRtp < CORE_RTP);
  assert.ok(sharedBaseRtp < CORE_RTP);
  assert.ok(Math.abs(expectedRoundReturn(shared, sharedBaseRtp) / 2 - CORE_RTP) < 1e-9);
});

test("allocates half of the 92% core net loss and reconciles to the 96% long-term target", () => {
  const funded = settleRecoveryPool(createRecoveryPool(0), { coreStake: 10_000, corePayout: 9_200 });
  assert.equal(funded.reserve, 400);
  assert.equal((9_200 + funded.reserve) / 10_000, TARGET_RTP);
  const plan = planRecoveryRelease(funded, 50, 0);
  assert.equal(plan.active, true);
  assert.equal(plan.mode, "crash");
  assert.equal(plan.crashFloor, 9);
  const released = settleRecoveryPool(funded, { releaseActive: true, releasedAmount: 400, thresholdUnit: 1, cooldownUnit: .9 });
  assert.equal(released.reserve, 0);
  assert.equal(released.cooldown, 3);
  assert.equal(released.thresholdFactor, 7);
});

test("never approves or records a pool-funded payout above the available reserve", () => {
  const funded = { ...createRecoveryPool(), reserve: 100 };
  const rejected = reserveRecoveryPayout(funded, 100.01);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.pool.reserve, 100);
  const reserved = reserveRecoveryPayout(funded, 100);
  assert.equal(reserved.accepted, true);
  assert.equal(reserved.pool.reserve, 0);
  assert.equal(settleRecoveryReservation(reserved.pool, reserved.amount, false).reserve, 100);
  const paid = settleRecoveryReservation(reserved.pool, reserved.amount, true);
  assert.equal(paid.reserve, 0);
  assert.equal(paid.totalReleasedPayout, 100);
  assert.equal(normalizeRecoveryPool({ reserve: -1 }).reserve, -1);
});

test("charges the pool for the full incremental payout instead of creating a free returned stake", () => {
  const funded = { ...createRecoveryPool(), reserve: 100 };
  const settled = settleRecoveryPool(funded, { coreStake: 10, corePayout: 0, actualPayout: 40, releaseActive: true });
  assert.equal(settled.reserve, 65);
  assert.equal(settled.totalReleasedPayout, 40);
});

test("carries a negative pool balance forward before funding another recovery release", () => {
  const loss = settleRecoveryPool(createRecoveryPool(), { coreStake: 1, corePayout: 0 });
  const win = settleRecoveryPool(loss, { coreStake: 1, corePayout: 5 });
  assert.equal(loss.reserve, .5);
  assert.equal(win.reserve, -1.5);
  assert.equal(planRecoveryRelease(win, 1).active, false);
  assert.equal(settleRecoveryPool(win, { coreStake: 3, corePayout: 0 }).reserve, 0);
});
