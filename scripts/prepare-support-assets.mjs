import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [outputDir, ...pairs] = process.argv.slice(2);

if (!outputDir || pairs.length === 0 || pairs.length % 2 !== 0) {
  throw new Error("Usage: node scripts/prepare-support-assets.mjs <output-dir> <name> <input> [...]");
}

await mkdir(outputDir, { recursive: true });

for (let index = 0; index < pairs.length; index += 2) {
  const name = pairs[index];
  const input = pairs[index + 1];
  await sharp(input)
    .resize(384, 384, { fit: "cover", position: "centre" })
    .webp({ quality: 88, effort: 5 })
    .toFile(path.join(outputDir, `${name}.webp`));
}
