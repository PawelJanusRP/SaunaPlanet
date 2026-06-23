# Scripts Notes

This document contains important information about scripts, imports and historical implementation details.

---

# PTS Import

Purpose:

Import sauna facilities from PTS sources into SaunaPlanet.

Related scripts:

* seedSaunas.ts
* importPtsSaunas.ts

---

# Historical Issues

## Missing Coordinates

Some imported facilities did not contain valid coordinates.

Behavior:

* skipped
* logged

---

## Duplicate Detection

Multiple imports may contain already existing facilities.

Behavior:

* skip existing facilities
* avoid duplicates

---

## Supabase RLS

Historical issue:

Imports were blocked by RLS policies.

Observed error:

42501 permission denied

Resolution:

Temporary development policies enabled.

Future:

Replace with production-safe policies.

---

## Import Logging

Related table:

pts_import_log

Purpose:

Track import status and troubleshooting.

---

# Photo Import

Purpose:

Automatically import sauna photos.

Historical issues:

* duplicate variable declarations
* undefined html object
* optional chaining problems

Future modifications should preserve compatibility with existing imports.

---

# Event System

Implemented:

* event creation
* event listing
* upcoming event filtering

Known issue:

Past events may still appear on sauna detail pages.

Requires review.

---

# Sauna Master Satellites

Purpose:

Display assigned sauna masters around sauna markers.

Visibility requirements:

* approved assignment
* future event

Historical issue:

Not all assigned masters were visible.

Status:

Resolved.

Important:

Do not redesign without explicit request.

---

# Development Notes

When modifying import-related code:

1. Preserve duplicate detection.
2. Preserve logging.
3. Preserve manual sauna entries.
4. Preserve compatibility with existing database schema.

---

# Future Additions

This file should be updated whenever:

* a major script is created
* a migration is added
* an import process changes
* a significant production issue is resolved
