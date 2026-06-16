# SaunaPlanet Setup

This document describes how to run SaunaPlanet locally.

---

# Requirements

Required tools:

* Node.js
* npm
* Git
* Supabase project access

Recommended:

* VS Code
* Claude Code
* GitHub CLI

---

# Repository

Clone repository:

```bash
git clone https://github.com/PawelJanusRP/SaunaPlanet.git
cd SaunaPlanet
```

---

# Install Dependencies

```bash
npm install
```

---

# Environment Variables

Create local environment file:

```bash
.env.local
```

Required variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Optional future variables:

```env
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

Never commit `.env.local`.

---

# Run Development Server

Preferred command:

```bash
npm run dev
```

If Turbopack causes excessive Node.js processes or instability on Windows, use:

```bash
npx next dev --webpack
```

---

# Build

```bash
npm run build
```

---

# Lint

```bash
npm run lint
```

---

# Supabase

The project uses Supabase PostgreSQL with PostGIS.

Main database objects are described in:

```text
docs/DATABASE.md
```

---

# Common Issues

## Too many Node.js processes on Windows

Use:

```bash
npx next dev --webpack
```

instead of the default Turbopack dev server.

---

## Missing Supabase Variables

If the application cannot connect to Supabase, check:

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

# Before Development

Before starting work, read:

* CLAUDE.md
* docs/ARCHITECTURE.md
* docs/DATABASE.md
* docs/BACKLOG.md
* docs/KNOWN_ISSUES.md
* docs/AGENT_WORKFLOW.md

---

# Recommended Workflow

1. Create a feature branch.
2. Make focused changes.
3. Run lint.
4. Run build.
5. Commit changes.
6. Open pull request.
