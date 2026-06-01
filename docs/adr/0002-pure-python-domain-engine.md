# 0002 — Pure-Python rules engine, decoupled from the Django ORM

- Status: Accepted
- Date: 2026-06-01

## Context

The game rules (placement validity, shot resolution, sunk/win detection) and the
Hunt/Target AI are the most logic-dense, bug-prone part of the system, and the part we
most want to test exhaustively (including with Hypothesis property tests). The idiomatic
Django approach would put this behaviour on the `Game`/`Ship`/`Shot` models ("fat models"),
which couples every rules test to a database and migrations.

## Decision

Implement the rules engine and AI as a **Django-free `domain/` package** built from plain
dataclasses and functions. The ORM models (`Game`/`Ship`/`Shot`) are a **thin persistence
layer** that maps to/from domain objects. Views load ORM rows → build domain objects →
apply a move → persist the result.

`pyright` runs in **`strict`** mode over `domain/` (frictionless without Django's dynamic
typing) and `standard` mode over the Django glue.

## Consequences

- Rules and AI are unit-/property-testable with **no DB, no fixtures, no migrations** — fast
  and deterministic (seeded RNG).
- Clear boundary: domain knows nothing about HTTP, ORM, or SSE.
- **Cost:** an explicit mapping layer between ORM rows and domain objects (boilerplate the
  fat-model approach avoids), and a discipline to keep Django imports out of `domain/`.
- Diverges from common Django idiom; contributors must understand the split.

## Alternatives considered

- **Fat models** — behaviour on the ORM models. Less boilerplate and very Django-idiomatic,
  but every rules test needs the DB and the strict-typing story is worse. Rejected for a
  logic-heavy core we want to test in isolation.
