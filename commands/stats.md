---
description: Show a local Codex usage dashboard and activity heatmap based on ~/.codex session logs.
---

# /codex-stats:stats

Render the local Codex usage dashboard for this machine.

## Preflight

1. Confirm that `~/.codex/sessions` exists.
2. Confirm that `node` is available on PATH.
3. Confirm that `~/plugins/codex-stats/scripts/codex-stats.mjs` exists.

If the session directory is missing, explain that there are no local Codex session logs to analyze yet and stop.

## Plan

Render a compact, monochrome dashboard from local Codex session logs and paste the output into the final response so the heatmap is visible without expanding shell output.

This command is read-only.

## Commands

For Codex chat, run the compact mono dashboard:

```bash
node ~/plugins/codex-stats/scripts/codex-stats.mjs --compact --theme mono
```

If the user wants a narrower window, re-run with one of:

```bash
node ~/plugins/codex-stats/scripts/codex-stats.mjs --compact --theme mono --range 7d
node ~/plugins/codex-stats/scripts/codex-stats.mjs --compact --theme mono --range 30d
```

If the user wants structured output for follow-up analysis, run:

```bash
node ~/plugins/codex-stats/scripts/codex-stats.mjs --json
```

## Verification

Confirm that the command exits successfully and that the output includes:

- heatmap glyph rows
- `Favorite model`
- `Total tokens`
- `Sessions`

If the command fails, report the error and do not fabricate a dashboard.

## Summary

In the final response, paste the rendered compact dashboard verbatim in a fenced `text` block before any explanation.

When adding a brief summary after the block, state the MVP assumption clearly: daily activity is based on `input_tokens + output_tokens`, values come from per-event `token_count` deltas, and cached/reasoning tokens are not used for heatmap intensity.

## Next Steps

If the user asks for more detail, offer the model breakdown via `/codex-stats:models` or a narrower range such as `--range 7d` or `--range 30d`.
