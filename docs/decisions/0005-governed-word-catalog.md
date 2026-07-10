# ADR 0005: Govern words as a canonical catalog with derived collections

- Status: Accepted
- Date: 2026-07-10

## Context

Hosts need curated word banks now, and future AI generation may propose more.
Copying word text into ad hoc arrays would create duplicates, inconsistent
difficulty labels, missing definitions, and no safe way to deactivate a bad
prompt everywhere. A production database and account system do not yet exist.

## Decision

`packages/word-bank` owns a storage-neutral word-catalog model and repository
port. Each word has a stable ID, locale-specific canonical term, definition,
difficulty, tags, provenance, lifecycle status, and version.

The **Master list** is derived from every active, eligible catalog word; it is
not a separately maintained copy. Custom collections reference stable word IDs
and may overlap. Removing membership changes only that collection. Deactivating
a word removes it from playable lists while retaining its identity and history.

Imports are validated as one atomic change. Duplicate normalized terms within
a locale, dangling memberships, invalid metadata, or reserved Master-list
mutations reject the entire import. Application adapters own storage. The first
admin console may use browser-local persistence and portable JSON exports; a
future authenticated adapter may use a durable database without changing game
rules or catalog semantics.

Definitions are editorial metadata. A drawer may report
`unknown-definition` during a draft, but definitions and live answers must not
be projected to guessers.

## Consequences

### Positive

- One correction or deactivation applies to every collection.
- Curated, imported, and future AI-proposed words cross the same validation.
- Stable IDs preserve match history even when display text or metadata changes.
- Local authoring can start without committing to a database or auth vendor.

### Negative

- The local console is not a production authorization boundary.
- Definitions and difficulty still require human editorial judgment.
- Durable multi-device editing waits for authenticated storage.

## Migration path

1. Author locally and export a versioned catalog snapshot.
2. Add an authenticated repository adapter when accounts/admin roles exist.
3. Import the same snapshot atomically and run repository contract tests against
   the new adapter.
4. Switch application configuration; do not rewrite game rules or collections.

## Compliance

- Catalog contract tests run against every repository adapter.
- The Master list is derived and cannot accept direct membership mutations.
- Game projections contain only the minimum prompt fields allowed for a role.
- AI output remains proposed content until deterministic validation and any
  required human review succeed.
