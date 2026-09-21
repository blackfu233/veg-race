import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { bettingWindowOpen, cancelPendingBet, canEditUnplacedTicket } from "../app/ticket-actions.mjs";
import {
  calibratePumpkinContracts,
  calibrateRoundBaseRtp,
  crashPointFromUnit,
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
  peapodPayoutFactorFromUnit,
  peapodThresholdFromUnit,
  pumpkinContractBaseRtp,
  settleCrashRole,
  settlePumpkinCashout,
  settlePumpkinCrash,
  settleSuccessfulCashout,
  survivalAt,
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
  assert.match(html, /AUTO CASHOUT/);
  assert.match(html, /type="number"/);
  assert.doesNotMatch(html, /class="road-runner\b/, "the road must stay empty before a bet is placed");
  assert.doesNotMatch(html, /class="vertical-meters\b/, "the chase meter must stay hidden during betting");
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.match(source, /雙角融合/);
  assert.match(source, /連續3局達標 → 總倍率×3派彩/);
  assert.match(source, /開跑揭曉門檻與倍獎 → 達標後25%機率觸發/);
  assert.match(source, /連攜啟動！/);
  assert.match(source, /className="duo-activation"/);
  assert.match(source, /className="duo-bridge"/);
  assert.match(source, /duoDescription\.shortSummary/);
  assert.match(source, /const duoPreviewActive = phase === "betting" && !duoActive/);
  assert.match(source, /duoActive \|\| duoPreviewActive/);
  assert.doesNotMatch(source, /雙注預覽｜/);
  assert.doesNotMatch(source, /stage-duo-preview|目前雙注效果/);
  assert.doesNotMatch(html, /目前雙注效果/);
  assert.equal((html.match(/5×後成功：50%機率派彩×2/g) ?? []).length, 2);
  assert.doesNotMatch(source, /combo-copy|combo-badge/);
  assert.doesNotMatch(source, /同場串關|BET BOTH|兩關相乘/);
  assert.doesNotMatch(source, /雙注共享|本注限定/);
  assert.doesNotMatch(source, /主角＋支援|支援醬料|番茄醬|美乃滋|芥末醬|山葵醬|switchGameMode/);
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
  assert.match(source, /calibrateRoundBaseRtp\(ticketsToRtpWagers\(currentTickets, currentSpec\)\)/);
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
  assert.match(source, /Cash Out 後的追跑只屬演出，不改變爆點、派彩或 RTP/);
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
  assert.equal(settleSuccessfulCashout("chili", 100, 4.99, hitRolls, ["potato", "chili"], { duoRuntime: potatoChili }).payout, 499);
  assert.equal(settleSuccessfulCashout("potato", 100, 5, hitRolls, ["potato", "chili"], { duoRuntime: potatoChili }).payout, 1000);

  const chiliMushroom = duoRuntimeFromRolls(["chili", "mushroom"], hitRolls);
  assert.equal(settleSuccessfulCashout("chili", 100, 5, hitRolls, ["chili", "mushroom"], { duoRuntime: chiliMushroom }).payout, 4000);
  assert.equal(settleSuccessfulCashout("mushroom", 100, 5, neutralRolls, ["chili", "mushroom"], { duoRuntime: chiliMushroom }).payout, 500);

  const peaMushroom = duoRuntimeFromRolls(["peapod", "mushroom"], { ...hitRolls, peapodTarget: .99, peapodPrize: .99 });
  assert.equal(peaMushroom.threshold, 5);
  assert.equal(peaMushroom.factor, 20);
  assert.equal(settleSuccessfulCashout("peapod", 100, 4.99, hitRolls, ["peapod", "mushroom"], { duoRuntime: peaMushroom }).payout, 499);
  assert.equal(settleSuccessfulCashout("peapod", 100, 5, hitRolls, ["peapod", "mushroom"], { duoRuntime: peaMushroom }).payout, 10000);
});

test("keeps thresholds and showcase forcing honest", () => {
  assert.equal(settleSuccessfulCashout("potato", 100, 1.5, hitRolls).outcome, "bonus");
  assert.equal(settleSuccessfulCashout("potato", 100, 2, hitRolls).outcome, "neutral");
  assert.equal(settleSuccessfulCashout("chili", 100, 5, hitRolls).outcome, "bonus");
  assert.equal(settleSuccessfulCashout("chili", 100, 4.99, hitRolls).outcome, "neutral");
  assert.equal(settleSuccessfulCashout("mushroom", 100, 2, hitRolls).payout, 1600);
  const peaHit = { ...hitRolls, peapodPrize: .999 };
  assert.equal(settleSuccessfulCashout("peapod", 100, 2.99, peaHit, ["peapod"], { peapodThreshold: 3 }).payout, 299);
  assert.equal(settleSuccessfulCashout("peapod", 100, 3, peaHit, ["peapod"], { peapodThreshold: 3 }).payout, 6000);
  assert.equal(settleSuccessfulCashout("peapod", 100, 3, neutralRolls, ["peapod"], { peapodThreshold: 3 }).payout, 300);
  assert.deepEqual([0, .25, .5, .75, .999].map(peapodThresholdFromUnit), [2, 3, 4, 5, 5]);
  assert.deepEqual([0, .75, .92, .981, .996].map(peapodPayoutFactorFromUnit), [2, 3, 5, 10, 20]);
  assert.equal(settleCrashRole("pumpkin", 100, 1.2, hitRolls).payout, 0);
  assert.equal(settleCrashRole("peapod", 100, 8, hitRolls).payout, 0);
});

test("locks one pumpkin stake across three consecutive successful rounds", () => {
  const initial = createPumpkinContract(100, 2);
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
  assert.equal(third.payout, 1980);
  assert.equal(third.contract.active, false);
  assert.equal(settlePumpkinCrash(second.contract).active, false);

  for (const target of [1.01, 1.5, 2, 2.5, 2.88]) {
    const baseRtp = pumpkinContractBaseRtp(target);
    assert.ok(Math.abs(expectedPumpkinContractReturn(100, target, baseRtp) / 100 - TARGET_RTP) < 1e-12);
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
  const baseRtp = calibrateRoundBaseRtp(wagers);
  assert.ok(Math.abs(expectedRoundReturn(wagers, baseRtp) / 200 - TARGET_RTP) < 1e-9);

  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.match(source, /function runtimeForTicket/);
  assert.match(source, /runtimeForTicket\(placedRoleIds, spec, index/);
  assert.match(source, /runtimeForTicket\(roundRoleIds, spec, index/);
  assert.match(source, /usesTomatoAuto\(ticket\) \|\| duoForcesAuto/);
  assert.match(source, /ticket\.roleId === "pumpkin" \|\| ticket\.pumpkinContract\.active \|\| duoContract/);
});

test("calibrates and locks two independently drawn pumpkin-tomato contract targets to 96%", async () => {
  const first = createPumpkinContract(100, 2, { stages: 2, factor: 5, ruleKey: "pumpkin|tomato" });
  const second = createPumpkinContract(100, 5, { stages: 2, factor: 5, ruleKey: "pumpkin|tomato" });
  const baseRtp = calibratePumpkinContracts([first, second]);
  const expected = expectedPumpkinContractReturn(100, 2, baseRtp, { stages: 2, factor: 5 })
    + expectedPumpkinContractReturn(100, 5, baseRtp, { stages: 2, factor: 5 });
  assert.ok(baseRtp < TARGET_RTP);
  assert.ok(Math.abs(expected / 200 - TARGET_RTP) < 1e-9);
  const locked = [first, second].map((contract) => ({ ...contract, baseRtp }));
  assert.equal(locked[0].baseRtp, locked[1].baseRtp);
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.match(source, /pumpkinContract: \{ \.\.\.ticket\.pumpkinContract, baseRtp \}/);
  assert.match(source, /activeContracts\.length \? activeContracts\[0\]\.baseRtp : regularBaseRtp/);
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
  assert.match(source, /CASH OUT SUCCESS/);
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

test("calibrates all six single-role and 21 unordered two-role VI curves to 96% RTP", () => {
  let combinationCount = 0;
  for (const roleId of roleIds) {
    if (roleId === "pumpkin") {
      const contract = createPumpkinContract(1, 2);
      assert.ok(Math.abs(expectedPumpkinContractReturn(1, 2, contract.baseRtp, contract) - TARGET_RTP) < 1e-12);
    } else {
      const target = roleId === "potato" ? 1.99 : roleId === "chili" ? 5 : roleId === "peapod" ? 4 : 2;
      const wager = { roleId, stake: 1, target, manual: roleId !== "tomato", peapodThreshold: 4, peapodFactor: 3 };
      const baseRtp = calibrateRoundBaseRtp([wager]);
      assert.ok(Math.abs(expectedRoundReturn([wager], baseRtp) - TARGET_RTP) < 1e-9, `${roleId} returned ${expectedRoundReturn([wager], baseRtp)}`);
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
        assert.ok(Math.abs(expected / 200 - TARGET_RTP) < 1e-12);
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
      assert.ok(baseRtp <= TARGET_RTP);
      assert.ok(Math.abs(combinedRtp - TARGET_RTP) < 1e-9, `${roleIds[first]} + ${roleIds[second]} returned ${combinedRtp}`);
      combinationCount += 1;
    }
  }
  assert.equal(combinationCount, 27);
});

test("holds 96% across an exhaustive duo target and stake matrix", () => {
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
        assert.ok(Math.abs(rtp - TARGET_RTP) < 1e-9);
        duoCases += 1;
      }
    }
  }
  assert.ok(duoCases > 9000);
});

test("keeps every tested manual cashout strategy at or below 96%", () => {
  const targets = [1.01, 1.2, 1.5, 1.98, 1.99, 2, 2.01, 2.5, 2.99, 3, 3.01, 4.99, 5, 5.01, 10, 50, 99];
  const stakePairs = [[1, 1], [1, 3], [3, 1]];
  const assertCapped = (rtp, label) => assert.ok(rtp <= TARGET_RTP + 1e-9, `${label} returned ${rtp}`);

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
  assert.ok(Math.abs(expectedRoundReturn([{ ...earlyPlan[0], target: 1.5 }], baseRtp) / 100 - TARGET_RTP) < 1e-9);
  assert.ok(expectedRoundReturn([{ ...earlyPlan[0], target: 2 }], baseRtp) / 100 < TARGET_RTP);
});

test("defines a visible description for all 21 unordered role pairs", () => {
  const keys = new Set();
  for (let first = 0; first < roleIds.length; first += 1) {
    for (let second = first; second < roleIds.length; second += 1) {
      const description = describeDuoPair([roleIds[first], roleIds[second]]);
      assert.ok(description.title.length > 2);
      assert.ok(description.shortSummary.length > 2);
      assert.match(description.summary, /成功|Cash Out|達標|達到|收成/);
      assert.equal(description.roleDetails.length, 2);
      assert.equal(description.roleDetails[0], description.roleDetails[1]);
      keys.add(description.key);
    }
  }
  assert.equal(keys.size, 21);
  assert.equal(Object.keys(DUO_RULES).length, 21);
});

test("maps the committed crash unit through the selected VI curve", () => {
  const sampleCount = 300_000;
  for (const baseRtp of [0.96, 0.85, 0.72, 0.58]) {
    for (const multiplier of [1.01, 1.5, 2, 5, 10, 50, 99.9]) {
      let wins = 0;
      for (let index = 0; index < sampleCount; index += 1) {
        if (multiplier <= crashPointFromUnit((index + 0.5) / sampleCount, baseRtp)) wins += 1;
      }
      assert.ok(Math.abs(multiplier * wins / sampleCount - baseRtp) < 0.0005);
      assert.ok(Math.abs(survivalAt(multiplier, baseRtp) * multiplier - baseRtp) < 1e-12);
    }
  }
});

test("uses the same two-decimal boundary for 1.01x display and auto cashout", async () => {
  const exactUnit = 1 - TARGET_RTP / 1.01;
  const belowUnit = 1 - TARGET_RTP / 1.009;
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.equal(crashPointFromUnit(exactUnit), 1.01);
  assert.equal(crashPointFromUnit(belowUnit), 1);
  assert.match(source, /target <= crashPoint && nextMultiplier >= target/);
  assert.match(source, /Math\.floor\(multiplier \* 100 \+ 1e-9\) \/ 100/);
  assert.match(source, /Math\.round\(\(2 \+ targetRoll \* 3\) \* 100\) \/ 100/);
  assert.match(source, /cashOut\(ticketIndex, Math\.floor\(multiplier \* 100 \+ 1e-9\) \/ 100\)/);
});

test("strong abilities and links lower the base curve while preserving the 96% target", () => {
  const plain = [{ roleId: "peapod", stake: 1, target: 3, peapodThreshold: 3, peapodFactor: 5 }];
  const runtime = duoRuntimeFromRolls(["mushroom", "tomato"], { target: .5, peapodTarget: .5, peapodPrize: .5 });
  const shared = [
    { roleId: "mushroom", stake: 1, target: runtime.autoTarget, duoThreshold: runtime.threshold, duoFactor: runtime.factor },
    { roleId: "tomato", stake: 1, target: runtime.autoTarget, duoThreshold: runtime.threshold, duoFactor: runtime.factor },
  ];
  const plainBaseRtp = calibrateRoundBaseRtp(plain);
  const sharedBaseRtp = calibrateRoundBaseRtp(shared);
  assert.ok(plainBaseRtp < TARGET_RTP);
  assert.ok(sharedBaseRtp < TARGET_RTP);
  assert.ok(Math.abs(expectedRoundReturn(shared, sharedBaseRtp) / 2 - TARGET_RTP) < 1e-9);
});
