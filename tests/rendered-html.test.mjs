import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { bettingWindowOpen, cancelPendingBet, canEditUnplacedTicket } from "../app/ticket-actions.mjs";
import {
  calibrateRoundBaseRtp,
  crashPointFromUnit,
  createVisualNearMiss,
  describeDuoPair,
  expectedCrashPayout,
  expectedRoundReturn,
  expectedSuccessfulPayout,
  settleDuoLink,
  settleCrashRole,
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
  assert.match(source, /雙注能力怎麼生效/);
  assert.match(source, /25%機率把本注獲利加給另一注/);
  assert.match(source, /25%機率取得另一注50%獲利/);
  assert.match(source, /連攜啟動！/);
  assert.match(source, /className="duo-activation"/);
  assert.match(source, /className="duo-bridge"/);
  assert.match(source, /duoDescription\.shortSummary/);
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
  assert.match(source, /abilityKeys = \["potato", "chili", "pumpkin", "tomato", "peapod", "mushroom", "target"\]/);
  assert.match(source, /digestHex\(`\$\{seed\}:ticket:\$\{index\}:\$\{key\}`\)/);
  assert.match(source, /calibrateRoundBaseRtp\(ticketsToRtpWagers\(currentTickets\)\)/);
});

test("keeps near miss visual-only and bounded after every wager is settled", async () => {
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
  assert.match(source, /Near Miss 只延長已結算後的演出/);
});

