---
description: Render a local Codex usage heatmap and summary stats from ~/.codex session logs. Use when the user asks for activity, streaks, token usage patterns, favorite models, or a local stats-style dashboard.
---

# Codex Stats

Use the local script in this plugin to inspect Codex session activity.

## Workflow

1. Confirm `~/.codex/sessions` exists.
2. For chat use inside Codex, run the compact mono dashboard so the heatmap fits naturally in the final answer:

```bash
node ~/plugins/codex-stats/scripts/codex-stats.mjs --compact --theme mono
```

3. Use flags when needed:

```bash
node ~/plugins/codex-stats/scripts/codex-stats.mjs --compact --theme mono --range 7d
node ~/plugins/codex-stats/scripts/codex-stats.mjs --compact --theme mono --range 30d
node ~/plugins/codex-stats/scripts/codex-stats.mjs --models
node ~/plugins/codex-stats/scripts/codex-stats.mjs --json
```

4. In the final answer, paste the rendered compact dashboard verbatim.
5. Do not add any explanatory sentence after the dashboard unless the user explicitly asks for analysis.
6. Do not replace the dashboard with a prose-only summary.

## Important Assumption

This MVP measures daily activity as the sum of `input_tokens + output_tokens` taken from the delta between successive `token_count` snapshots in local session JSONL files.

It does not currently use cached input tokens, reasoning output tokens, or a host-provided official activity score.
