# Battleship — Agent Guide

Turn-based Battleship: play vs an AI or vs a human via a shareable invite link.
Server-authoritative with fog-of-war. See `CONTEXT.md` for the ubiquitous language
and `docs/architecture.md` for the full overview.

## Tech stack

- Python 3.14, Django 6.0, **uv** package manager — run all Python tools via `uv run`.
- ASGI server: **uvicorn** (`config.asgi:application`).
- Realtime: **django-eventstream** SSE over pure ASGI (no Channels, no Redis) — ADR 0001.
- DB: PostgreSQL via `psycopg`. Settings read connection from env with local defaults.
- Front-end: Vite + Tailwind + Flowbite + Alpine.js + HTMX, bridged by `django-vite`,
  served in prod by WhiteNoise.

## Architecture boundary (ADR 0002)

- `domain/` is **pure Python** (dataclasses + functions): rules, placement, shot
  resolution, AI. pyright runs **strict** here. **Never put a Django import in `domain/`.**
- Django glue (`games/`, `accounts/`, `config/`) maps ORM rows ↔ domain objects:
  - `games/mappers.py` — ORM ↔ domain conversion.
  - `games/services.py` — transactional orchestration (load → apply domain move → persist).
  - `games/events.py` — SSE publish (empty ping; clients refetch their own partial).
  - pyright runs **standard** mode here.

## Realtime note (ADR 0001)

A resolved move publishes an empty event on channel `game-<id>`. Each player's open SSE
stream triggers an HTMX refetch of **their own** rendered partial — opponent ship
positions are never sent to the client (fog-of-war).

## Common commands (see `Makefile`)

- `make install` — `uv sync` + `npm install`
- `make dev` / `make run` — uvicorn with reload
- `make build` — Vite production build
- `make migrate` / `make makemigrations`
- `make test` — pytest · `make lint` — ruff check · `make format` — ruff format · `make type` — pyright

## Conventions

- KISS: minimal code; no speculative abstractions.
- Tests: pytest + pytest-django + model-bakery; Hypothesis for domain invariants.
- Lint/format with ruff; types with pyright (strict in `domain/`).