test("keeps every duo on one shared crash without parlay settlement", async () => {
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.match(source, /settleDuoLink/);
  assert.match(source, /fox-pursuer fox-shared/);
  assert.match(source, /type RoundSpec = \{[\s\S]*?crashPoint: number;[\s\S]*?abilityRolls/);
  assert.doesNotMatch(source, /crashPoint2|crashPoints/);
  assert.doesNotMatch(source, /combinedFactor|parlayMode/);
});

test("keeps base abilities separate and settles profit transfers only after both cashouts", () => {
  assert.equal(settleSuccessfulCashout("chili", 100, 1.5, hitRolls, ["potato", "chili"]).payout, 150);
  assert.equal(settleSuccessfulCashout("potato", 100, 5, hitRolls, ["potato", "chili"]).payout, 500);
  assert.equal(settleSuccessfulCashout("peapod", 100, 2, hitRolls, ["peapod", "mushroom"]).payout, 200);
  assert.equal(settleSuccessfulCashout("pumpkin", 100, 4, hitRolls, ["pumpkin", "mushroom"]).payout, 400);
  const tomatoSelf = settleSuccessfulCashout("tomato", 100, 3, hitRolls, ["tomato", "peapod"]);
  assert.equal(tomatoSelf.payout, 900);

  const peaChili = settleDuoLink([
    { roleId: "peapod", stake: 100, cashAt: 2.5, payout: 250, status: "cashed", abilityRoll: 0 },
    { roleId: "chili", stake: 100, cashAt: 6, payout: 600, status: "cashed", abilityRoll: 0.99 },
  ]);
  assert.deepEqual(peaChili.extras, [0, 150]);
  assert.equal(peaChili.total, 150);
  assert.deepEqual(peaChili.sourceIndexes, [0]);
  assert.match(peaChili.note, /豌豆補給/);

  const pumpkinChili = settleDuoLink([
    { roleId: "pumpkin", stake: 100, cashAt: 2, payout: 200, status: "cashed", abilityRoll: 0 },
    { roleId: "chili", stake: 100, cashAt: 6, payout: 600, status: "cashed", abilityRoll: 0.99 },
  ]);
  assert.deepEqual(pumpkinChili.extras, [250, 0]);
  assert.equal(pumpkinChili.total, 250);
  assert.match(pumpkinChili.note, /南瓜藤蔓/);

  const peaResonance = settleDuoLink([
    { roleId: "peapod", stake: 100, cashAt: 2.5, payout: 250, status: "cashed", abilityRoll: 0 },
    { roleId: "peapod", stake: 100, cashAt: 3, payout: 300, status: "cashed", abilityRoll: 0 },
  ]);
  assert.deepEqual(peaResonance.extras, [200, 150]);
  assert.equal(peaResonance.total, 350);
  assert.equal(settleDuoLink([
    { roleId: "peapod", stake: 100, cashAt: 2.5, payout: 250, status: "cashed", abilityRoll: 0.99 },
    { roleId: "chili", stake: 100, cashAt: 6, payout: 600, status: "cashed", abilityRoll: 0.99 },
  ]).total, 0);
  assert.equal(settleDuoLink([
    { roleId: "peapod", stake: 100, cashAt: 2.5, payout: 250, status: "cashed", abilityRoll: 0, linkAwarded: true },
    { roleId: "chili", stake: 100, cashAt: 6, payout: 600, status: "cashed", abilityRoll: 0.99 },
  ]).total, 0, "a link award must be idempotent");
});

test("keeps thresholds and showcase forcing honest", () => {
  assert.equal(settleSuccessfulCashout("potato", 100, 1.5, hitRolls).outcome, "bonus");
  assert.equal(settleSuccessfulCashout("potato", 100, 2, hitRolls).outcome, "neutral");
  assert.equal(settleSuccessfulCashout("chili", 100, 5, hitRolls).outcome, "bonus");
  assert.equal(settleSuccessfulCashout("chili", 100, 4.99, hitRolls).outcome, "neutral");
  assert.equal(settleSuccessfulCashout("mushroom", 100, 2, hitRolls).payout, 1600);
  assert.equal(settleSuccessfulCashout("pumpkin", 100, 2, hitRolls).payout, 200);
  assert.equal(settleSuccessfulCashout("pumpkin", 100, 4, hitRolls).payout, 400);
  assert.equal(settleSuccessfulCashout("pumpkin", 100, 6, hitRolls, ["pumpkin", "pumpkin"]).payout, 600);
  assert.equal(settleCrashRole().payout, 0);
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
  assert.equal(settleCrashRole().payout, 0);
});

test("matches the analytical feature budget for each single role", () => {
  const sampleCount = 200_000;
  for (const roleId of roleIds) {
    for (const multiplier of [1.5, 2, 5, 10]) {
      let successfulTotal = 0;
      let crashTotal = 0;
      for (let index = 0; index < sampleCount; index += 1) {
        const roll = (index + 0.5) / sampleCount;
        successfulTotal += settleSuccessfulCashout(roleId, 1, multiplier, roll).payout;
        crashTotal += settleCrashRole(roleId, 1, roll).payout;
      }
      assert.ok(Math.abs(successfulTotal / sampleCount - expectedSuccessfulPayout(roleId, 1, multiplier)) < 0.001);
      assert.ok(Math.abs(crashTotal / sampleCount - expectedCrashPayout(roleId, 1)) < 0.001);
    }
  }
});

test("calibrates all six single-role and 21 unordered two-role VI curves to 96% RTP", () => {
  const multipliers = [1.2, 1.5, 2, 3, 5, 10, 25, 50];
  let combinationCount = 0;
  for (let first = 0; first < roleIds.length; first += 1) {
    for (let second = first; second < roleIds.length; second += 1) {
      const wagers = [
        { roleId: roleIds[first], stake: 1, target: multipliers[first % multipliers.length] },
        { roleId: roleIds[second], stake: 1 + ((first + second) % 4), target: multipliers[(second + 3) % multipliers.length] },
      ];
      const baseRtp = calibrateRoundBaseRtp(wagers);
      const combinedRtp = expectedRoundReturn(wagers, baseRtp) / wagers.reduce((sum, wager) => sum + wager.stake, 0);
      assert.ok(baseRtp <= TARGET_RTP);
      assert.ok(Math.abs(combinedRtp - TARGET_RTP) < 1e-9, `${roleIds[first]} + ${roleIds[second]} returned ${combinedRtp}`);
      combinationCount += 1;
    }
  }
  assert.equal(combinationCount, 21);
});

test("holds 96% across an exhaustive duo target and stake matrix", () => {
  const targets = [1.2, 1.5, 1.99, 2, 3, 4, 4.99, 5, 6, 10, 25, 50, 99];
  const stakePairs = [[1, 1], [1, 3], [3, 1], [10, 37]];
  let duoCases = 0;
  for (let first = 0; first < roleIds.length; first += 1) {
    for (let second = first; second < roleIds.length; second += 1) {
      for (const firstTarget of targets) for (const secondTarget of targets) for (const [firstStake, secondStake] of stakePairs) {
        const wagers = [
          { roleId: roleIds[first], stake: firstStake, target: firstTarget },
          { roleId: roleIds[second], stake: secondStake, target: secondTarget },
        ];
        const baseRtp = calibrateRoundBaseRtp(wagers);
        const rtp = expectedRoundReturn(wagers, baseRtp) / (firstStake + secondStake);
        assert.ok(Math.abs(rtp - TARGET_RTP) < 1e-9);
        duoCases += 1;
      }
    }
  }
  assert.equal(duoCases, 14196);
});

test("keeps every tested manual cashout strategy at or below 96%", () => {
  const targets = [1.01, 1.2, 1.5, 1.98, 1.99, 2, 2.01, 2.5, 2.99, 3, 3.01, 4.99, 5, 5.01, 10, 50, 99];
  const stakePairs = [[1, 1], [1, 3], [3, 1]];
  const assertCapped = (rtp, label) => assert.ok(rtp <= TARGET_RTP + 1e-9, `${label} returned ${rtp}`);

  for (let first = 0; first < roleIds.length; first += 1) {
    for (let second = first; second < roleIds.length; second += 1) {
      for (const [firstStake, secondStake] of stakePairs) {
        const bothManual = [
          { roleId: roleIds[first], stake: firstStake, target: 2, manual: true },
          { roleId: roleIds[second], stake: secondStake, target: 2, manual: true },
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
      assert.ok([...description.shortSummary].length <= 28, `${description.key} compact copy is too long`);
      assert.match(description.summary, /→|機率|獲利/);
      assert.equal(description.roleDetails.length, 2);
      keys.add(description.key);
    }
  }
  assert.equal(keys.size, 21);
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
  assert.match(source, /const settlementTickets = next\.map\(\(ticket, ticketIndex\) =>/);
  assert.match(source, /Math\.round\(\(2 \+ targetRoll \* 3\) \* 100\) \/ 100/);
  assert.match(source, /cashOut\(ticketIndex, Math\.floor\(multiplier \* 100 \+ 1e-9\) \/ 100\)/);
});

test("strong abilities and links lower the base curve while preserving the 96% target", () => {
  const plain = [{ roleId: "peapod", stake: 1, target: 3 }];
  const shared = [
    { roleId: "mushroom", stake: 1, target: 3 },
    { roleId: "tomato", stake: 1, target: 3 },
  ];
  const plainBaseRtp = calibrateRoundBaseRtp(plain);
  const sharedBaseRtp = calibrateRoundBaseRtp(shared);
  assert.equal(plainBaseRtp, TARGET_RTP);
  assert.ok(sharedBaseRtp < plainBaseRtp);
  assert.ok(Math.abs(expectedRoundReturn(shared, sharedBaseRtp) / 2 - TARGET_RTP) < 1e-9);
});
