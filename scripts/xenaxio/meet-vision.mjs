#!/usr/bin/env node
// xenaxio step 92: MediaPipe's code for the background in video meetings
// (blur, a picture behind the person) is served from this origin, never from
// a CDN. It is ~19 MB of WebAssembly in node_modules/@mediapipe/tasks-vision,
// so it is copied into public/ at build time (and for `npm run dev`) instead
// of living in git. The model (public/xenaxio/meet/selfie_segmenter.tflite,
// 250 KB, Apache-2.0) is in git: npm does not ship it.
//
//   node scripts/xenaxio/meet-vision.mjs
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
// The copy @livekit/track-processors itself loads, wherever npm put it.
const processors = createRequire(createRequire(join(root, "package.json")).resolve("@livekit/track-processors"));
const from = join(dirname(processors.resolve("@mediapipe/tasks-vision")), "wasm");
const out = join(root, "public/xenaxio/meet/vision");
const version = JSON.parse(readFileSync(join(dirname(from), "package.json"), "utf8")).version;

mkdirSync(out, { recursive: true });
let copied = 0;
for (const name of readdirSync(from)) {
  const source = join(from, name);
  const target = join(out, name);
  if (existsSync(target) && statSync(target).size === statSync(source).size && statSync(target).mtimeMs >= statSync(source).mtimeMs) continue;
  copyFileSync(source, target);
  copied++;
}
writeFileSync(join(out, "VERSION"), `@mediapipe/tasks-vision ${version} (Apache-2.0)\n`);
console.log(`[xenaxio] meet vision: ${copied} file(s) copied to public/xenaxio/meet/vision (tasks-vision ${version})`);
