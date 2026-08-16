# Kobo Webhook Processing – Architecture & Function Documentation

This document explains how KoboToolbox submissions are received via webhook, processed, and synchronized into Supabase. It describes the purpose and behavior of each major function in the codebase.

---

# High-Level Flow

1. KoboToolbox sends a webhook with submission payload
2. `functions/kobo-fetch/index.ts` receives the HTTP request
3. Raw payload stored in `kobo_raw_submissions`
4. `functions/_shared/processSubmission()` transforms + resolves references
5. ECDC / practitioner / training records synced
6. Visit and attachment-reference records upserted
7. Processing status written to `kobo_processed`

---

# File Overview

## kobo-fetch/index.ts

Webhook entrypoint. Receives payload and orchestrates processing.

## _shared/process-payload.ts

Core transformation and synchronization logic.

## _shared/supabase-client.ts

Initializes Supabase admin client.

## _shared/types.ts

Shared TypeScript types for processing results.

---

# Webhook Entrypoint

## kobo-fetch/index.ts

This file exposes a Deno HTTP server that KoboToolbox calls via webhook.

### Responsibilities

* Parse incoming JSON payload
* Extract Kobo instance ID
* Prevent duplicate processing
* Store raw payload
* Call `processSubmission()`
* Record processing status
* Return HTTP response

### Flow

1. Extract instance ID
2. Check `kobo_processed` table for duplicates
3. Store payload in `kobo_raw_submissions`
4. Call `processSubmission(instanceId, payload)`
5. Save status using `markProcessed()`
6. Return success/partial/failed

---

# Core Processing

## processSubmission()

This is the main orchestration function. It:

* Resolves lookup labels
* Syncs ECDC records
* Syncs practitioners
* Syncs training data
* Builds visit record
* Inserts outreach visit
* Returns processing status

### Step-by-step

### 1. Determine outreach type

Used to decide which workflow to run:

* Mapping workflows (create/update practitioner + ECDC)
* Lookup-only workflows (link existing practitioner only)

### 2. Resolve shared lookups (parallel)

These values are resolved using label tables:

* Data capturer
* Group
* Transport type
* Outreach type
* Yes/no labels

This is done using `Promise.all()` for performance.

### 3. Workflow branching

#### Mapping outreach types

Runs:

* `handleEcdcSync()`
* `handlePractitionerSync()`
* `handleTrainingSync()`

Used for mapping visits where new facilities/practitioners may be created.

#### Lookup-only outreach types

Runs:

* `lookupPractitionerOnly()`

Used for support visits where practitioner should already exist.

### 4. Numeric coercion

Fields converted safely:

* transport_cost
* km_logged
* counts (parents, books, etc)

Invalid or negative values become `null`.

### 5. Visit record creation

A normalized visit record is built and inserted into:

`outreach_visits`

In addition to the operational outreach fields, the normalized visit retains:

* Kobo capture start/end timestamps
* Public-transport accessibility
* The explicit BookDash yes/no response
* Captured latitude, longitude, altitude, and accuracy

Kobo delivery metadata (`_id`, `_uuid`, submission time/user/status,
validation status, tags, notes, geolocation, form UUID, and instance ID) is
normalized on `kobo_raw_submissions`, where it belongs with the source receipt.

An image filename creates or updates an `outreach_attachments` row linked to
the visit. It starts with `transfer_status = 'pending'`. A separate
authenticated worker must download the binary from Kobo and populate the
storage provenance fields; ingestion does not claim that the file has already
been transferred.

### 6. Return status

Returns:

* success (no warnings)
* partial (warnings present)
* failed (insert failure)

---

# Label Lookup Helpers

## getLabel(list, value)

Looks up Kobo coded values and returns human-readable label.

Example:

```
"yes" -> "Yes"
"group_a" -> "Group A"
```

If not found, returns original value.

---

## parseMultiSelect()

Converts Kobo multi-select string into array.

Example:

```
"smartstart firstaid"
```

becomes:

```
["smartstart", "firstaid"]
```

---

# Numeric Helpers

## safeInt()

Safely converts value to integer.

Returns:

* integer
* null if invalid

Prevents database errors.

