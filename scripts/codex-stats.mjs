#!/usr/bin/env node

import os from "node:os";
import path from "node:path";

import {
  analyzeCodexUsage,
  renderCompactOverview,
  renderModels,
  renderOverview,
} from "../src/analyze.mjs";

function usage() {
  return `Codex Stats

Usage:
  node ./scripts/codex-stats.mjs [--range all|7d|30d] [--root ~/.codex] [--theme blue|ember|mono] [--ascii] [--compact] [--models] [--json]

Examples:
  node ./scripts/codex-stats.mjs
  node ./scripts/codex-stats.mjs --range 30d
  node ./scripts/codex-stats.mjs --compact --theme mono
  node ./scripts/codex-stats.mjs --models
  node ./scripts/codex-stats.mjs --json
`;
}

function parseArgs(argv) {
  const options = {
    range: "all",
    root: path.join(os.homedir(), ".codex"),
    theme: "blue",
    ascii: false,
    compact: false,
    models: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--range") {
      options.range = argv[index + 1] ?? options.range;
      index += 1;
      continue;
    }
    if (arg === "--root") {
      options.root = argv[index + 1] ?? options.root;
      index += 1;
      continue;
    }
    if (arg === "--theme") {
      options.theme = argv[index + 1] ?? options.theme;
      index += 1;
      continue;
    }
    if (arg === "--ascii") {
      options.ascii = true;
      continue;
    }
    if (arg === "--compact") {
      options.compact = true;
      continue;
    }
    if (arg === "--models") {
      options.models = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const analysis = await analyzeCodexUsage({
    codexHome: options.root,
    range: options.range,
    ascii: options.ascii,
    theme: options.theme,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(analysis, null, 2)}\n`);
    return;
  }

  if (options.models) {
    process.stdout.write(renderModels(analysis));
    return;
  }

  process.stdout.write(options.compact ? renderCompactOverview(analysis) : renderOverview(analysis));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
