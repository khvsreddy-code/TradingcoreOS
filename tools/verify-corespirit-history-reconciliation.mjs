import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const arch = readFileSync(resolve(root, "docs/CORESPIRIT.md"), "utf8");
const tracker = readFileSync(resolve(root, "docs/CORESPIRIT_BUILD_TRACKER.md"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(root, "CORESPIRIT_V59_MANIFEST.json"), "utf8"));

const requiredDocs = [
  "docs/CORESPIRIT.md",
  "docs/CORESPIRIT_BUILD_TRACKER.md",
  "CORESPIRIT_V59_MANIFEST.json",
];
const requiredHistory = [
  "CORESPIRIT_V37_MANIFEST.json","CORESPIRIT_V38_MANIFEST.json","CORESPIRIT_V39_MANIFEST.json","CORESPIRIT_V40_MANIFEST.json",
  "CORESPIRIT_V41_MANIFEST.json","CORESPIRIT_V42_MANIFEST.json","CORESPIRIT_V43_MANIFEST.json","CORESPIRIT_V45_MANIFEST.json",
];

for (const p of requiredDocs) readFileSync(resolve(root, p), "utf8");
for (const p of requiredHistory) readFileSync(resolve(root, p), "utf8");
if (!arch.includes("Historical lineage and recovered invariants")) throw new Error("architecture history missing");
if (!tracker.includes("Historical lineage reconciliation")) throw new Error("tracker reconciliation missing");
if (manifest.roadmap_range !== "1-39") throw new Error("roadmap changed during documentation-only reconciliation");
if (manifest.historical_manifest_integrity !== "byte-for-byte identical to supplied historical archive") throw new Error("historical manifest integrity policy missing");
console.log("CORESPIRIT_HISTORY_RECONCILIATION_OK");
