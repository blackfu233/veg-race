import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  calibrateRoundBaseRtp,
  crashPointFromUnit,
  expectedCrashPayout,
  expectedRoundReturn,
  expectedSuccessfulPayout,
  pairProfitFactor,
  settleCrashRole,
  settleSuccessfulCashout,
  survivalAt,
  TARGET_RTP,
} from "../app/rtp-engine.mjs";

const roleIds = ["potato", "chili", "pumpkin", "tomato", "okra", "peapod", "corn", "scallion", "mushroom", "peanut"];

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("renders the Veggie Dash game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Veggie Dash/);
  assert.match(html, /蔬菜跑跑/);
  assert.match(html, /Betting/);
  assert.match(html, /AUTO CASHOUT/);
  assert.match(html, /type="number"/);
  assert.doesNotMatch(html, /class="road-runner\b/, "the road must stay empty before a bet is placed");
  assert.doesNotMatch(html, /class="vertical-meters\b/, "the chase meter must stay hidden during betting");
  for (const roleName of ["馬鈴薯", "辣椒", "南瓜", "番茄", "秋葵", "豌豆莢", "雙色玉米", "雙葉青蔥", "蘑菇", "花生"]) {
    assert.match(html, new RegExp(roleName));
  }
  assert.doesNotMatch(html, /Your site is taking shape/);
});

test("locks the mobile viewport and keeps touch controls zoom-free", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(layout, /maximumScale: 1/);
  assert.match(layout, /userScalable: false/);
  assert.match(styles, /touch-action:manipulation/);
  assert.match(styles, /auto-cash-setting input \{[^}]*font-size:16px/);
});

test("ships the complete runner and pursuer art set", async () => {
  const assets = [
    "../public/farm-road.webp",
    "../public/pursuer-fox-run.webp",
    "../public/effects/corn-gold-kernels.png",
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

test("keeps crash and character rolls deterministic for each committed round", async () => {
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Math\.random/);
  assert.match(source, /abilityRolls/);
  assert.match(source, /digestHex\(seed \+ ":crash"\)/);
  assert.match(source, /digestHex\(seed \+ ":combo"\)/);
  assert.match(source, /calibrateRoundBaseRtp\(ticketsToRtpWagers\(ticketsRef\.current\)\)/);
  assert.match(source, /crashPoint: crashPointFromUnit\(crashUnit\)/);
  assert.match(source, /crashPoint: crashPointFromUnit\(currentSpec\.crashUnit, baseRtp\)/);
  assert.match(source, /digestHex\(seed \+ ":ticket:0:bonus"\)/);
  assert.match(source, /digestHex\(seed \+ ":ticket:1:target"\)/);
});

test("offers a menu showcase switch that only forces eligible role abilities", async () => {
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /特效展示模式/);
  assert.match(source, /條件達成時，角色能力必定觸發/);
  assert.match(source, /showcaseModeRef\.current \? 0 : roundSpecRef\.current\?\.abilityRolls/);
  assert.match(source, /showcaseModeRef\.current \? 0 : roundSpecRef\.current\?\.comboRoll/);
  assert.match(source, /僅供查看特效，不代表正常 RTP/);
  assert.match(styles, /\.showcase-badge/);
  assert.match(styles, /\.showcase-control\.on/);
  assert.equal(settleSuccessfulCashout("potato", 100, 1.5, 0).outcome, "bonus");
  assert.equal(settleSuccessfulCashout("potato", 100, 2, 0).outcome, "neutral", "showcase mode must keep the potato threshold");
  assert.equal(settleSuccessfulCashout("chili", 100, 5, 0).outcome, "bonus");
  assert.equal(settleSuccessfulCashout("chili", 100, 4.99, 0).outcome, "neutral", "showcase mode must keep the chili threshold");
  assert.equal(settleSuccessfulCashout("corn", 100, 2, 0).outcome, "bonus");
  assert.equal(settleSuccessfulCashout("corn", 100, 2, 0).payout, 250, "corn should add 50% of profit, not double the whole payout");
  assert.equal(settleSuccessfulCashout("mushroom", 100, 2, 0).outcome, "bonus");
  assert.equal(settleCrashRole("pumpkin", 100, 0).payout, 100);
  assert.ok(pairProfitFactor("scallion", 0).factor > 1);
  assert.ok(pairProfitFactor("peanut", 0).factor > 1);
});

test("keeps the chase meter cosmetic and independent from the hidden crash point", async () => {
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  assert.match(source, /intentionally non-predictive show meter/);
  assert.match(source, /const visualRunTime = Math\.log\(Math\.max\(1, multiplier\)\) \* 5\.2/);
  assert.doesNotMatch(source, /Math\.log\(multiplier\) \/ Math\.log\(crashPoint\)/);
  assert.match(source, /title="追擊距離為動畫演出，不代表爆點"/);
});

test("gives larger history multipliers progressively stronger visual tiers", async () => {
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const tier of ["cold", "warm", "hot", "mega", "epic", "legendary"]) {
    assert.match(styles, new RegExp(`\\.history-strip \\.${tier}`));
  }
  assert.match(source, /if \(value >= 50\) return "legendary"/);
  assert.match(source, /if \(value >= 20\) return "epic"/);
  assert.match(styles, /Arial Rounded MT Bold/);
});

