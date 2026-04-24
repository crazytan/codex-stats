import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const DEFAULT_GLYPHS = ["·", "░", "▒", "▓", "█"];
const ASCII_GLYPHS = [".", "-", "+", "*", "#"];
const ROW_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const RANGE_LABELS = {
  all: "All time",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const COLOR_THEMES = {
  mono: [null, null, null, null, null],
  blue: [null, "38;5;110", "38;5;68", "38;5;33", "1;38;5;27"],
  cool: [null, "38;5;110", "38;5;68", "38;5;33", "1;38;5;27"],
  ember: [null, "33", "93", "31", "1;31"],
};

export function expandHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }
  if (inputPath === "~") {
    return os.homedir();
  }
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toLocalDateKey(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysBetween(startDate, endDate) {
  const startMs = startOfLocalDay(startDate).getTime();
  const endMs = startOfLocalDay(endDate).getTime();
  return Math.round((endMs - startMs) / 86_400_000);
}

function inclusiveDayCount(startDate, endDate) {
  return daysBetween(startDate, endDate) + 1;
}

function parseTimestampMs(record) {
  if (typeof record?.timestamp === "string") {
    const parsed = Date.parse(record.timestamp);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  if (typeof record?.payload?.timestamp === "string") {
    const parsed = Date.parse(record.payload.timestamp);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseModel(record) {
  if (record?.type === "turn_context" && typeof record?.payload?.model === "string") {
    return record.payload.model;
  }

  if (record?.type === "session_meta" && typeof record?.payload?.model === "string") {
    return record.payload.model;
  }

  return null;
}

function parseTokenSnapshot(record) {
  if (record?.type !== "event_msg" || record?.payload?.type !== "token_count") {
    return null;
  }

  const totals = record?.payload?.info?.total_token_usage;
  const inputTokens = Number(totals?.input_tokens);
  const outputTokens = Number(totals?.output_tokens);

  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) {
    return null;
  }

  return inputTokens + outputTokens;
}

async function collectJsonlFiles(rootDir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return files;
}

function sumValues(iterable) {
  let total = 0;
  for (const value of iterable) {
    total += value;
  }
  return total;
}

function computeBucketThresholds(values) {
  const sorted = [...values].filter((value) => value > 0).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return { uniqueCount: 0, q1: 0, q2: 0, q3: 0 };
  }

  const uniqueCount = new Set(sorted).size;
  const percentile = (fraction) => {
    const index = Math.floor((sorted.length - 1) * fraction);
    return sorted[index];
  };

  return {
    uniqueCount,
    q1: percentile(0.25),
    q2: percentile(0.5),
    q3: percentile(0.75),
  };
}

function bucketForValue(value, thresholds) {
  if (value <= 0) {
    return 0;
  }
  if (thresholds.uniqueCount <= 1) {
    return 4;
  }
  if (value <= thresholds.q1) {
    return 1;
  }
  if (value <= thresholds.q2) {
    return 2;
  }
  if (value <= thresholds.q3) {
    return 3;
  }
  return 4;
}

function buildBucketMap(dailyTotals, startDate, endDate) {
  const visibleValues = [];
  for (let date = new Date(startDate); date <= endDate; date = addDays(date, 1)) {
    const value = dailyTotals.get(toLocalDateKey(date)) ?? 0;
    if (value > 0) {
      visibleValues.push(value);
    }
  }

  const thresholds = computeBucketThresholds(visibleValues);
  const buckets = new Map();

  for (let date = new Date(startDate); date <= endDate; date = addDays(date, 1)) {
    const key = toLocalDateKey(date);
    buckets.set(key, bucketForValue(dailyTotals.get(key) ?? 0, thresholds));
  }

  return buckets;
}

function decorateGlyph(bucket, { ascii, useColor, theme }) {
  const glyphs = ascii ? ASCII_GLYPHS : DEFAULT_GLYPHS;
  const glyph = glyphs[bucket];

  if (!useColor) {
    return glyph;
  }

  const palette = COLOR_THEMES[theme] ?? COLOR_THEMES.cool;
  const code = palette[bucket];
  if (!code) {
    return glyph;
  }
  return `\u001b[${code}m${glyph}\u001b[0m`;
}

function renderLegend({ ascii, useColor, theme }) {
  return [1, 2, 3, 4]
    .map((bucket) => decorateGlyph(bucket, { ascii, useColor, theme }))
    .join(" ");
}

function buildMonthLabelRow(weekStarts, startDate, endDate) {
  const labelCells = Array(weekStarts.length).fill(" ");
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short" });
  let lastLabelEnd = -1;

  for (let column = 0; column < weekStarts.length; column += 1) {
    const weekStart = weekStarts[column];
    let labelDate = null;

    for (let row = 0; row < 7; row += 1) {
      const date = addDays(weekStart, row);
      if (date < startDate || date > endDate) {
        continue;
      }
      if (column === 0 && row === 0) {
        labelDate = date;
        break;
      }
      if (date.getDate() === 1) {
        labelDate = date;
        break;
      }
    }

    if (!labelDate) {
      continue;
    }

    const label = formatter.format(labelDate);
    if (column <= lastLabelEnd) {
      continue;
    }

    for (let index = 0; index < label.length && column + index < labelCells.length; index += 1) {
      labelCells[column + index] = label[index];
    }
    lastLabelEnd = column + label.length;
  }

  return labelCells.join("");
}

function buildHeatmapRows({ startDate, endDate, bucketMap, ascii, useColor, theme }) {
  const alignedStart = addDays(startDate, -startDate.getDay());
  const alignedEnd = addDays(endDate, 6 - endDate.getDay());
  const weekCount = Math.ceil(inclusiveDayCount(alignedStart, alignedEnd) / 7);

  const weekStarts = Array.from({ length: weekCount }, (_, index) => addDays(alignedStart, index * 7));
  const rows = Array.from({ length: 7 }, () => []);

  for (const weekStart of weekStarts) {
    for (let row = 0; row < 7; row += 1) {
      const date = addDays(weekStart, row);
      if (date < startDate || date > endDate) {
        rows[row].push(" ");
        continue;
      }
      const bucket = bucketMap.get(toLocalDateKey(date)) ?? 0;
      rows[row].push(decorateGlyph(bucket, { ascii, useColor, theme }));
    }
  }

  return {
    monthLabels: buildMonthLabelRow(weekStarts, startDate, endDate),
    rows: rows.map((row) => row.join("")),
  };
}

function formatCompactNumber(value) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  }
  return String(Math.round(value));
}

