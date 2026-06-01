# Architecture Overview

One-page consolidation of the project's conventions and decisions. See
[CONTEXT.md](../CONTEXT.md) for the ubiquitous language, and the ADRs
([0001](adr/0001-sse-realtime-over-polling.md), [0002](adr/0002-pure-python-domain-engine.md))
for the reasoning behind the two load-bearing choices.

## What it is

A turn-based Battleship game (classic Hasbro ruleset: 10×10 board, fleet of 5, one shot
per turn, sink all 5 to win). Play vs a Hunt/Target AI or vs another human via a
single-use invite link. Server is authoritative and enforces fog-of-war: a client never
receives the opponent's ship positions.

## Stack

- **Backend:** Django 6.0 on Python 3.14, served over **ASGI** by uvicorn.
- **Package manager:** uv (`uv run <tool>`; see the `Makefile`).
- **DB:** PostgreSQL via `psycopg` (connection from env, local defaults baked in).
- **Realtime:** `django-eventstream` Server-Sent Events on pure ASGI — no Channels, no
  Redis (single process to start).
- **Front-end:** Vite + Tailwind + Flowbite + Alpine.js + HTMX, bridged by `django-vite`
  (HMR in dev, hashed manifest assets served by WhiteNoise in prod).
- **Quality:** ruff (lint + format), pyright (strict on `domain/`, standard elsewhere),
  pytest + pytest-django + model-bakery + Hypothesis; pre-commit + GitHub Actions CI.

## Layers

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Domain (pure Python) | `domain/` | Rules, placement validity, shot resolution, AI. No Django imports. pyright **strict**. |
| Mappers | `games/mappers.py` | ORM rows ↔ domain objects. |
| Services | `games/services.py` | Transactional orchestration: load → apply domain move → persist. Raises typed exceptions mapped to HTTP. |
| Events | `games/events.py` | SSE publish (empty ping on `game-<id>`). |
| Views/URLs | `games/`, `accounts/`, `config/` | HTTP, auth, fog-of-war rendering of per-user partials. |

The domain/Django split is **ADR 0002**: the logic-dense, bug-prone rules engine is
unit- and property-testable with no DB, no fixtures, no migrations. The ORM models
(`Game`/`Ship`/`Shot`) are a thin persistence layer; board state is *derived*, never
stored as a blob.

## Data model (summary)

- **`accounts.Player`** — O2O to the Django `User`, auto-created on user creation.
- **`games.Game`** — UUID PK (used as the invite link); owner + nullable opponent,
  `vs_ai`, status (`SETUP` → `ACTIVE` → `FINISHED`), outcome
  (completed / resigned / abandoned), turn, winner, ready flags, activity timestamps.
- **`games.Ship`** — game + side + kind + bow coords + orientation; unique per
  (game, side, kind).
- **`games.Shot`** — game + by_side + cell + turn_no + result; unique per
  (game, by_side, cell).

Enums (`ShipKind`, `Orientation`, `Side`, `GameStatus`, `Outcome`, `ShotOutcome`) live in
`domain/` and are mirrored as Django `TextChoices`.

## Realtime (ADR 0001)

Battleship only needs "it's your turn" within a second or two of the opponent's move.
SSE was chosen over HTMX polling (idle DB load, laggier) and WebSockets/Channels
(disproportionate infra). A resolved move publishes an **empty** event on channel
`game-<id>`; each player's open SSE stream triggers an HTMX refetch of **their own**
rendered partial — so the SSE payload carries no board data and fog-of-war holds.
The AI move is computed synchronously inside the human's shot request (no worker/Celery).
Lifecycle is server-driven; idle > 7 days reads as *abandoned* (computed on read, no cron).

## Testing & quality

- **Domain:** pytest + Hypothesis property tests, no DB (seeded `random.Random`).
- **Integration:** pytest-django + model-bakery for services/views (turn enforcement,
  win/resign outcomes, fog-of-war partials, SSE publish via mock).
- pyright **strict** over `domain/`, **standard** over the Django glue.
- ruff for lint and format; enforced by pre-commit and CI on every push.
