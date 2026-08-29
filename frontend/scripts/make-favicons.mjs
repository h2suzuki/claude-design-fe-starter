#!/usr/bin/env node
// 元画像 1 枚から配信用の favicon を起こす。mock には出ない要件なので、実装側で機械的に作る
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const ICO_SIZES = [16, 32, 48];
const APPLE_SIZE = 180;
const OUT_DIR = path.join(import.meta.dirname, "..", "static");

const usage = `Usage: node scripts/make-favicons.mjs <source-image> [--round]

  <source-image>  正方形の元画像（透過 PNG または SVG）
  --round         円マスクを alpha へ焼く。元が不透過（写真 JPEG など）のときの救済

  出力: static/favicon.ico（${ICO_SIZES.join("/")} の多重）と static/apple-touch-icon.png（${APPLE_SIZE}px）`;

// ICO は PNG をそのまま格納できる。header 6 byte + directory 16 byte/枚 + 本体
function packIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length + pngs.length * 16;
  const directory = pngs.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    // 256 は 0 で表す。ICO の寸法欄は 1 byte しかない
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...directory, ...pngs.map(({ png }) => png)]);
}

// 縮小してから丸めると縁に元の背景が残る。焼くのは必ず縮小前。半径を 2px 内側にして JPEG のにじみを避ける
const circleMask = (side) =>
  Buffer.from(
    `<svg width="${side}" height="${side}"><circle cx="${side / 2}" cy="${side / 2}" r="${side / 2 - 2}" fill="#fff"/></svg>`,
  );

async function main() {
  const args = process.argv.slice(2);
  const round = args.includes("--round");
  const source = args.find((arg) => !arg.startsWith("--"));
  if (!source) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  const { width, height } = await sharp(source).metadata();
  if (!width || !height) throw new Error(`favicons: ${source} の寸法を読めない`);
  if (width !== height) {
    throw new Error(`favicons: ${source} が正方形でない（${width}×${height}）— 余白込みの正方形で渡す`);
  }

  const master = await (round
    ? sharp(source).ensureAlpha().composite([{ input: circleMask(width), blend: "dest-in" }])
    : sharp(source).ensureAlpha()
  )
    .png()
    .toBuffer();

  const icoPngs = await Promise.all(
    ICO_SIZES.map(async (size) => ({ size, png: await sharp(master).resize(size, size).png().toBuffer() })),
  );
  // apple-touch-icon は不透過のまま置く。角丸は iOS が自分で当てる
  const apple = await sharp(master).resize(APPLE_SIZE, APPLE_SIZE).flatten({ background: "#ffffff" }).png().toBuffer();

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, "favicon.ico"), packIco(icoPngs));
  writeFileSync(path.join(OUT_DIR, "apple-touch-icon.png"), apple);
  console.log(
    `favicons: ${source} -> static/favicon.ico (${ICO_SIZES.join("/")}) + static/apple-touch-icon.png (${APPLE_SIZE})`,
  );
}

await main();
