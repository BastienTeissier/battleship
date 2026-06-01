# Battleship — Context & Ubiquitous Language

A turn-based Battleship game built with Django (HTMX, Alpine.js, Flowbite), playable
against an AI or another human via a shareable invite link. PostgreSQL persistence,
Django authentication.

## Glossary

### Player
A participant in a Game. Always backed by a Django `User` — there is no anonymous
play. Clicking a shared invite link routes through login/registration before joining.

### Game
A single match between two Players (or one Player + AI). Owns the rules, turn order,
and outcome.

### Invite link
A shareable URL bound 1:1 to a Game with one open opponent seat. The first
authenticated user (other than the creator) to open it claims the seat; latecomers
see "game already full." Single-use.

### Fleet
The 5 ships a Player places: Carrier (5), Battleship (4), Cruiser (3), Submarine (3),
Destroyer (2). Axis-aligned, non-overlapping, **may touch**.

### Shot
One Player's attack on one cell of the opponent's board per turn. Resolves to
miss / hit / hit-and-sunk. Exactly one Shot per turn; control then passes.

### Ruleset (canonical — classic Hasbro)
10×10 board per Player · fleet of 5 (5/4/3/3/2) · one Shot per turn · ships may touch ·
sunk ships are announced · win = sink all 5 opponent ships.

## Decisions
- **Identity:** Account required for all players (1 Player ⇔ 1 Django User). No guest play.
- **Ruleset:** Classic Hasbro, fixed (not configurable per game).
- **Placement UX:** Click-to-place + rotate, plus a Randomize button. Server validates.
- **Realtime:** SSE via `django-eventstream` on an ASGI server (async views). Chosen over
  HTMX polling. Single ASGI process to start (no Redis); Redis only if scaled out. See ADR 0001.
- **AI:** Single Hunt/Target opponent (random search → target neighbours of a hit). Computed
  synchronously inside the human's shot request; no Celery/worker.
- **Persistence:** Normalized `Game`/`Ship`/`Shot` tables; board state is *derived*, never
  stored as an image/blob. Rules engine is a Django-free pure-Python `domain/` package
  (dataclasses); ORM is a thin persistence layer. Maximises unit-testability.
- **Lifecycle:** `SETUP` → `ACTIVE` → `FINISHED` (outcome: completed / resigned / abandoned).
  First turn by coin flip. Always-available Resign. No turn timer; idle >7 days reads as
  abandoned (computed on read — no cron/worker).
- **Authority/fog-of-war:** Server is authoritative — validates whose turn it is and rejects
  illegal shots; never sends the opponent's ship positions to the client.

### Game lifecycle (states)
- **SETUP** — one or both players still placing their Fleet.
- **ACTIVE** — alternating turns; exactly one Player to move at any moment.
- **FINISHED** — terminal, with an `outcome`: *completed*, *resigned*, or *abandoned*.

## Quality tooling
- **Types:** pyright — `strict` on the Django-free `domain/`, `standard` on Django glue;
  `django-stubs` installed.
- **Lint/format:** ruff for both lint and format (replaces black/isort/flake8).
- **Tests:** pytest + pytest-django + model-bakery; **Hypothesis** for domain invariants.
- **Automation:** pre-commit hooks + GitHub Actions CI (ruff, pyright, pytest on every push).

## Front-end
- **Stack:** Tailwind + Flowbite (components/styling) + Alpine.js (bespoke interactivity) + HTMX.
- **Build:** Vite bundler bridged via `django-vite` (HMR in dev; hashed manifest assets in prod
  served by WhiteNoise). Alpine/Flowbite are npm deps imported from the JS entrypoint.
- **JS division of labour:** Flowbite owns static-ish components (navbar, buttons, modals,
  toasts); Alpine owns the placement/targeting grid. Never bind both to the same element.

## v1 scope
**IN:** play vs AI · play vs human via invite link · ship placement · firing · resign ·
realtime via SSE · lazy abandonment.
**Deferred (explicitly later):** rematch, win/loss record, in-game chat, leaderboard,
email/push notifications, spectators, configurable rulesets, multiple AI difficulties.
