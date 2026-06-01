# PRD: Battleship Game

## Why

- Deliver a web-based, turn-based **Battleship** game where an authenticated user can play
  either against a built-in **AI** or against **another person** invited through a shareable link.
- Provide a small, self-contained product that exercises a clean Django architecture
  (HTMX + Alpine.js + Flowbite front-end, PostgreSQL, SSE realtime) with strong quality
  controls (pyright, ruff, pytest).
- User value: a familiar, low-friction game that can be started solo in one click or played
  asynchronously with a friend over a link — no app install, no matchmaking lobby.

## Result

### Acceptance Criteria

- [ ] An unauthenticated visitor cannot reach any game screen and is redirected to login.
- [ ] A logged-in user can start a game against the AI and be taken to fleet placement.
- [ ] A logged-in user can create a PvP game and obtain a single-use invite link.
- [ ] The first authenticated user (other than the creator) to open an invite link claims the
      opponent seat; subsequent visitors see "game already full".
- [ ] A player can place all 5 ships (classic fleet) manually or via Randomize, and the server
      rejects overlapping or out-of-bounds placements.
- [ ] On their turn, a player can fire at one opponent cell and see miss / hit / "sank the X".
- [ ] A player can never see the opponent's un-hit ship positions (fog-of-war).
- [ ] The server rejects a shot when it is not the requesting player's turn.
- [ ] The game ends and declares a winner when one fleet is fully sunk.
- [ ] A player can resign at any time; the opponent wins immediately.
- [ ] When the opponent moves, the acting player's view updates without a manual reload (SSE).
- [ ] A game idle for more than 7 days is presented as "abandoned".

### Features

- Django authentication (register / log in / log out).
- Authenticated home with two actions: *Play vs Computer* and *Play vs a Friend*.
- Single-player mode vs a Hunt/Target AI.
- Multiplayer mode via single-use invite link (first-comer claims the seat).
- Manual + randomized ship placement with server-side validation.
- Turn-based firing with hit/miss/sunk feedback and server-authoritative turn enforcement.
- Fog-of-war: each player sees their full board and only their own shots on the opponent's grid.
- Realtime turn handoff via Server-Sent Events.
- Resign action and an end-of-game result screen (completed / resigned / abandoned).

### Visual

- No Figma provided. Front-end uses **Flowbite** components (navbar, buttons, cards, modals,
  toasts) for layout and **Alpine.js** for the interactive placement/targeting grid.
