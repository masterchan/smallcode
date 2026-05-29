# Polyglot-Mini Benchmark Results

19 short coding tasks across 6 languages. Each task runs in an isolated temp
workspace — no shared state, no internet, no installed toolchain required for
the verify step (all checks are file-content based).

## Latest results

| Model | Pass rate | Mean time/task | Date | Notes |
|---|---|---|---|---|
| huihui-gemma-4-e4b-it-abliterated (8B) | **16/19 (84%)** | 24.2s | 2026-05-29 | gemma run |
| lfm2.5-8b-a1b-apex (8B / A1B MoE)      | **9/19 (47%)**   | 20.0s | 2026-05-29 | with Liquid AI parser |
| lfm2.5-8b-a1b-apex (8B / A1B MoE)      | 1/19 (5%)        | 41.5s | 2026-05-29 | before parser fix |
| huihui-gemma-4-e4b-it-abliterated (8B) | 19/19 (100%)     | 11.3s | 2026-05-21 | original baseline |

The earlier 19/19 gemma run is preserved for historical reference. The
2026-05-29 re-run was performed back-to-back with the lfm2.5 runs on the
same LM Studio host so the two columns are directly comparable.

## Per-language breakdown — 2026-05-29

| Language   | Tasks | gemma 4 e4b | lfm2.5 (post-fix) | lfm2.5 (pre-fix) |
|---         |---    |---          |---                |---               |
| Python     | 5     | 5/5         | 3/5               | 0/5              |
| JavaScript | 4     | 3/4         | 1/4               | 1/4              |
| TypeScript | 3     | 3/3         | 2/3               | 0/3              |
| Shell      | 3     | 2/3         | 0/3               | 0/3              |
| Markdown   | 2     | 2/2         | 2/2               | 0/2              |
| JSON       | 2     | 1/2         | 1/2               | 0/2              |

## Why lfm2.5-8b-a1b-apex was failing — investigation

The original 1/19 result was caused by a **tool-call format mismatch**, not
model quality. Three issues compound:

### 1. Liquid AI's tool-call template (root cause, fixed)

`lfm2.5-8b-a1b-apex` emits tool calls using Python keyword-arg syntax
wrapped in markers that LM Studio passes through to `message.content`
verbatim because it does not have a parser for Liquid's chat template:

```
<|tool_call_start|>[write_file(path='hello.py', content='def greet(name):\n    return f"Hello, {name}!"')]<|tool_call_end|>
```

SmallCode's existing `tool_call_extractor` only knew about
`<tool_call>{json}</tool_call>`, fenced-JSON, and bare-leading-JSON
formats. None matched, so 17 of 19 tasks recorded zero tool calls.

**Fix:** Added `src/tools/liquid_tool_parser.js` — a Python-literal-aware
parser that handles single/double-quoted strings, escape sequences
(`\n`, `\t`, `\\`, `\'`), numbers, booleans (`True`/`False`/`None`),
nested lists, and dicts. Wired into `tool_call_extractor.js` as the
highest-priority recovery path.

### 2. Empty `content`, populated `reasoning_content` (partially fixed)

LM Studio surfaces lfm2.5's chain-of-thought as a separate
`reasoning_content` field on the response. When the model's
`max_tokens` budget is exhausted by reasoning, `content` arrives empty
even though the model intended to call a tool.

**Fix:** When `message.content` is empty, the extractor now also scans
`message.reasoning_content` for Liquid-format tool calls. This recovers
the cases where the call landed in reasoning instead of content.

### 3. `finish_reason='length'` truncation (not yet fixed)

The model frequently spends 200-2400 reasoning tokens on a single turn,
and the first call in a multi-turn task often returns
`finish_reason='length'` with empty content. SmallCode's quality monitor
warns (`empty_response`) but doesn't retry with a higher cap or with
thinking disabled.

This is the dominant remaining failure mode. About half of the post-fix
failures show this pattern: the model's first 1-2 calls hit `length`,
then it produces a successful Liquid call, but by then the agent loop
has already been derailed (sometimes infinitely loops on `bash` heredoc
calls that fail on Windows with exit code 9009).

A follow-up fix would catch `finish_reason='length' && content=='' && tool_calls.length===0`
in the agent loop and either retry with `enable_thinking=false` or with
a doubled `max_tokens`. Not implemented in this pass to keep the change
scoped.

## Per-task — 2026-05-29 (post-fix vs gemma)

| Task              | gemma 4 e4b      | lfm2.5 post-fix    |
|---                |---               |---                 |
| py-fibonacci      | ✅ 20.9s · 2t    | ✅ 9.1s · 2t       |
| py-class-account  | ✅ 205.2s · 22t  | ❌ 9.8s · 2t       |
| py-fix-list       | ✅ 15.2s · 4t    | ❌ 3.9s · 0t       |
| py-add-test       | ✅ 8.9s · 3t     | ✅ 10.2s · 2t      |
| js-double         | ✅ 4.9s · 2t     | ✅ 6.5s · 2t       |
| js-arrow          | ✅ 13.2s · 3t    | ❌ 6.2s · 1t       |
| js-package        | ✅ 13.6s · 4t    | ❌ 11.4s · 0t      |
| js-fix-async      | ❌ 10.3s · 2t    | ❌ 167.5s · 0t     |
| ts-interface      | ✅ 3.7s · 1t     | ✅ 4.6s · 1t       |
| ts-generic        | ✅ 8.4s · 2t     | ❌ 6.5s · 2t       |
| ts-tsconfig       | ✅ 3.9s · 1t     | ✅ 4.9s · 1t       |
| sh-list           | ✅ 10.3s · 2t    | ❌ 78.7s · 0t      |
| sh-makefile       | ❌ 49.9s · 12t   | ❌ 12.4s · 0t      |
| sh-script         | ✅ 52.1s · 10t   | ❌ 11.4s · 1t      |
| md-readme         | ✅ 11.9s · 2t    | ✅ 7.6s · 1t       |
| md-api            | ✅ 9.8s · 1t     | ✅ 6.6s · 1t       |
| json-config       | ✅ 3.7s · 1t     | ✅ 5.7s · 1t       |
| json-fix          | ❌ 4.2s · 2t     | ❌ 7.3s · 1t       |
| multi-imports     | ✅ 9.5s · 2t     | ✅ 10.1s · 2t      |

## Setup

Requires a running OpenAI-compatible endpoint. Set `SMALLCODE_BASE_URL` and
`SMALLCODE_MODEL` in `.env`, then:

```bash
npm run bench:polyglot
# or compare two models directly:
node bench/harness.js --suite polyglot-mini --model lfm2.5-8b-a1b-apex --base-url http://10.0.0.20:1234/v1
node bench/harness.js --suite polyglot-mini --model huihui-gemma-4-e4b-it-abliterated --base-url http://10.0.0.20:1234/v1
```

Results are saved to `.smallcode/benchmarks/<run-id>.json`.

## Notes

- Run on Windows with LM Studio serving the model locally at `10.0.0.20:1234`
- Timeout per task: 240s
- lfm2.5-8b-a1b-apex is an A1B MoE — 1B active parameters per token out
  of an 8B total, served as an apex-quality quant. The 1B active count
  (not the quantisation) is the architectural constraint here. It splits
  reasoning and visible output into separate `reasoning_content` and
  `content` fields, which makes it sensitive to `max_tokens` budgets and
  to harnesses that don't recognise Liquid AI's Python-kwarg tool-call
  syntax.
