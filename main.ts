// gta6-meme-x-01 entrypoint (Node 22, standard library only).
//
// The entry itself is a post on X: a GTA 6 meme whose first picture the
// house reads from the post and hands to its judge. This repository only
// has to name that post, so the whole job of the program is to carry the
// repository's POST.json into the output directory the gate reads:
//
//   POST.json  ->  <output dir>/POST.json      (byte for byte)
//
// The grader runs the program with the repository at /bot and the output
// at /output. Away from the grader the two MAKEFUN_* variables stand in
// for those places:
//
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The program prints nothing when the copy lands. When POST.json cannot
// be read or written it says why on stderr and exits 1. It touches no
// network, no clock and nothing outside the two directories, so two runs
// always leave the same bytes behind.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const botDir = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(message: string): never {
  console.error(`gta6-meme-x-01: ${message}`);
  process.exit(1);
}

const sourcePath = join(botDir, 'POST.json');
const targetPath = join(outputDir, 'POST.json');

// Make the output directory first: even when the copy goes on to fail,
// the run leaves a real place behind, which makes the failure easier to
// spot than a missing directory.
mkdirSync(outputDir, { recursive: true });

let postBytes: Buffer;
try {
  postBytes = readFileSync(sourcePath);
} catch (err) {
  fail(`cannot read ${sourcePath}: ${(err as Error).message}`);
}

try {
  writeFileSync(targetPath, postBytes);
} catch (err) {
  fail(`cannot write ${targetPath}: ${(err as Error).message}`);
}

// The gate trusts these bytes, so confirm the copy came out the same
// size as the original before calling it done.
let copied: Buffer;
try {
  copied = readFileSync(targetPath);
} catch (err) {
  fail(`cannot read back ${targetPath}: ${(err as Error).message}`);
}
if (!copied.equals(postBytes)) {
  fail(
    `copy of POST.json does not match the original ` +
      `(${copied.length} of ${postBytes.length} bytes)`,
  );
}
