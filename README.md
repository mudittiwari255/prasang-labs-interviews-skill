# Interviews by PrasangLabs: room skill

A skill that helps an AI assistant build an interview room for [Interviews by PrasangLabs](https://interviews.prasanglabs.com):
the problem, the candidate's starting files, hidden checks and the judge's skills. It validates everything, tries the checks on
the starting files and writes one `room.zip`. Upload it in **Rooms, Create from a room package**; every tab fills in as a
draft you review before publishing.

## Install

Claude Code:

```
claude plugin marketplace add mudittiwari255/prasang-labs-interviews-skill
claude plugin install interview-room@prasang-labs-interviews-skill
```

Then ask: "Use the interview-room skill to build a 60 minute debugging room for a backend engineer on our stack."

Other assistants that read `SKILL.md` folders (for example with `npx skills add mudittiwari255/prasang-labs-interviews-skill`), or any
assistant you can give files to: use `plugins/interview-room/skills/interview-room/`. `validate.mjs` needs Node 22 or newer
and no packages.

## What is in it

- `SKILL.md`: how to design and build a room.
- `reference.md`: every `room.json` field and check type.
- `validate.mjs`: checks the room, tries the checks, writes `room.zip`.
- `run-checks.mjs`: the same check runner the platform's sandbox uses.

This repository is generated from the product repository; changes made here are overwritten.
