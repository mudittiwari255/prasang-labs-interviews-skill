# Interviews by PrasangLabs: room skill

A skill that helps an AI assistant build an interview room for [Interviews by PrasangLabs](https://interviews.prasanglabs.com):
the problem, the candidate's starting files, hidden checks and the judge's skills. It validates everything, tries the checks on
the starting files and writes one `room.zip`. Upload it in **Rooms, New room, With your AI assistant**; every tab fills in as a
draft you review before publishing.

It is a standard Agent Skill (a folder with `SKILL.md`), so it works in Claude Code, Codex, Cursor and other assistants that
read skills.

## Install for every assistant at once

```
npx skills add mudittiwari255/prasang-labs-interviews-skill
```

The [skills CLI](https://vercel.com/docs/agent-resources/skills) finds the assistants on your machine and asks where to
install. Add `-g` to install for your user instead of the current project.

## Or install for one assistant

Claude Code, as a plugin (updates with `claude plugin update`):

```
claude plugin marketplace add mudittiwari255/prasang-labs-interviews-skill
claude plugin install interview-room@prasang-labs-interviews-skill
```

Without Node packages, copy the folder into the assistant's skills folder:

```
git clone --depth 1 https://github.com/mudittiwari255/prasang-labs-interviews-skill /tmp/pl-skill
cp -R /tmp/pl-skill/skills/interview-room ~/.claude/skills/     # Claude Code
cp -R /tmp/pl-skill/skills/interview-room ~/.codex/skills/      # Codex
cp -R /tmp/pl-skill/skills/interview-room ~/.cursor/skills/     # Cursor
```

Create the folder first if it does not exist (`mkdir -p ~/.codex/skills`). Restart the assistant afterwards.
Any other assistant: give it `SKILL.md` and `reference.md` from `skills/interview-room/`.

Then ask: "Use the interview-room skill to build a 60 minute debugging room for a backend engineer on our stack."
`validate.mjs` needs Node 22 or newer and no packages.

## What is in it

- `SKILL.md`: how to design and build a room.
- `reference.md`: every `room.json` field and check type.
- `validate.mjs`: checks the room, tries the checks, writes `room.zip`.
- `run-checks.mjs`: the same check runner the platform's sandbox uses.

This repository is generated from the product repository; changes made here are overwritten.
