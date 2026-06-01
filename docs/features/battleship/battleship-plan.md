# Implementation Plan: Battleship Game

> Greenfield. No existing code to reuse — all components 🟢 new. Conventions: [CONTEXT.md](../../../CONTEXT.md),
> [ADR 0001 (SSE)](../../adr/0001-sse-realtime-over-polling.md), [ADR 0002 (pure-Python domain)](../../adr/0002-pure-python-domain-engine.md).
> PRD: [prd.md](./prd.md) + UF1–UF9.

## 1. Feature Description

**Objective**: Turn-based Battleship (classic Hasbro rules) playable vs Hunt/Target AI or vs a human via single-use invite link. Django + HTMX/Alpine/Flowbite, Postgres, SSE realtime, ASGI.

**Key Capabilities**:
- **CAN** auth (register/login/logout); start AI game; create PvP game + invite link; join via link (first-comer); place fleet (manual+randomize); fire on turn; see live opponent moves (SSE); resign; see result.
- **CANNOT** play as guest; see opponent un-hit ships; fire out of turn or twice on a cell; configure rules; pick AI difficulty; rematch/chat/leaderboard (deferred).

**Business Rules**:
- 1 `Player` ⇔ 1 `User`. 10×10, fleet 5/4/3/3/2, ships may touch, 1 shot/turn.
- First-comer claims opponent seat; creator can't claim own seat.
- PvP `ACTIVE` only when both `ready`. First turn = coin flip.
- Server-authoritative: validate turn + cell; never serialize opponent ship cells.
- AI reply synchronous in human's request. No worker. Idle >7d ⇒ `abandoned` (computed on read).

**Visual Design**: No Figma. Flowbite components + Alpine grid. Placement screen + 2-grid battle screen.

---

## 2. Data Model

### New Entities
- 🟢 **Player** (`accounts`): `user` OneToOne(User, on_delete=CASCADE), `created_at`. Seam for future profile/stats.
- 🟢 **Game** (`games`): `id` **UUID primary key** (non-enumerable; the game URL doubles as the invite link); `owner` FK→Player; `opponent` FK→Player null; `vs_ai` bool; `status` `SETUP|ACTIVE|FINISHED`; `outcome` `null|completed|resigned|abandoned`; `turn` `owner|opponent` null; `winner` `owner|opponent` null; `owner_ready`/`opponent_ready` bool; `created_at`; `last_activity_at`.
- 🟢 **Ship** (`games`): `game` FK; `side` `owner|opponent`; `kind` `carrier|battleship|cruiser|submarine|destroyer`; `bow_x`/`bow_y` int; `orientation` `H|V`. UniqueConstraint(`game`,`side`,`kind`).
- 🟢 **Shot** (`games`): `game` FK; `by_side` `owner|opponent`; `x`/`y` int; `turn_no` int; `result` `miss|hit|sunk`; `created_at`. UniqueConstraint(`game`,`by_side`,`x`,`y`).

### Relationships
- Game.owner/opponent → Player → User. AI game: `vs_ai=True`, `opponent=null`; AI fleet stored as `side=opponent`.
- Ship/Shot → Game (+ side enum), NOT Player — uniform for AI, trivial fog-of-war filter (`side != viewer_side`).
- Board derived from Ships + ordered Shots. Nothing stored as image/blob.

### Notes
- Ship overlap/bounds enforced in domain (cross-row, not DB). Duplicate-shot + one-ship-per-kind enforced by DB UniqueConstraints.
- `is_abandoned` = `status==ACTIVE and now-last_activity_at > 7d` — computed property in view layer (`now` not in domain).

---

## 3. Architecture

### Project layout (🟢 all new)
```
pyproject.toml            # uv; ruff, pyright (strict→domain/, standard→rest), pytest, django-stubs
manage.py
config/  settings/{base,dev,prod}.py  asgi.py  urls.py
domain/                   # Django-FREE, pyright strict
  board.py ships.py placement.py rules.py ai.py
accounts/  models.py views.py urls.py templates/
games/     models.py mappers.py services.py events.py views.py urls.py templates/games/ static/
assets/    main.js main.css tailwind.config.js vite.config.js   # Vite root
tests/     domain/ games/ accounts/
.github/workflows/ci.yml  .pre-commit-config.yaml
```

### Key files

