# room.json reference

One JSON object. Unknown fields are ignored. Text fields are plain text unless they say Markdown.

| Field | Required | What it is |
|---|---|---|
| `name` | yes | Room name, up to 80 characters. |
| `role` | yes | Who it is for, like "Backend engineer" or "Data scientist". |
| `domain` | no | Area, like "Payments". |
| `minutes` | no | 10 to 180. Default 60. |
| `summary` | yes | One or two sentences for recruiters and the room header (600 characters). |
| `candidateBrief` | no | Short brief on the candidate's start page (1,200 characters). |
| `problem` | yes | Markdown. Becomes `PROBLEM.md` in the workspace (20,000 characters). |
| `resources` | no | Markdown. Becomes `RESOURCES.md`: where the logs, data and docs are, how to run things. |
| `deliverables` | no | Up to 10 short lines: what to hand in. |
| `handy` | no | One line of handy commands, like `npm test, npm run dev, logs/`. |
| `checkStep` | no | One or two sentences on how the candidate can check their own work. |
| `writeup` | no | The write-up file the candidate hands in, a `.md` name. Default `WRITEUP.md`. |
| `tools` | no | AI assistants the candidate may pick, any of `claude`, `opencode`, `vscode`, `chat`. Empty means all. |
| `tokenBudget` | no | AI tokens per candidate, 20,000 to 5,000,000. Leave out for the platform default. |
| `brief` | yes | The answer key for the judge, never shown to the candidate (8,000 characters). |
| `rubric` | yes | 3 to 10 skills: `{ "name", "look", "weight" }`, weight 1 to 3, names all different. |
| `checks` | no | Up to 30 hidden checks (below). |
| `script` | no | A custom check script (JavaScript for Node 22). Needs review by the platform team before it runs. |

## Checks

Every check has `type`, `name` and an optional `weight` (1 to 3). Paths are inside the candidate's workspace, like
`deliverables/answer.csv`; `truth` is a file in `hidden/`. Patterns are regular expressions, case-insensitive.
File checks run first, on what the candidate handed in; then commands run.

| `type` | Fields | Passes when |
|---|---|---|
| `file_exists` | `path` | The file exists. |
| `file_min_length` | `path`, `min` | The file has at least `min` characters. |
| `file_matches` | `path`, `pattern` | The file contains the pattern. |
| `file_not_matches` | `path`, `pattern` | The file does not contain it. |
| `json_field` | `path`, `field` (a.b.c), `equals` or `min`/`max` | The JSON value equals, or is in the range. |
| `sqlite_query` | `path`, `query` (one SELECT), `equals` or `min`/`max` | The first value of the first row equals, or is in the range. The database is opened read-only. |
| `command` | `run`, optional `outputMatches`, `expectExit` (default 0), `timeout` (seconds, up to 300) | The command exits as expected (and prints the pattern). |
| `test_count` | optional `run` (default `node --test`), `min`, `allowFailing`, `timeout` | At least `min` tests pass and none fail. Reads `node --test`, `python3 -m unittest`, and "N passed / N failed" output. |
| `csv_compare` | `path`, `truth`, optional `key` (default `id`), `minPrecision`, `minRecall` (default 0.9) | The candidate's CSV rows (by `key`) match the hidden CSV. |

Commands run in a sandbox with no network, as a normal user, with 1 CPU and limited memory.

## Example

```json
{
  "name": "Invoices off by one cent",
  "role": "Backend engineer",
  "domain": "Billing",
  "minutes": 60,
  "summary": "Some invoices total one cent more than their lines. Find out why, fix it and list the affected invoices.",
  "problem": "# Invoices are off\n\nSupport says some customers were charged one cent too much...",
  "resources": "- `src/` the billing service\n- `data/invoices.db` last month's invoices\n- `logs/app.log`",
  "deliverables": ["Fix the bug with a test", "deliverables/affected.csv with the affected invoice ids", "WRITEUP.md"],
  "handy": "npm test, sqlite3 data/invoices.db",
  "tools": ["claude", "opencode", "vscode", "chat"],
  "brief": "Rounding happens per line with Math.round on floats... A strong candidate reproduces it with a test first...",
  "rubric": [
    { "name": "Debugging", "look": "Finds the root cause from evidence before changing code.", "weight": 3 },
    { "name": "Verification", "look": "Proves the fix with a test and checks the AI's claims.", "weight": 2 },
    { "name": "Communication", "look": "The write-up is short, accurate and honest about confidence.", "weight": 1 }
  ],
  "checks": [
    { "type": "test_count", "name": "Tests pass", "min": 5, "weight": 2 },
    { "type": "csv_compare", "name": "Affected invoices found", "path": "deliverables/affected.csv", "truth": "affected.csv", "key": "invoice_id", "weight": 3 },
    { "type": "file_min_length", "name": "Write-up written", "path": "WRITEUP.md", "min": 300 }
  ]
}
```
