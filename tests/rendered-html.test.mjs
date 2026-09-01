import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  calibrateRoundBaseRtp,
  crashPointFromUnit,
  expectedCrashPayout,
  expectedRoundReturn,
  expectedSuccessfulPayout,
  settleCrashRole,
  settleSuccessfulCashout,
  survivalAt,
  TARGET_RTP,
} from "../app/rtp-engine.mjs";

const roleIds = ["potato", "chili", "pumpkin", "tomato", "peapod", "mushroom"];
const neutralRolls = { potato: 0.99, chili: 0.99, pumpkin: 0.99, tomato: 0.99, mushroom: 0.99 };
const hitRolls = { potato: 0, chili: 0, pumpkin: 0, tomato: 0, mushroom: 0 };

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
  assert.match(source, /雙注聯動/);
});

test("locks the viewport and keeps touch controls zoom-free", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(layout, /maximumScale: 1/);
  assert.match(layout, /userScalable: false/);
  assert.match(styles, /touch-action:manipulation/);
  assert.match(styles, /auto-cash-setting input \{[^}]*font-size:16px/);
  assert.match(styles, /character-grid \{[^}]*repeat\(3/);
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
  assert.match(source, /abilityKeys = \["potato", "chili", "pumpkin", "tomato", "mushroom", "target"\]/);
  assert.match(source, /digestHex\(`\$\{seed\}:ticket:\$\{index\}:\$\{key\}`\)/);
  assert.match(source, /calibrateRoundBaseRtp\(ticketsToRtpWagers\(ticketsRef\.current\)\)/);
});

test("shares bonus roles across two tickets but keeps operation roles self-only", () => {
  const potatoSupport = settleSuccessfulCashout("chili", 100, 1.5, hitRolls, ["potato", "chili"]);
  assert.equal(potatoSupport.payout, 300);
  assert.deepEqual(potatoSupport.triggeredRoleIds, ["potato"]);

  const chiliSupport = settleSuccessfulCashout("potato", 100, 5, hitRolls, ["potato", "chili"]);
  assert.equal(chiliSupport.payout, 1000);
  assert.deepEqual(chiliSupport.triggeredRoleIds, ["chili"]);

  const mushroomSupport = settleSuccessfulCashout("peapod", 100, 2, hitRolls, ["peapod", "mushroom"]);
  assert.equal(mushroomSupport.payout, 1600);
  assert.deepEqual(mushroomSupport.triggeredRoleIds, ["mushroom"]);

  const pumpkinSupport = settleCrashRole("chili", 100, hitRolls, ["chili", "pumpkin"]);
  assert.equal(pumpkinSupport.payout, 100);

  const tomatoSelf = settleSuccessfulCashout("tomato", 100, 3, hitRolls, ["tomato", "peapod"]);
  assert.equal(tomatoSelf.payout, 900);
  const tomatoDoesNotShare = settleSuccessfulCashout("peapod", 100, 3, hitRolls, ["tomato", "peapod"]);
  assert.equal(tomatoDoesNotShare.payout, 300);
});

test("keeps thresholds and showcase forcing honest", () => {
  assert.equal(settleSuccessfulCashout("potato", 100, 1.5, hitRolls).outcome, "bonus");
  assert.equal(settleSuccessfulCashout("potato", 100, 2, hitRolls).outcome, "neutral");
  assert.equal(settleSuccessfulCashout("chili", 100, 5, hitRolls).outcome, "bonus");
  assert.equal(settleSuccessfulCashout("chili", 100, 4.99, hitRolls).outcome, "neutral");
  assert.equal(settleSuccessfulCashout("mushroom", 100, 2, hitRolls).payout, 1600);
  assert.equal(settleCrashRole("pumpkin", 100, hitRolls).payout, 100);
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
  assert.equal(settleCrashRole("pumpkin", 100, neutralRolls).payout, 0);
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

test("maps the committed crash unit through the selected VI curve", () => {
  const sampleCount = 300_000;
  for (const baseRtp of [0.96, 0.85, 0.72, 0.58]) {
    for (const multiplier of [1.01, 1.5, 2, 5, 10, 50, 99.9]) {
      let wins = 0;
      for (let index = 0; index < sampleCount; index += 1) {
        if (multiplier < crashPointFromUnit((index + 0.5) / sampleCount, baseRtp)) wins += 1;
      }
      assert.ok(Math.abs(multiplier * wins / sampleCount - baseRtp) < 0.0005);
      assert.ok(Math.abs(survivalAt(multiplier, baseRtp) * multiplier - baseRtp) < 1e-12);
    }
  }
});

test("strong shared abilities lower the base curve while preserving the 96% target", () => {
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