#### A. `domain/` (pure Python, dataclasses)
- `ships.py`: `ShipKind(Enum)` w/ length; `FLEET` spec; `Orientation`; `Ship(kind,bow:Coord,orientation)` → `cells()`.
- `board.py`: `Coord`; `BOARD=10`; bounds check; fog-of-war view helper.
- `placement.py`: `validate(placements)` → ok/`PlacementError` (overlap, out-of-bounds, wrong count); `random_layout(rng)`.
- `rules.py`: `resolve_shot(target_fleet, prior_shots, coord)` → `ShotResult(kind: miss|hit|sunk, sunk: ShipKind|None)`; `is_fleet_destroyed(...)`; `first_turn(rng)`.
- `ai.py`: `HuntTargetAI.choose_shot(fired: set[Coord], hits: set[Coord])` → `Coord`. Seedable RNG.

#### B. `games/models.py` — Game/Ship/Shot (above). TextChoices enums.

#### C. `games/mappers.py`
- `to_domain_fleet(game, side)` → list[domain.Ship]; `to_domain_shots(game, side)`.
- `persist_fleet(game, side, placements)`; `persist_shot(game, by_side, coord, result, turn_no)`.

#### D. `games/services.py` (orchestration: domain + ORM + events, `@transaction.atomic`)
- `create_ai_game(player)`: Game(vs_ai, SETUP); persist random AI fleet side=opponent.
- `create_pvp_game(player)`: Game(SETUP) — UUID PK is the invite token.
- `join_game(player, game_id)`: lock row; if `vs_ai`→404; if opponent set→`GameFull`; if player==owner→`OwnGame`; set opponent.
- `place_fleet(player, game, placements)`: validate(domain)→else `PlacementError`; persist; set `<side>_ready`; if both ready (AI ready by default)→`ACTIVE`, `turn=first_turn()`.
- `fire_shot(player, game, coord)`: `select_for_update()`; assert `status==ACTIVE` & `turn==side` & cell unfired; resolve(domain); persist Shot; touch `last_activity_at`; if fleet destroyed→FINISHED/completed/winner; else flip turn; if `vs_ai` & AI's turn→loop AI `fire_shot` until human turn or game over; `events.publish(game)`.
- `resign(player, game)`: FINISHED/resigned, winner=other; `events.publish(game)`.

#### E. `games/events.py` — `publish(game)`: `django_eventstream.send_event(f"game-{game.id}", "move", {})`. **Empty payload** (ping only) — clients re-fetch their own rendered partial → fog-of-war preserved.

#### F. `games/views.py` (HTMX; `@login_required`)
- `home` (UF2); `start_ai` POST (UF3); `create_pvp` POST (UF4); `join` GET `<uuid>` (UF5; game URL = invite link); `placement` GET + `place`/`randomize`/`ready` POST (UF6); `battle` GET; `fire` POST→swap board partials (UF7); `stream` SSE endpoint per game (UF8); `resign` POST (UF9). Map `request.user.player`→side; 403 if not participant.

#### G. `accounts/` — `Player` model; `register` view; login/logout via `django.contrib.auth`.

#### H. `config/` — split settings; `asgi.py` mounts `django_eventstream` URLs; `INSTALLED_APPS` += eventstream, django_vite; WhiteNoise; `AUTH` redirects.

#### I. `assets/` + Vite — `django-vite` tags; Tailwind+Flowbite plugin; `main.js` imports Alpine+Flowbite; Alpine component for placement/targeting grid.

---

## 4. Test Plan

> Only added behavior. Trust Django, admin, eventstream lib.

### Unit (domain — pytest + Hypothesis, no DB)
- `test_random_layout_always_valid` (property): generated layout in-bounds, non-overlapping, 5 ships.
- `test_validate_rejects_overlap` / `test_validate_rejects_out_of_bounds`.
- `test_shot_hit_iff_on_ship_cell` (property).
- `test_shot_sunk_when_last_cell_hit`; `test_win_when_all_sunk`.
- `test_ai_never_repeats_shot`; `test_ai_targets_neighbor_after_hit`; `test_ai_sinks_fleet_within_bound`.

### Integration (pytest-django, model-bakery)
- `test_join_first_claims` / `test_join_second_full` (`GameFull`) / `test_join_own_blocked` (`OwnGame`).
- `test_place_fleet_invalid_rejected`; `test_ready_starts_when_both_ready`.
- `test_fire_out_of_turn_403`; `test_fire_repeat_cell_rejected`.
- `test_fire_sinks_last_ship_finishes_completed_winner`.
- `test_ai_replies_synchronously_turn_returns_to_human`.
- `test_resign_finishes_resigned_opponent_wins`.
- `test_fog_of_war_opponent_ship_cells_absent` (battle partial + SSE payload contain no un-hit opp cells).
- `test_fire_publishes_event_on_game_channel`.