---

## safeFloat()

Safely converts value to float.

Returns null if invalid.

---

## safePositiveNumeric()

Ensures numeric value is:

* valid number
* > = 0

If negative:

* warning added
* value stored as null

Prevents DB constraint violations.

---

# Reference Resolution

## resolveDataCapturer()

Maps Kobo staff code to Supabase `layita_staff.id`

Steps:

1. Lookup label
2. Match by name
3. Return staff ID
4. Warn if not found

---

## resolveGroup()

Maps Kobo group selection to `groups.id`

Uses label lookup + name matching.

---

# ECDC Sync

## handleEcdcSync()

Creates or updates an ECDC record.

### Behavior

1. Determine ECDC name
2. Lookup existing record
3. Build update payload
4. Parse GPS coordinates
5. Update if exists
6. Insert if new

### Fields synced

* name
* area
* number_children
* chief
* headman
* dsd_registered
* dsd_funded
* latitude
* longitude

Returns ECDC ID.

---

# Practitioner Sync

## handlePractitionerSync()

Creates or updates practitioner.

### Steps

1. Determine practitioner name
2. Check for similar names
3. Lookup exact match
4. Build practitioner data
5. Update if exists
6. Insert if new

### Fields synced

* name
* phone numbers
* WhatsApp flag
* DSD status
* group
* ECDC link

### Duplicate protection

Uses `find_similar_practitioners` RPC.

If similar names exist:

* warning added
* record still created

Returns practitioner ID.

---

# Training Sync

## handleTrainingSync()

Creates or updates practitioner training record.

### Input

Kobo multi-select training list.

### Output

Boolean flags:

* smart_start_ever
* first_aid_ever
* level4_ever
* level5_ever
* wordworks03_ever
* wordworks35_ever
* littlestars_ever

### Behavior

* Updates if record exists
* Inserts if new

Primary key = practitioner ID.

---

# Lookup-only Practitioner Resolution

## lookupPractitionerOnly()

Used for support visits.

Does NOT create practitioners.

### Resolution order

1. Match by UUID
2. Match by name (fallback)
3. Find similar names
4. Log unmatched

If unresolved:

* warning added
* record logged to `kobo_unmatched`

Returns practitioner ID or null.

---

# Unmatched Logging

## logUnmatched()

Writes unresolved references to:

`kobo_unmatched`

Fields:

* instance_id
* field
* raw_value

Used for admin cleanup.

---

# Processing Status

## markProcessed()

Records final processing state in:

`kobo_processed`

Fields:

* instance_id
* status
* error_message
* warnings
* processed_at

Used for:

* deduplication
* debugging
* monitoring

---

# Supabase Client

## supabase-client.ts

Creates admin Supabase client using:

* SUPABASE_URL
* SUPABASE_SERVICE_ROLE_KEY

This client bypasses RLS and allows server-side writes.

---

# Types

## ProcessingStatus

Possible values:

* success
* partial
* failed

---

## ProcessingResult

Returned by `processSubmission()`:

* status
* visitId
* warnings
* error

---

## KoboPayload

Flexible type allowing arbitrary Kobo fields.

Includes:

* outreach_date
* outreach_type
* data_capturer
* etc

Plus dynamic keys.

---

# Database Tables Used

## Input logging

* kobo_raw_submissions
* kobo_processed
* kobo_unmatched

## Core data

* outreach_visits
* outreach_attachments
* practitioners
* ecdc_list
* training

## Lookups

* kobo_label
* groups
* layita_staff

---

# Error Handling Strategy

The pipeline never fails unless visit insert fails.

Instead:

* warnings collected
* partial status returned
* unresolved values logged

This ensures data is not lost.

---

# Idempotency

Duplicate Kobo submissions prevented by:

`kobo_processed.instance_id`

If already success:

Webhook returns early.

---

# Summary

This pipeline:

* Receives Kobo webhook
* Logs raw payload
* Resolves references
* Syncs ECDC
* Syncs practitioner
* Syncs training
* Creates visit record
* Logs warnings
* Marks processed

Designed to be:

* Idempotent
* Fault tolerant
* Non-blocking
* Admin-review friendly
