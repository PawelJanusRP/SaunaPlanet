# Data Imports

This document describes data import processes used by SaunaPlanet.

---

# Purpose

Imports allow SaunaPlanet to populate and enrich the database with sauna facilities and related information.

Goals:

* reduce manual data entry
* accelerate platform growth
* maintain data quality
* avoid duplicates

---

# PTS Import

Status: Implemented

Purpose:

Import sauna facilities from PTS sources.

Related scripts:

* seedSaunas.ts
* importPtsSaunas.ts

---

# Import Flow

Source Data
↓
Data Parsing
↓
Validation
↓
Coordinate Verification
↓
Duplicate Detection
↓
Database Insert
↓
Import Logging

---

# Validation Rules

Before insertion:

* sauna name must exist
* location should be valid
* coordinates should be available whenever possible

Invalid records should be logged and skipped.

---

# Coordinate Handling

Historical issue:

Some imported facilities lacked coordinates.

Current approach:

* skip invalid coordinates
* log skipped records

Future possibility:

* geocoding fallback

---

# Duplicate Detection

Purpose:

Prevent duplicate facilities.

Current strategy:

* compare imported facilities with existing records
* skip existing matches

Important:

Imports must not overwrite manually maintained records without explicit approval.

---

# Import Logging

Table:

pts_import_log

Purpose:

Track import activity and troubleshooting.

Typical information:

* source
* sauna name
* result
* timestamp

---

# Historical Issues

## RLS Blocking Imports

Observed error:

42501 permission denied

Cause:

Supabase Row Level Security restrictions.

Resolution:

Temporary development policies.

Future solution:

Authenticated service-based imports.

---

## Missing Coordinates

Some facilities could not be imported due to missing location data.

Resolution:

Skipped and logged.

---

## Duplicate Records

Multiple source records may describe the same facility.

Resolution:

Duplicate detection before insert.

---

## Script Runtime Errors

Historical examples:

* duplicate variable declarations
* undefined html object
* optional chaining issues

Future changes should preserve compatibility with existing import workflows.

---

# Photo Imports

Status: Partially Implemented

Purpose:

Automatically enrich facilities with images.

Goals:

* facility gallery population
* improved user experience

Important:

Image imports should avoid duplicates whenever possible.

---

# Future Import Sources

Potential future sources:

* sauna associations
* festival organizers
* public facility databases
* partner organizations

---

# International Expansion

Future imports should support:

* Germany
* Czech Republic
* Slovakia
* Finland
* Sweden
* Norway
* Estonia
* Latvia
* Lithuania

Design imports to be country-agnostic whenever practical.

---

# Import Safety Rules

1. Preserve existing data.
2. Avoid duplicates.
3. Log all operations.
4. Skip invalid records.
5. Avoid destructive updates.
6. Prefer additive imports.

---

# Future Improvements

Potential enhancements:

* geocoding services
* image enrichment
* scheduled imports
* import dashboard
* import statistics
* source quality scoring

---

# Guiding Principle

Fast growth is important.

Data quality is more important.

A smaller high-quality database is preferable to a larger inaccurate database.
