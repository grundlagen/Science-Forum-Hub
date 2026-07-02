// Reproducible assertions for the bid-rigging screens (no network).
//   pnpm --filter @workspace/extrapolator run verify-bid-rigging
import { detectBidRigging, screenTender, screenRotation } from "./detectors/bidRigging";
import type { Tender } from "./detectors/bidRigging";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

const tender = (id: string, amounts: number[], winner?: string): Tender => ({
  tenderId: id,
  bids: amounts.map((amount, i) => ({ bidder: `B${i + 1}`, amount })),
  winner,
});

// 1. Competitive tender: the two lowest bids are close (real price competition),
// the rest spread widely.
const comp = screenTender(tender("c1", [100_000, 103_000, 118_000, 131_000]));
check("competitive tender: CV not suspicious", comp.cvSuspicious === false);
check("competitive tender: RD not suspicious", comp.rdSuspicious === false);

// 2. Cover bidding: losers cluster tightly well above the designated winner.
const cover = screenTender(tender("r1", [100_000, 138_000, 139_500, 140_600]));
check("cover bidding: RD suspicious", cover.rdSuspicious === true);

// 3. Coordinated pricing: all bids within a few percent.
const tight = screenTender(tender("r2", [100_000, 101_200, 102_500, 103_100]));
check("tight bids: CV suspicious", tight.cvSuspicious === true);

// 4. Rotation: same 3 firms meet 6 times and share wins evenly.
const rotTenders: Tender[] = Array.from({ length: 6 }, (_, i) => ({
  tenderId: `rot${i}`,
  bids: [
    { bidder: "Alpha", amount: 100 + (i % 3 === 0 ? 0 : 10) },
    { bidder: "Beta", amount: 100 + (i % 3 === 1 ? 0 : 10) },
    { bidder: "Gamma", amount: 100 + (i % 3 === 2 ? 0 : 10) },
  ],
}));
const rot = screenRotation(rotTenders);
check("rotation group found", rot.length === 1);
check("rotation flagged", rot[0].rotationSuspicious === true);

// 5. Dominant winner (competitive market) is NOT rotation.
const domTenders: Tender[] = Array.from({ length: 6 }, (_, i) => ({
  tenderId: `dom${i}`,
  bids: [
    { bidder: "Alpha", amount: 100 },
    { bidder: "Beta", amount: 110 + i },
    { bidder: "Gamma", amount: 112 + i },
  ],
}));
const dom = screenRotation(domTenders);
check("dominant winner not flagged as rotation", dom.every((r) => r.rotationSuspicious === false));

// 6. Detector needs >= 2 concordant screens to fire.
const oneScreen = detectBidRigging("Lone CV", [tender("x", [100_000, 101_000, 102_000])]);
check("single screen does not fire", oneScreen.fired === false);

const twoScreens = detectBidRigging("Cartel Rd", [
  tender("y1", [100_000, 101_200, 102_500, 103_100]), // tight CV
  tender("y2", [100_000, 138_000, 139_500, 140_600]), // cover-bid RD
]);
check("two concordant screens fire", twoScreens.fired === true);
check("fired score meaningful and bounded", twoScreens.score >= 40 && twoScreens.score <= 100);

// 7. Degenerate inputs are safe.
const tiny = detectBidRigging("Tiny", [tender("t", [100_000])]);
check("single-bid tender is safe and silent", tiny.fired === false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
