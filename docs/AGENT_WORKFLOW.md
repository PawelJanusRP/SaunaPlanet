# Agent Workflow

This document describes how AI coding agents should work on SaunaPlanet.

---

# General Rule

Do not commit directly to main.

Always work on a dedicated feature branch.

---

# Branch Naming

Use clear feature branch names.

Examples:

feature/authentication

feature/admin-panel

feature/roles-permissions

feature/bookings

feature/payments

feature/calendar

feature/master-verification

feature/satellite-improvements

feature/private-saunas

---

# Before Starting Work

Before making changes:

1. Read CLAUDE.md.
2. Read docs/ARCHITECTURE.md.
3. Read docs/DATABASE.md.
4. Read docs/BACKLOG.md.
5. Read docs/KNOWN_ISSUES.md.
6. Inspect the existing codebase.
7. Identify files that are likely to be affected.

---

# Working Rules

1. Prefer small, focused changes.

2. Do not redesign working features without explicit request.

3. Do not remove existing functionality.

4. Do not introduce large architectural changes unless necessary.

5. Reuse existing components and patterns.

6. Preserve database compatibility.

7. Avoid destructive migrations.

---

# Database Changes

If database changes are needed:

1. Create a migration.
2. Explain why the migration is needed.
3. Preserve existing data.
4. Prefer additive changes:

   * ADD TABLE
   * ADD COLUMN
   * ADD INDEX

Avoid:

* DROP TABLE
* DROP COLUMN
* renaming major entities

unless explicitly approved.

---

# Testing Before Commit

Before committing, run:

npm run lint

npm run build

If tests exist, also run:

npm test

If a command fails:

1. Stop.
2. Report the error.
3. Explain what was changed.
4. Suggest a fix.

---

# Commit Rules

Use clear commit messages.

Examples:

Add authentication scaffolding

Add admin panel route

Improve sauna master satellite popup

Fix past events filtering on sauna detail page

Add booking database schema

---

# Pull Request Summary

Every completed task should include a short summary:

## Summary

* What was changed
* Which files were modified
* Why the change was made

## Verification

* npm run lint
* npm run build
* manual checks

## Notes

* risks
* limitations
* next steps

---

# Protected Features

Be careful with these areas:

* map clustering
* event marker highlighting
* sauna master satellites
* sauna detail page
* sauna master profile page
* Supabase RPC functions
* PTS import scripts

These features have already required debugging and should not be rewritten casually.

---

# Parallel Work Strategy

Multiple agents may work on separate branches.

Recommended parallel branches:

feature/authentication

feature/admin-panel

feature/roles-permissions

feature/bookings

feature/payments

feature/calendar

feature/master-verification

Each branch should focus on one responsibility.

Avoid mixing unrelated changes in one branch.

---

# Conflict Avoidance

To reduce merge conflicts:

1. Avoid formatting unrelated files.
2. Avoid renaming files unless necessary.
3. Avoid moving components unless requested.
4. Keep changes limited to the task.
5. Document any shared files modified.

---

# Reporting Format

At the end of work, report:

1. Branch name
2. Files changed
3. Commands executed
4. Errors encountered
5. Manual verification
6. Recommended next step

---

# Main Principle

The agent should behave like a careful maintainer, not like a prototype generator.

SaunaPlanet already has working functionality.

The goal is to extend the ecosystem without breaking the existing product.
