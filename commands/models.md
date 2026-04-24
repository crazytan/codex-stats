---
description: Show the Codex model usage breakdown from ~/.codex session logs.
---

# /codex-stats:models

Render the local Codex model usage breakdown for this machine.

## Preflight

1. Confirm that `~/.codex/sessions` exists.
2. Confirm that `node` is available on PATH.
3. Confirm that `~/plugins/codex-stats/scripts/codex-stats.mjs` exists.

If the session directory is missing, explain that there are no local Codex session logs to analyze yet and stop.

## Plan

Render the local model usage breakdown from Codex session logs. This command is read-only.

## Commands

Run:

```bash
node ~/plugins/codex-stats/scripts/codex-stats.mjs --models
```

If the user wants a narrower window, re-run with one of:

```bash
node ~/plugins/codex-stats/scripts/codex-stats.mjs --models --range 7d
node ~/plugins/codex-stats/scripts/codex-stats.mjs --models --range 30d
```

If the user wants structured output for follow-up analysis, run:

```bash
node ~/plugins/codex-stats/scripts/codex-stats.mjs --json
```

## Verification

Confirm that the command exits successfully and that the output includes model names, token totals, and share percentages.

If the command fails, report the error and do not fabricate model totals.

## Summary

In the final response, paste the rendered model breakdown in a fenced `text` block before any explanation.

## Next Steps

If the user asks for a visual dashboard, offer `/codex-stats:stats`.
