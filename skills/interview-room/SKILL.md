---
name: interview-room
description: Build an interview room for Interviews by PrasangLabs as one zip (room.json, starting files, hidden answer files), validated and ready to upload. Use when someone wants to create, draft or design an interview room, a hiring exercise, a take-home problem or hidden checks for Interviews by PrasangLabs.
---

# Build an interview room

An interview room is a realistic piece of work a candidate does in about an hour, with an AI assistant at hand: a broken
codebase to debug, an incident to investigate, data to analyse, a product decision to make. The platform gives the candidate
an editor, a terminal and an AI assistant on the starting files. When they submit, hidden checks run on their work and an AI
judge scores them against the room's skills and answer key.

You produce one folder and turn it into `room.zip`. The person uploads it in **Rooms, Create from a room package**. Every
field fills in as a draft they can review, change, try and publish. Nothing goes live without them.

## The folder

```
my-room/
  room.json      everything the room's editor holds (see reference.md)
  files/         the candidate's starting files: code, data, logs, docs
  hidden/        optional: answer files only the checks read (never shown to the candidate)
```

## Steps

1. **Ask before you build.** Ask one question at a time, and stop when you know enough:
   - Which role and level is this for, and what should a strong hire be able to do in the first month?
   - What stack does the team use (languages, frameworks, databases, tools)? Offer to read their repository for this.
   - What kind of problem: a bug in a service, an incident with logs and metrics, a data question, a design or product decision?
   - How long (30 to 180 minutes; 60 is usual)?
   Never copy the company's real code, secrets, customer data or personal data into the room. Write new code in their style.

2. **Design the problem on paper first.** Write the answer key (`brief`) before any file: what is really wrong or true, what
   a strong candidate finds and does, the traps, and what a weak candidate does instead. A good room:
   - has one real root cause (or one right answer) plus a red herring or two;
   - is solvable in the time with an AI assistant, and still rewards judgement: reading logs, checking numbers, testing a
     fix, and noticing when the AI is wrong;
   - asks for a short write-up (`WRITEUP.md` by default) so the judge can see the reasoning.

3. **Build `files/`.** Small and runnable: a README, the code, a few tests, realistic data and logs. Plain dependencies only:
   the room has **no internet**, so nothing can be installed during the interview. The room image has Node 22, Python 3.11
   with pandas, NumPy and scikit-learn, sqlite3, git and common Unix tools. Do not add `.git`, `node_modules` or secrets.
   Keep it under 25 MB zipped. Put the problem text in `problem` (it becomes `PROBLEM.md`) rather than in a file.

4. **Write the checks.** Checks are facts for the report, not the whole score: did the fix land, do the tests pass, does the
   output match the hidden answer. Use the types in reference.md. On the **starting files most checks should fail**; if they
   all pass, the candidate has nothing to do. Put answer files the checks compare against in `hidden/`.

5. **Write the judge.** 3 to 10 skills, each with what to look for and a weight from 1 to 3. Skills describe behaviour
   ("Finds the root cause from evidence before changing code"), not trivia.

6. **Validate and pack.** Run, from this skill's folder:
   ```
   node validate.mjs <path-to-my-room> --zip <path-to-my-room>/../room.zip
   ```
   It checks room.json against the platform's rules, runs the checks on the starting files (in your own machine, with your
   tools; the platform's sandbox has no network), and writes the zip only when there are no errors. Fix every error and run
   it again. Read the warnings and fix the ones that matter.

7. **Hand over.** Tell the person where `room.zip` is and how to upload it: Rooms, Create from a room package. Then they
   should read every tab, press "Try the checks" and "Try it as a candidate" before publishing. Summarise the answer key and
   the checks for them in a few lines.

## Rules

- Never invent facts about the company. Ask, or leave it generic.
- No real people, customers or personal data in the files. Use made-up names and data.
- The answer key and `hidden/` must never be copied into `files/`, `problem` or `resources`.
- A custom check `script` is reviewed by the platform team before it can run; prefer the built-in check types.
