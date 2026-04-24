import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  analyzeCodexUsage,
  renderCompactOverview,
  renderModels,
  renderOverview,
} from "../src/analyze.mjs";

function localIso(year, month, day, hour, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

function sessionMeta(timestamp, id) {
  return {
    timestamp,
    type: "session_meta",
    payload: {
      id,
      timestamp,
    },
  };
}

function turnContext(timestamp, model) {
  return {
    timestamp,
    type: "turn_context",
    payload: {
      model,
    },
  };
}

function tokenCount(timestamp, inputTokens, outputTokens) {
  return {
    timestamp,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        },
      },
    },
  };
}

async function writeJsonl(filePath, records) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const lines = records.map((record) => JSON.stringify(record)).join("\n");
  await fs.writeFile(filePath, `${lines}\n`, "utf8");
}

test("analyzeCodexUsage aggregates daily token deltas and summary stats", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-stats-"));
  const codexHome = path.join(tempRoot, ".codex");
  const sessionsRoot = path.join(codexHome, "sessions", "2026", "04");

  await writeJsonl(path.join(sessionsRoot, "session-one.jsonl"), [
    sessionMeta(localIso(2026, 4, 10, 9), "session-one"),
    turnContext(localIso(2026, 4, 10, 9, 1), "gpt-5.4"),
    tokenCount(localIso(2026, 4, 10, 9, 5), 10, 5),
    tokenCount(localIso(2026, 4, 10, 9, 10), 20, 10),
    tokenCount(localIso(2026, 4, 11, 10), 25, 11),
  ]);

  await writeJsonl(path.join(sessionsRoot, "session-two.jsonl"), [
    sessionMeta(localIso(2026, 4, 11, 11), "session-two"),
    turnContext(localIso(2026, 4, 11, 11, 1), "gpt-5.3-codex"),
    tokenCount(localIso(2026, 4, 11, 11, 2), 12, 3),
    tokenCount(localIso(2026, 4, 12, 11, 3), 25, 10),
  ]);

  const analysis = await analyzeCodexUsage({
    codexHome,
    range: "all",
    now: new Date(2026, 3, 12, 12, 0, 0, 0),
    useColor: false,
  });

  assert.equal(analysis.totals.tokens, 71);
  assert.equal(analysis.totals.sessions, 2);
  assert.equal(analysis.totals.activeDays, 3);
  assert.equal(analysis.totals.longestStreak, 3);
  assert.equal(analysis.totals.currentStreak, 3);
  assert.equal(analysis.window.totalDays, 183);
  assert.equal(analysis.window.start, "2025-10-12");
  assert.equal(analysis.favoriteModel?.name, "gpt-5.4");
  assert.equal(analysis.favoriteModel?.tokens, 36);
  assert.equal(analysis.mostActiveDay?.date, "2026-04-10");

  const april10 = analysis.daily.find((entry) => entry.date === "2026-04-10");
  const april11 = analysis.daily.find((entry) => entry.date === "2026-04-11");
  const april12 = analysis.daily.find((entry) => entry.date === "2026-04-12");

  assert.equal(april10?.tokens, 30);
  assert.equal(april11?.tokens, 21);
  assert.equal(april12?.tokens, 20);
});

test("all range keeps older history when logs already span more than 6 months", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-stats-"));
  const codexHome = path.join(tempRoot, ".codex");
  const sessionsRoot = path.join(codexHome, "sessions", "2025", "08");

  await writeJsonl(path.join(sessionsRoot, "older-session.jsonl"), [
    sessionMeta(localIso(2025, 8, 1, 8), "older-session"),
    turnContext(localIso(2025, 8, 1, 8, 1), "gpt-5.4"),
    tokenCount(localIso(2025, 8, 1, 8, 2), 9, 1),
  ]);

  const analysis = await analyzeCodexUsage({
    codexHome,
    range: "all",
    now: new Date(2026, 3, 12, 12, 0, 0, 0),
    useColor: false,
  });

  assert.equal(analysis.window.start, "2025-08-01");
  assert.equal(analysis.window.end, "2026-04-12");
  assert.ok(analysis.window.totalDays > 183);
});

