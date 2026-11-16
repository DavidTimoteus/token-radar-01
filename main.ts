/**
 * Token Launch Radar - Entrypoint v1.1.0
 * Autonomous Pipeline for Make.fun Bounty (token-radar-01).
 * Standalone Node 22 TypeScript program.
 * Reads protocol snapshot, executes radar valuation model,
 * generates board and dashboard artifacts, and compiles dossier.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseSnapshot, buildRadar, boardIssue, dataScript } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const appRoot = fileURLToPath(new URL('.', import.meta.url));

function parseArgs(): { inputPath: string; outDir: string } {
  let inputPath = env.MAKEFUN_INPUT_DIR || '/input';
  let outDir = env.MAKEFUN_OUTPUT_DIR || '/output';

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input' && i + 1 < argv.length) {
      inputPath = argv[++i];
    } else if (arg.startsWith('--input=')) {
      inputPath = arg.slice(8);
    } else if (arg === '--output' && i + 1 < argv.length) {
      outDir = argv[++i];
    } else if (arg.startsWith('--output=')) {
      outDir = arg.slice(9);
    }
  }

  let inputFile = inputPath.endsWith('.json') ? inputPath : join(inputPath, 'snapshot.json');
  if (!existsSync(inputFile)) {
    const candidatePaths = [
      resolve(inputFile),
      resolve(join(appRoot, 'input', 'snapshot.json')),
      resolve(join(appRoot, '..', 'token-radar-01-kit', 'input', 'snapshot.json')),
      resolve(join('input', 'snapshot.json'))
    ];
    for (const cand of candidatePaths) {
      if (existsSync(cand)) {
        inputFile = cand;
        break;
      }
    }
  }

  return { inputPath: resolve(inputFile), outDir: resolve(outDir) };
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function main(): void {
  const { inputPath, outDir } = parseArgs();

  console.log(`[TokenRadar] Initializing radar pipeline...`);
  console.log(`[TokenRadar] Reading snapshot from: ${inputPath}`);
  console.log(`[TokenRadar] Output directory: ${outDir}`);

  if (!existsSync(inputPath)) {
    console.error(`[TokenRadar] Error: Snapshot file not found at ${inputPath}`);
    exit(1);
  }

  // 1. Read and parse snapshot
  const rawJson = readFileSync(inputPath, 'utf8');
  const snapshot = parseSnapshot(rawJson);
  console.log(`[TokenRadar] Loaded ${snapshot.protocols.length} total protocols (Watchlist: ${snapshot.watchlist.length})`);

  // 2. Build Radar Board
  const board = buildRadar(snapshot, 200);
  console.log(`[TokenRadar] Scored ${board.rows.length} protocols across ${board.watchlist_count} watchlist targets`);

  // 3. Validate Board Integrity
  const issue = boardIssue(board, snapshot.watchlist);
  if (issue) {
    console.error(`[TokenRadar] Board integrity validation failed: ${issue}`);
    exit(1);
  }
  console.log(`[TokenRadar] Board integrity verified (100% watchlist coverage, strictly descending implied valuation)`);

  // 4. Create output directory tree
  const dashOutDir = join(outDir, 'dashboard');
  const shotsOutDir = join(outDir, 'screenshots');
  ensureDir(outDir);
  ensureDir(dashOutDir);
  ensureDir(shotsOutDir);

  // 5. Write board.json
  const boardJsonPath = join(outDir, 'board.json');
  writeFileSync(boardJsonPath, JSON.stringify(board, null, 2), 'utf8');
  console.log(`[TokenRadar] Wrote board.json (${board.rows.length} rows)`);

  // 6. Write data.js for static dashboard rendering
  const scriptContent = dataScript(board);
  writeFileSync(join(dashOutDir, 'data.js'), scriptContent, 'utf8');
  writeFileSync(join(outDir, 'data.js'), scriptContent, 'utf8');
  console.log(`[TokenRadar] Wrote dashboard/data.js and out/data.js`);

  // 7. Copy dashboard assets
  const dashboardFiles = ['index.html', 'app.css', 'app.js'];
  for (const file of dashboardFiles) {
    const srcFile = join(appRoot, 'dashboard', file);
    const destFile = join(dashOutDir, file);
    if (existsSync(srcFile)) {
      copyFileSync(srcFile, destFile);
      console.log(`[TokenRadar] Copied dashboard/${file}`);
    } else {
      console.error(`[TokenRadar] Error: Source file ${srcFile} not found`);
      exit(1);
    }
  }

  // 8. Copy screenshots
  const screenshotFiles = ['1-board.png', '2-detail.png', '3-filtered.png'];
  for (const shot of screenshotFiles) {
    const srcShot = join(appRoot, 'screenshots', shot);
    const destShot = join(shotsOutDir, shot);
    if (existsSync(srcShot)) {
      copyFileSync(srcShot, destShot);
      console.log(`[TokenRadar] Copied screenshots/${shot}`);
    } else {
      console.error(`[TokenRadar] Error: Screenshot ${srcShot} not found`);
      exit(1);
    }
  }

  // 9. Build and write dossier.json
  console.log(`[TokenRadar] Compiling dossier via makefun-board...`);
  const dossierBytes = buildDossier(outDir, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 }
  });

  const dossierPath = join(outDir, 'dossier.json');
  writeFileSync(dossierPath, dossierBytes);
  console.log(`[TokenRadar] Successfully wrote dossier.json (${dossierBytes.length} bytes)`);

  console.log(`[TokenRadar] Pipeline execution finished with 100% success.`);
}

main();
