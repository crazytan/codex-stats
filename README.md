# Codex Stats

`codex-stats` is a local-first CLI and Codex plugin that renders a GitHub-style activity heatmap from Codex session logs.

It reads `~/.codex/sessions`, aggregates token activity by local day, and prints a compact terminal dashboard with model, streak, session, and token summaries.

```text
       Nov  Dec Jan  Feb Mar Apr
        ················▒░·····▓░█
Mon     ···················▒··▒░·▓
        ··················░▓··▒█·█
Wed     ·················░·░··▓▒▓█
        ···················▒··░·▓▒
Fri    ················░···▒··▓··
       ················░······█▒█
       Less ░ ▒ ▓ █ More
       [All time] · Last 7 days · Last 30 days
Favorite model: gpt-5.4           Total tokens: 12.4m
Sessions: 42                      Longest session: 3h 18m
Active days: 18/183               Longest streak: 6 days
Most active day: Apr 12           Current streak: 3 days
```

## Features

- Local-only analysis of Codex JSONL session logs
- GitHub-style daily activity heatmap
- All-time, 7-day, and 30-day ranges
- Favorite-model and model-breakdown views
- Active-day, streak, session-count, and longest-session stats
- ANSI color themes plus mono and ASCII output modes
- Codex plugin skill entrypoint via `$codex-stats:stats`

## Use In Codex

To add this repository as a Codex plugin marketplace:

```bash
codex plugin marketplace add crazytan/codex-stats
```

Then open the plugin directory and install `Codex Stats`:

```text
/plugins
```

Restart Codex after installation, then call the plugin with:

```text
$codex-stats:stats
```

The reliable Codex entrypoint today is the skill invocation `$codex-stats:stats`. The `commands/` files are included as experimental slash-command definitions, but local plugin slash-command discovery does not currently appear to be exposed by Codex.

## Manual CLI

You can also run the dashboard without installing the Codex plugin. Clone the repository and use Node.js 20 or newer:

```bash
git clone https://github.com/crazytan/codex-stats.git
cd codex-stats
npm test
node ./scripts/codex-stats.mjs
```

Useful CLI examples:

```bash
node ./scripts/codex-stats.mjs
node ./scripts/codex-stats.mjs --compact --theme mono
node ./scripts/codex-stats.mjs --range 7d
node ./scripts/codex-stats.mjs --range 30d
node ./scripts/codex-stats.mjs --models
node ./scripts/codex-stats.mjs --json
node ./scripts/codex-stats.mjs --theme mono
node ./scripts/codex-stats.mjs --theme blue
node ./scripts/codex-stats.mjs --theme ember
node ./scripts/codex-stats.mjs --ascii
node ./scripts/codex-stats.mjs --root ~/.codex
```

For local plugin development, install or refresh this checkout directly:

```bash
npm run install:local
```

The local development installer symlinks this checkout to `~/plugins/codex-stats`, updates `~/.agents/plugins/marketplace.json`, and clears the local Codex plugin cache for `codex-stats`.

## Activity Metric

`codex-stats` builds its heatmap from cumulative token snapshots in local Codex session logs.

The current implementation:

- Walks every `*.jsonl` file under `~/.codex/sessions`.
- Reads `event_msg` records whose payload type is `token_count`.
- Uses `payload.info.total_token_usage.input_tokens + payload.info.total_token_usage.output_tokens` as the cumulative session total at that point in time.
- Computes the delta from the previous token snapshot in the same session file.
- Adds positive deltas to the local calendar day of the snapshot timestamp.
- Treats a lower-than-previous snapshot as a reset and counts the new snapshot value from zero.

The heatmap buckets are computed from the visible date range only. Days with no counted tokens use the empty glyph. Nonzero days are split into four intensity levels using the 25th, 50th, and 75th percentiles of nonzero daily totals in the selected window.

Other dashboard numbers use the same parsed session files:

- `Total tokens` is the sum of counted daily deltas in the selected window.
- `Active days` counts days in the selected window with a nonzero total.
- `Longest streak` and `Current streak` are based on consecutive active days.
- `Sessions` counts session files whose observed time span overlaps the selected window.
- `Longest session` is the largest gap between the first and last timestamp seen in a session file.
- `Favorite model` sums each visible session's final cumulative token snapshot by its most recently observed model name.

Cached input tokens and reasoning output tokens are not included in the heatmap intensity today. The output is meant to be a local activity dashboard, not an official billing, quota, or product analytics report.

## Plugin Shape

This repository includes:

- `.codex-plugin/plugin.json`
- `.agents/plugins/marketplace.json`
- `agents/openai.yaml`
- `skills/stats/SKILL.md`
- `commands/stats.md`
- `commands/models.md`
- `scripts/codex-stats.mjs`
- `scripts/install-local-plugin.mjs`

## Development

Run tests:

```bash
npm test
```

Run against a fixture or alternate Codex home:

```bash
node ./scripts/codex-stats.mjs --root /path/to/.codex --json
```

## Privacy

`codex-stats` reads local files under `~/.codex/sessions` and prints aggregate statistics. It does not send session data over the network.

## License

MIT