- Two key screens:
  - **Placement screen** — own 10×10 grid, fleet tray, rotate + Randomize, "Ready" action.
  - **Battle screen** — two grids side by side: own board (ships + incoming shots) and the
    opponent board (fog-of-war; only the player's own shots), plus a turn indicator.
- *(Wireframes to be added.)*

### Use cases / edge cases

**Domain model (DDD):**

```
User (Django) 1───1 Player
Game ─┬─ owner:   Player        (creator)
      ├─ opponent: Player | AI  (claimed via link, or the AI)
      ├─ status:  SETUP | ACTIVE | FINISHED
      ├─ outcome: completed | resigned | abandoned   (when FINISHED)
      ├─ turn:    Player                              (whose move; ACTIVE only)
      ├─ Ship*    (per owner: kind, bow coordinate, orientation)  — fleet of 5
      └─ Shot*    (shooter, x, y, turn #, result: miss|hit|sunk)
```

**Lifecycle:** `SETUP → ACTIVE → FINISHED`. First turn chosen by coin flip when both fleets
are placed. Board state is **derived** from ships + ordered shots, never stored as an image.

**Main use cases:**
- Start and complete a full game vs the AI.
- Create a link, have a friend join, and play asynchronously to completion.
- Resign mid-game.

**Edge cases:**
- Two people open the same invite link → only the first claims the seat.
- The creator opens their own invite link → not allowed to occupy both seats.
- A player submits a shot when it is not their turn, or double-submits → server rejects.
- A shot targets an already-fired cell → rejected.
- Placement overlaps another ship or exceeds the board → rejected with feedback.
- Opponent abandons the game → resign is available; after 7 days idle it reads as abandoned.
- AI's reply is computed synchronously within the human's shot request.

### User Flows

| UF | Name | File |
|----|------|------|
| UF1 | Authentication | [uf1-authentication.md](./uf1-authentication.md) |
| UF2 | Authenticated home | [uf2-authenticated-home.md](./uf2-authenticated-home.md) |
| UF3 | Start a game vs the AI | [uf3-start-game-vs-ai.md](./uf3-start-game-vs-ai.md) |
| UF4 | Create & share an invite link | [uf4-create-share-invite-link.md](./uf4-create-share-invite-link.md) |
| UF5 | Join a game via invite link | [uf5-join-game-via-link.md](./uf5-join-game-via-link.md) |
| UF6 | Place your fleet | [uf6-place-fleet.md](./uf6-place-fleet.md) |
| UF7 | Fire a shot & resolve a turn | [uf7-fire-shot-resolve-turn.md](./uf7-fire-shot-resolve-turn.md) |
| UF8 | Live opponent updates | [uf8-live-opponent-updates.md](./uf8-live-opponent-updates.md) |
| UF9 | End a game (resign / result) | [uf9-end-game-resign-result.md](./uf9-end-game-resign-result.md) |

*(Each UF is documented in its own file. See linked files for full specifications.)*

## Decisions

Settled architecture decisions live in [CONTEXT.md](../../../CONTEXT.md) and two ADRs:
- [ADR 0001 — SSE for realtime, over polling](../../adr/0001-sse-realtime-over-polling.md)
- [ADR 0002 — Pure-Python domain engine, decoupled from the ORM](../../adr/0002-pure-python-domain-engine.md)

Key product decisions:
- **Account required** for all players (1 Player ⇔ 1 Django User); no guest play.
- **Classic Hasbro ruleset**, fixed: 10×10, fleet 5/4/3/3/2, one shot per turn, ships may touch.
- **Single Hunt/Target AI**, computed synchronously (no background worker).
- **No turn timer**; games are long-lived/async, resign is the explicit exit, idle >7 days
  reads as abandoned (computed on read).

### Out of Scope (v1)

- Rematch button.
- Win/loss record / player statistics.
- In-game chat.
- Global leaderboard / ranking (Elo).
- Email or push "your turn" notifications.
- Spectators.
- Configurable rulesets (board size, fleet, variants).
- Multiple AI difficulty levels.
- In-app list of in-progress games to resume (PvP games are reached via their URL).

## Technical Specification

### Architecture

- **Django** project on an **ASGI** server (Uvicorn/Daphne/Granian) to support SSE.
- **Pure-Python `domain/` package** (Django-free dataclasses): board, fleet, rules, AI,
  invariants. ORM models are a thin persistence layer; views map ORM rows ↔ domain objects.
- **HTMX** drives partial page updates; **Alpine.js** drives the placement/targeting grid;
  **Flowbite** provides component styling.
- **Realtime:** SSE via `django-eventstream`. Shot resolution publishes an event to the game
  channel; each player's open stream triggers an HTMX swap of the board partials. Single ASGI
  process initially (no Redis); Redis channel manager only if scaled out.
- **Server is authoritative:** validates whose turn it is, rejects illegal shots/placements,
  and never serializes opponent ship positions to the client (fog-of-war).
- **Concurrency:** the shot endpoint takes `select_for_update()` on the Game row and asserts
  `game.turn == request.user` inside the transaction before resolving.

### Libraries & tools

- **Django** + **PostgreSQL**: web framework and persistence.
- **django-eventstream**: SSE delivery for realtime turn handoff.
- **HTMX / Alpine.js / Flowbite (Tailwind)**: front-end interactivity and styling.
- **Vite + django-vite + WhiteNoise**: asset bundling (HMR in dev, hashed manifest in prod).
- **pyright**: static typing — `strict` over `domain/`, `standard` over Django glue;
  **django-stubs** for ORM typing.
- **ruff**: linting and formatting (replaces black/isort/flake8).
- **pytest + pytest-django + model-bakery**: tests; **Hypothesis** for domain invariants.
- **pre-commit + GitHub Actions**: run ruff/pyright/pytest on every push.

### Data Requirements

- New tables: `Player` (1:1 Django `User`), `Game`, `Ship`, `Shot`.
- `Game`: owner, opponent (nullable until claimed; AI flag for solo games), status, outcome,
  turn, invite token, `last_activity`, timestamps.
- `Ship`: game, owner, kind, bow coordinate (x, y), orientation.
- `Shot`: game, shooter, x, y, turn number, result, timestamp.
- DB constraints enforce non-overlapping ships and unique shot per (game, shooter, cell).

### Rights & Permissions

| Permission | Description | User Roles |
|------------|-------------|------------|
| Play game | Start games, place fleet, fire, resign | Authenticated user (must be a participant of the game) |
| Join via link | Claim the open opponent seat of a SETUP game | Authenticated user who is not the creator, while the seat is open |
| View game | See a game's boards (own fog-of-war view) | The two participants only |

### Testing strategy

- **Unit / property tests (Hypothesis):** the `domain/` engine — placement validity, shot
  resolution, sunk/win detection, and AI behaviour (seeded RNG, no DB).
- **Integration tests (pytest-django):** views and transitions — invite-link claiming,
  turn enforcement, fog-of-war serialization, resign, abandonment-on-read.
- **Realtime tests:** SSE endpoint emits the expected event on shot resolution.

## Production strategy

- **Analytics / key metrics:** games created (by mode), games completed vs abandoned,
  invite-link join conversion rate, average game duration, AI vs human game split.
- **Error handling & alerting:** structured logging on rejected shots/placements and SSE
  connection failures; alert on elevated 5xx rates from the shot/stream endpoints and on
  ASGI connection saturation (since SSE holds long-lived connections).