---

## 5. To Do List

### Phase 0 — Bootstrap
- [ ] **Scaffold project**: uv init, Django, Postgres, `config/settings/{base,dev,prod}`, ASGI, apps `accounts`/`games`, `domain/` package.
- [ ] **Tooling**: pyright (strict `domain/`, standard rest) + django-stubs; ruff lint+format; pytest+pytest-django+model-bakery+hypothesis; pre-commit; `.github/workflows/ci.yml`.
- [ ] **Front-end**: Vite + django-vite + Tailwind + Flowbite + Alpine + HTMX; WhiteNoise; base template + Flowbite navbar.

### Phase 1 — Domain engine (UF6/UF7 core)
- [ ] **ships/board/placement/rules/ai** — File: `domain/*.py` — dataclasses + functions.
- [ ] **Write tests** — File: `tests/domain/` — all Unit tests above.

### Phase 2 — UF1 Auth + UF2 Home
- [ ] `Player` model + register/login/logout + `home` (two actions). Files: `accounts/*`, `games/templates/.../home.html`.
- [ ] Verify: anon→login redirect; login→home.

### Phase 3 — UF3 AI game + UF6 Placement
- [ ] Models `Game/Ship/Shot` + migration; `mappers.py`; `services.create_ai_game`/`place_fleet`. Placement view + Alpine grid + randomize + ready.
- [ ] Tests: `tests/games/test_placement.py`, `test_setup.py`.

### Phase 4 — UF7 Fire & resolve (vs AI)
- [ ] `services.fire_shot` (+ AI loop); `battle` + `fire` views; board partials (own + fog-of-war).
- [ ] Tests: turn enforcement, repeat-cell, win, AI reply, fog-of-war.

### Phase 5 — UF4 Create link + UF5 Join
- [ ] `create_pvp_game`/`join_game`; create view (link + copy); join view (full/own errors).
- [ ] Tests: claim/full/own.

### Phase 6 — UF8 SSE
- [ ] `events.publish`; mount eventstream; `stream` view; HTMX SSE trigger → refetch partials.
- [ ] Tests: publish-on-fire; payload fog-of-war-safe.

### Phase 7 — UF9 Resign + result + abandonment
- [ ] `resign` service+view (Flowbite confirm modal); result screen; `is_abandoned` on read.
- [ ] Tests: resign outcome/winner.

---

## 6. Context: Current System Architecture

Greenfield — no current system. Target architecture:

| File | Purpose |
|------|---------|
| `domain/` | Django-free rules + AI (pyright strict). Authority for game logic. |
| `games/services.py` | Transactional orchestration: load ORM→domain→apply→persist→publish. |
| `games/mappers.py` | ORM↔domain translation (ADR 0002 boundary). |
| `games/events.py` | SSE publish (ADR 0001), ping-only payload. |
| `config/asgi.py` | ASGI entry (required for SSE). |

---

## 7. Reference Implementations

None in-repo (greenfield). External references:
- `django-eventstream` SSE + HTMX integration (channel `send_event`, single-process no Redis).
- `django-vite` manifest/dev-server tags.
- Conventions: CONTEXT.md, ADR 0001, ADR 0002.

---

## Notes

- **Fog-of-war via re-fetch**: SSE event carries no board data; each client `hx-get`s its own server-rendered partial. Keeps the only authoritative rendering server-side.
- **AI fleet on creation**: placed at `create_ai_game` (not first fire) so battle starts on human Ready.
- **Concurrency**: `select_for_update()` on Game in `fire_shot`/`join_game`; re-check invariants inside txn.
- **Scale-out later**: multi-process SSE ⇒ add Redis channel manager (out of scope).

## Resolved Decisions

1. **Turn/winner**: `side` enum (`owner|opponent`), not FK→Player. AI needs no fake Player. ✅
2. **`Game.id`**: **UUID primary key**; game URL is the invite link (no separate `invite_token`). ✅
3. **Abandonment**: display-only on read; do NOT persist FINISHED/abandoned for stale games. ✅
4. **Sunk disclosure**: reveal ship *type name* to shooter (`ShotResult.sunk: ShipKind`; UI "sank the Battleship"). ✅
5. **Register**: minimal custom `register` view (no email verification) for v1. ✅