function formatPercent(value) {
  return `${(value * 100).toFixed(value >= 0.1 ? 0 : 1)}%`;
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatShortDate(dateKey) {
  return fromDateKey(dateKey).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function buildSelectorLine(range) {
  return ["all", "7d", "30d"]
    .map((key) => (key === range ? `[${RANGE_LABELS[key]}]` : RANGE_LABELS[key]))
    .join(" · ");
}

function computeStreaks(dailyTotals, startDate, endDate) {
  let longest = 0;
  let running = 0;

  for (let date = new Date(startDate); date <= endDate; date = addDays(date, 1)) {
    const active = (dailyTotals.get(toLocalDateKey(date)) ?? 0) > 0;
    if (active) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }

  let current = 0;
  for (let date = new Date(endDate); date >= startDate; date = addDays(date, -1)) {
    const active = (dailyTotals.get(toLocalDateKey(date)) ?? 0) > 0;
    if (!active) {
      break;
    }
    current += 1;
  }

  return { longest, current };
}

function pickMostActiveDay(dailyTotals, startDate, endDate) {
  let bestDateKey = null;
  let bestValue = -1;

  for (let date = new Date(startDate); date <= endDate; date = addDays(date, 1)) {
    const dateKey = toLocalDateKey(date);
    const value = dailyTotals.get(dateKey) ?? 0;
    if (value > bestValue) {
      bestValue = value;
      bestDateKey = dateKey;
    }
  }

  if (!bestDateKey || bestValue <= 0) {
    return null;
  }

  return { dateKey: bestDateKey, tokens: bestValue };
}

function supportsColor() {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

export async function analyzeCodexUsage({
  codexHome = path.join(os.homedir(), ".codex"),
  range = "all",
  now = new Date(),
  ascii = false,
  useColor = supportsColor(),
  theme = "blue",
  minimumAllRangeDays = 183,
} = {}) {
  const resolvedCodexHome = expandHome(codexHome);
  const sessionsRoot = path.join(resolvedCodexHome, "sessions");

  let sessionFiles;
  try {
    sessionFiles = await collectJsonlFiles(sessionsRoot);
  } catch (error) {
    const friendly = new Error(`Could not read session logs under ${sessionsRoot}`);
    friendly.cause = error;
    throw friendly;
  }

  const dailyTotals = new Map();
  const sessionSummaries = [];

  for (const filePath of sessionFiles) {
    let sessionId = path.basename(filePath, ".jsonl");
    let model = null;
    let firstTimestampMs = null;
    let lastTimestampMs = null;
    let previousSnapshot = 0;

    const reader = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });

    for await (const line of reader) {
      if (!line.trim()) {
        continue;
      }

      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }

      const timestampMs = parseTimestampMs(record);
      if (timestampMs !== null) {
        if (firstTimestampMs === null || timestampMs < firstTimestampMs) {
          firstTimestampMs = timestampMs;
        }
        if (lastTimestampMs === null || timestampMs > lastTimestampMs) {
          lastTimestampMs = timestampMs;
        }
      }

      if (record?.type === "session_meta" && typeof record?.payload?.id === "string") {
        sessionId = record.payload.id;
      }

      model = parseModel(record) ?? model;

      const snapshot = parseTokenSnapshot(record);
      if (snapshot === null || timestampMs === null) {
        continue;
      }

      let delta = snapshot - previousSnapshot;
      if (delta < 0) {
        delta = snapshot;
      }
      previousSnapshot = snapshot;

      if (delta <= 0) {
        continue;
      }

      const dateKey = toLocalDateKey(new Date(timestampMs));
      dailyTotals.set(dateKey, (dailyTotals.get(dateKey) ?? 0) + delta);
    }

    if (firstTimestampMs === null && lastTimestampMs === null) {
      continue;
    }

    sessionSummaries.push({
      id: sessionId,
      model: model ?? "unknown",
      totalTokens: previousSnapshot,
      firstTimestampMs: firstTimestampMs ?? lastTimestampMs ?? Date.now(),
      lastTimestampMs: lastTimestampMs ?? firstTimestampMs ?? Date.now(),
      durationMs: Math.max(0, (lastTimestampMs ?? 0) - (firstTimestampMs ?? 0)),
    });
  }

  const today = startOfLocalDay(now);
  const availableDateKeys = [...dailyTotals.keys()].sort();
  const earliestDate = availableDateKeys.length > 0 ? fromDateKey(availableDateKeys[0]) : today;
  const normalizedRange = range === "7" ? "7d" : range === "30" ? "30d" : range;
  const minimumAllStartDate = addDays(today, -(Math.max(1, minimumAllRangeDays) - 1));

  let startDate = earliestDate;
  if (normalizedRange === "all") {
    if (earliestDate > minimumAllStartDate) {
      startDate = minimumAllStartDate;
    }
  } else if (normalizedRange === "7d") {
    startDate = addDays(today, -6);
  } else if (normalizedRange === "30d") {
    startDate = addDays(today, -29);
  }

  if (startDate > today) {
    startDate = today;
  }

  const endDate = today;
  const visibleSessions = sessionSummaries.filter((session) => {
    const sessionStart = startOfLocalDay(new Date(session.firstTimestampMs));
    const sessionEnd = startOfLocalDay(new Date(session.lastTimestampMs));
    return sessionStart <= endDate && sessionEnd >= startDate;
  });

  const visibleModelTotals = new Map();
  for (const session of visibleSessions) {
    visibleModelTotals.set(
      session.model,
      (visibleModelTotals.get(session.model) ?? 0) + session.totalTokens,
    );
  }

  const favoriteModelEntry = [...visibleModelTotals.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
  const mostActiveDay = pickMostActiveDay(dailyTotals, startDate, endDate);
  const streaks = computeStreaks(dailyTotals, startDate, endDate);
  const bucketMap = buildBucketMap(dailyTotals, startDate, endDate);
  const heatmap = buildHeatmapRows({
    startDate,
    endDate,
    bucketMap,
    ascii,
    useColor,
    theme,
  });

  const totalDays = inclusiveDayCount(startDate, endDate);
  const activeDays = sumValues(
    Array.from({ length: totalDays }, (_, index) => {
      const key = toLocalDateKey(addDays(startDate, index));
      return (dailyTotals.get(key) ?? 0) > 0 ? 1 : 0;
    }),
  );

  const dailySeries = Array.from({ length: totalDays }, (_, index) => {
    const date = addDays(startDate, index);
    const dateKey = toLocalDateKey(date);
    return {
      date: dateKey,
      tokens: dailyTotals.get(dateKey) ?? 0,
      bucket: bucketMap.get(dateKey) ?? 0,
    };
  });

  return {
    codexHome: resolvedCodexHome,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    range: normalizedRange,
    window: {
      start: toLocalDateKey(startDate),
      end: toLocalDateKey(endDate),
      totalDays,
    },
    totals: {
      tokens: sumValues(dailySeries.map((entry) => entry.tokens)),
      sessions: visibleSessions.length,
      activeDays,
      longestSessionMs: visibleSessions.reduce(
        (best, session) => Math.max(best, session.durationMs),
        0,
      ),
      longestStreak: streaks.longest,
      currentStreak: streaks.current,
    },
    favoriteModel: favoriteModelEntry
      ? {
          name: favoriteModelEntry[0],
          tokens: favoriteModelEntry[1],
        }
      : null,
    mostActiveDay: mostActiveDay
      ? {
          date: mostActiveDay.dateKey,
          tokens: mostActiveDay.tokens,
        }
      : null,
    models: [...visibleModelTotals.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([name, tokens]) => ({ name, tokens })),
    daily: dailySeries,
    heatmap,
    renderOptions: {
      ascii,
      useColor,
      theme,
    },
  };
}

export function renderOverview(analysis) {
  const lines = [];
  lines.push("Codex Stats");
  lines.push("");
  lines.push("  Overview");
  lines.push("");
  lines.push(`      ${analysis.heatmap.monthLabels}`.trimEnd());

  for (let row = 0; row < analysis.heatmap.rows.length; row += 1) {
    const label = ROW_LABELS[row].padEnd(4, " ");
    lines.push(`${label}  ${analysis.heatmap.rows[row]}`.trimEnd());
  }

  lines.push("");
  lines.push(`      Less ${renderLegend(analysis.renderOptions)} More`);
  lines.push("");
  lines.push(`      ${buildSelectorLine(analysis.range)}`);
  lines.push("");

  const favoriteModel = analysis.favoriteModel?.name ?? "n/a";
  const favoriteModelTokens = analysis.favoriteModel?.tokens ?? 0;
  const mostActiveDay = analysis.mostActiveDay?.date
    ? formatShortDate(analysis.mostActiveDay.date)
    : "n/a";

  const leftRight = (left, right) =>
    `  ${left.padEnd(36, " ")}${right}`;

  lines.push(
    leftRight(
      `Favorite model: ${favoriteModel}`,
      `Total tokens: ${formatCompactNumber(analysis.totals.tokens)}`,
    ),
  );
  lines.push(
    leftRight(
      `Sessions: ${analysis.totals.sessions}`,
      `Longest session: ${formatDuration(analysis.totals.longestSessionMs)}`,
    ),
  );
  lines.push(
    leftRight(
      `Active days: ${analysis.totals.activeDays}/${analysis.window.totalDays}`,
      `Longest streak: ${analysis.totals.longestStreak} days`,
    ),
  );
  lines.push(
    leftRight(
      `Most active day: ${mostActiveDay}`,
      `Current streak: ${analysis.totals.currentStreak} days`,
    ),
  );
  lines.push("");
  lines.push(
    "  Activity metric: per-day deltas of input_tokens + output_tokens from token_count snapshots.",
  );

  if (favoriteModel !== "n/a") {
    lines.push(
      `  Favorite model tokens: ${formatCompactNumber(favoriteModelTokens)}.`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function renderCompactOverview(analysis) {
  const lines = [];
  lines.push(`      ${analysis.heatmap.monthLabels}`.trimEnd());

  for (let row = 0; row < analysis.heatmap.rows.length; row += 1) {
    const label = ROW_LABELS[row].padEnd(4, " ");
    lines.push(`${label}  ${analysis.heatmap.rows[row]}`.trimEnd());
  }

  lines.push(`      Less ${renderLegend(analysis.renderOptions)} More`);
  lines.push(`      ${buildSelectorLine(analysis.range)}`);

  const favoriteModel = analysis.favoriteModel?.name ?? "n/a";
  const mostActiveDay = analysis.mostActiveDay?.date
    ? formatShortDate(analysis.mostActiveDay.date)
    : "n/a";

  const leftRight = (left, right) => `${left.padEnd(34, " ")}${right}`;

  lines.push(
    leftRight(
      `Favorite model: ${favoriteModel}`,
      `Total tokens: ${formatCompactNumber(analysis.totals.tokens)}`,
    ),
  );
  lines.push(
    leftRight(
      `Sessions: ${analysis.totals.sessions}`,
      `Longest session: ${formatDuration(analysis.totals.longestSessionMs)}`,
    ),
  );
  lines.push(
    leftRight(
      `Active days: ${analysis.totals.activeDays}/${analysis.window.totalDays}`,
      `Longest streak: ${analysis.totals.longestStreak} days`,
    ),
  );
  lines.push(
    leftRight(
      `Most active day: ${mostActiveDay}`,
      `Current streak: ${analysis.totals.currentStreak} days`,
    ),
  );

  return `${lines.join("\n")}\n`;
}

export function renderModels(analysis) {
  const lines = [];
  lines.push("Codex Stats");
  lines.push("");
  lines.push("  Models");
  lines.push("");

  const totalModelTokens = analysis.models.reduce((sum, model) => sum + model.tokens, 0);
  if (analysis.models.length === 0 || totalModelTokens <= 0) {
    lines.push("  No model usage found in the selected window.");
    return `${lines.join("\n")}\n`;
  }

  for (const model of analysis.models) {
    const share = totalModelTokens > 0 ? model.tokens / totalModelTokens : 0;
    lines.push(
      `  ${model.name.padEnd(20, " ")} ${formatCompactNumber(model.tokens).padStart(8, " ")}  ${formatPercent(share).padStart(5, " ")}`,
    );
  }

  lines.push("");
  lines.push(`  Window: ${analysis.window.start} to ${analysis.window.end}`);
  lines.push(`  Total model tokens: ${formatCompactNumber(totalModelTokens)}`);
  lines.push("  Metric: session-level input_tokens + output_tokens snapshots.");

  return `${lines.join("\n")}\n`;
}