test("renderOverview prints the main summary fields", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-stats-"));
  const codexHome = path.join(tempRoot, ".codex");
  const sessionsRoot = path.join(codexHome, "sessions", "2026", "04");

  await writeJsonl(path.join(sessionsRoot, "session.jsonl"), [
    sessionMeta(localIso(2026, 4, 12, 8), "session"),
    turnContext(localIso(2026, 4, 12, 8, 1), "gpt-5.4"),
    tokenCount(localIso(2026, 4, 12, 8, 2), 8, 2),
  ]);

  const analysis = await analyzeCodexUsage({
    codexHome,
    range: "all",
    now: new Date(2026, 3, 12, 12, 0, 0, 0),
    useColor: false,
  });

  const output = renderOverview(analysis);
  assert.match(output, /Codex Stats/);
  assert.match(output, /Favorite model: gpt-5\.4/);
  assert.match(output, /Total tokens: 10/);
  assert.match(output, /Less ░ ▒ ▓ █ More/);
  assert.match(output, /Activity metric: per-day deltas of input_tokens \+ output_tokens/);
});

test("renderOverview colorizes the legend with the same ramp as the heatmap", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-stats-"));
  const codexHome = path.join(tempRoot, ".codex");
  const sessionsRoot = path.join(codexHome, "sessions", "2026", "04");

  await writeJsonl(path.join(sessionsRoot, "session.jsonl"), [
    sessionMeta(localIso(2026, 4, 12, 8), "session"),
    turnContext(localIso(2026, 4, 12, 8, 1), "gpt-5.4"),
    tokenCount(localIso(2026, 4, 12, 8, 2), 8, 2),
  ]);

  const analysis = await analyzeCodexUsage({
    codexHome,
    range: "all",
    now: new Date(2026, 3, 12, 12, 0, 0, 0),
    useColor: true,
    theme: "blue",
  });

  const output = renderOverview(analysis);
  assert.match(output, /\u001b\[38;5;110m░\u001b\[0m/);
  assert.match(output, /\u001b\[38;5;68m▒\u001b\[0m/);
  assert.match(output, /\u001b\[38;5;33m▓\u001b\[0m/);
  assert.match(output, /\u001b\[1;38;5;27m█\u001b\[0m/);
});

test("renderModels prints model totals and shares", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-stats-"));
  const codexHome = path.join(tempRoot, ".codex");
  const sessionsRoot = path.join(codexHome, "sessions", "2026", "04");

  await writeJsonl(path.join(sessionsRoot, "session-a.jsonl"), [
    sessionMeta(localIso(2026, 4, 12, 8), "session-a"),
    turnContext(localIso(2026, 4, 12, 8, 1), "gpt-5.4"),
    tokenCount(localIso(2026, 4, 12, 8, 2), 8, 2),
  ]);

  await writeJsonl(path.join(sessionsRoot, "session-b.jsonl"), [
    sessionMeta(localIso(2026, 4, 12, 9), "session-b"),
    turnContext(localIso(2026, 4, 12, 9, 1), "gpt-5.4-mini"),
    tokenCount(localIso(2026, 4, 12, 9, 2), 3, 1),
  ]);

  const analysis = await analyzeCodexUsage({
    codexHome,
    range: "all",
    now: new Date(2026, 3, 12, 12, 0, 0, 0),
    useColor: false,
  });

  const output = renderModels(analysis);
  assert.match(output, /Models/);
  assert.match(output, /gpt-5\.4/);
  assert.match(output, /gpt-5\.4-mini/);
  assert.match(output, /Total model tokens: 14/);
});

test("renderCompactOverview keeps the heatmap but omits the long explanatory footer", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-stats-"));
  const codexHome = path.join(tempRoot, ".codex");
  const sessionsRoot = path.join(codexHome, "sessions", "2026", "04");

  await writeJsonl(path.join(sessionsRoot, "session.jsonl"), [
    sessionMeta(localIso(2026, 4, 12, 8), "session"),
    turnContext(localIso(2026, 4, 12, 8, 1), "gpt-5.4"),
    tokenCount(localIso(2026, 4, 12, 8, 2), 8, 2),
  ]);

  const analysis = await analyzeCodexUsage({
    codexHome,
    range: "all",
    now: new Date(2026, 3, 12, 12, 0, 0, 0),
    useColor: false,
  });

  const output = renderCompactOverview(analysis);
  assert.match(output, /Less ░ ▒ ▓ █ More/);
  assert.match(output, /Favorite model: gpt-5\.4/);
  assert.doesNotMatch(output, /Activity metric:/);
  assert.doesNotMatch(output, /Favorite model tokens:/);
  assert.doesNotMatch(output, /Codex Stats/);
});