test("emphasizes successful cash-out winnings at round settlement", async () => {
  const source = await readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /CASH OUT SUCCESS/);
  assert.match(source, /`WIN \+\$\{money\(ticket\.payout\)\}`/);
  assert.match(styles, /\.result-ribbon \.result-cashed \{[^}]*min-width:148px;[^}]*height:58px/);
  assert.match(styles, /@keyframes winResultPop/);
  assert.match(styles, /@keyframes winAmountPulse/);
});

test("keeps every role effect purely positive", () => {
  const multipliers = [1.2, 1.5, 2, 3, 5, 10, 50];
  for (const roleId of roleIds) {
    for (const multiplier of multipliers) {
      for (const roll of [0.01, 0.49, 0.75, 0.99]) {
        const settlement = settleSuccessfulCashout(roleId, 100, multiplier, roll);
        assert.ok(settlement.payout >= 100 * multiplier, `${roleId} reduced a ${multiplier}x success`);
        assert.notEqual(settlement.outcome, "tradeoff");
      }
    }
  }
  assert.equal(settleCrashRole("pumpkin", 100, 0.01).payout, 100, "pumpkin must refund the full principal when it triggers");
  assert.equal(settleCrashRole("pumpkin", 100, 0.99).payout, 0);
  assert.equal(pairProfitFactor("peanut", 0.25).factor, 1.24);
  assert.equal(pairProfitFactor("peanut", 0.75).factor, 1);
  assert.equal(pairProfitFactor("scallion", 0.25).factor, 1.4);
  assert.equal(pairProfitFactor("scallion", 0.75).factor, 1);
});

test("matches the analytical feature budget to the actual settlements", () => {
  const sampleCount = 210_000;
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

test("calibrates every single-role VI curve to 96% RTP", () => {
  const multipliers = [1.01, 1.2, 1.5, 1.99, 2, 3, 5, 10, 25, 50, 99, 99.9];
  for (const roleId of roleIds) {
    for (const multiplier of multipliers) {
      const wagers = [{ roleId, stake: 1, target: multiplier }];
      const baseRtp = calibrateRoundBaseRtp(wagers);
      const actual = expectedRoundReturn(wagers, baseRtp);
      assert.ok(baseRtp <= TARGET_RTP, `${roleId} used a base curve above 96%`);
      assert.ok(Math.abs(actual - TARGET_RTP) < 1e-9, `${roleId} at ${multiplier}x returned ${actual}`);
    }
  }
});

test("calibrates all 55 unordered two-role VI curves to 96% RTP", () => {
  const multipliers = [1.2, 1.5, 2, 3, 5, 10, 25, 50];
  let combinationCount = 0;
  for (let first = 0; first < roleIds.length; first += 1) {
    for (let second = first; second < roleIds.length; second += 1) {
      const firstStake = 1;
      const secondStake = 1 + ((first + second) % 5);
      const wagers = [
        { roleId: roleIds[first], stake: firstStake, target: multipliers[first % multipliers.length] },
        { roleId: roleIds[second], stake: secondStake, target: multipliers[(second + 3) % multipliers.length] },
      ];
      const baseRtp = calibrateRoundBaseRtp(wagers);
      const combinedRtp = expectedRoundReturn(wagers, baseRtp) / (firstStake + secondStake);
      assert.ok(Math.abs(combinedRtp - TARGET_RTP) < 1e-9, `${roleIds[first]} + ${roleIds[second]} returned ${combinedRtp}`);
      combinationCount += 1;
    }
  }
  assert.equal(combinationCount, 55);
});

test("maps the committed crash unit through the selected VI curve", () => {
  const sampleCount = 400_000;
  for (const baseRtp of [0.96, 0.85, 0.72, 0.64]) {
    for (const multiplier of [1.01, 1.5, 2, 5, 10, 50, 99.9]) {
      let wins = 0;
      for (let index = 0; index < sampleCount; index += 1) {
        if (multiplier < crashPointFromUnit((index + 0.5) / sampleCount, baseRtp)) wins += 1;
      }
      const actual = multiplier * wins / sampleCount;
      assert.ok(Math.abs(actual - baseRtp) < 0.0004, `${baseRtp} VI curve at ${multiplier}x returned ${actual}`);
      assert.ok(Math.abs(survivalAt(multiplier, baseRtp) * multiplier - baseRtp) < 1e-12);
    }
  }
});

test("stronger abilities produce lower base VI curves without negative settlements", () => {
  const wagers = [
    { roleId: "peanut", stake: 3, target: 2 },
    { roleId: "scallion", stake: 2, target: 5 },
  ];
  const pairBaseRtp = calibrateRoundBaseRtp(wagers);
  const cornBaseRtp = calibrateRoundBaseRtp([{ roleId: "corn", stake: 1, target: 3 }]);
  assert.ok(pairBaseRtp < TARGET_RTP);
  assert.ok(cornBaseRtp > 0.8, "corn's profit-only bonus should avoid the old 64% extreme base curve");
  assert.ok(cornBaseRtp < pairBaseRtp, "corn's frequent gold-side bonus should still use a more volatile base curve");
  assert.ok(Math.abs(expectedRoundReturn(wagers, pairBaseRtp) / 5 - TARGET_RTP) < 1e-9);
});
