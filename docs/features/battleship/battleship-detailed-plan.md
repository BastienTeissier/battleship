# Detailed Implementation Plan: Battleship (Phases 0–7)

> Developer-ready expansion of [battleship-plan.md](./battleship-plan.md) (EPIC). Conventions: [CONTEXT.md](../../../CONTEXT.md), [ADR 0001](../../adr/0001-sse-realtime-over-polling.md), [ADR 0002](../../adr/0002-pure-python-domain-engine.md). Greenfield ⇒ all 🟢 new.
> **Stack pins**: Python 3.14, Django 6.0, uvicorn (ASGI), django-eventstream 5.x (pure-ASGI, no Channels/Redis), Postgres, uv, Vite+Tailwind+Flowbite+Alpine+HTMX. Coords: internal `Coord(x=col 0–9, y=row 0–9)`; display A–J / 1–10. **Docker deferred** (README lists it; out of scope now).

## 1. Feature Description

See EPIC §1 + PRD. Scope here = full build, Phases 0–7. No new business rules added.

---

## 2. Data Model

### Enums (`domain/` + mirrored as Django `TextChoices`)
- `ShipKind`: carrier(5) battleship(4) cruiser(3) submarine(3) destroyer(2).
- `Orientation`: H, V. `Side`: owner, opponent.
- `GameStatus`: SETUP, ACTIVE, FINISHED. `Outcome`: completed, resigned, abandoned. `ShotOutcome`: miss, hit, sunk.

### 🟢 `accounts.Player`
`user` O2O(AUTH_USER_MODEL, CASCADE, related_name="player"); `created_at` auto. Auto-created via `post_save(User)` signal (covers superusers).

### 🟢 `games.Game`  (PK = UUID; URL = invite link)
`id` UUIDField(pk, default uuid4); `owner` FK(Player, CASCADE, +games_as_owner); `opponent` FK(Player, null, CASCADE, +games_as_opponent); `vs_ai` bool=False; `status`=SETUP; `outcome` null; `turn`(Side) null; `winner`(Side) null; `owner_ready`/`opponent_ready` bool=False; `created_at` auto; `last_activity_at`.
Methods: `side_of(player)->Side|None`; `player_for(side)`; `is_participant(player)`; `is_abandoned` prop = `status==ACTIVE and now-last_activity_at>7d`.

### 🟢 `games.Ship`
`game` FK(+ships, CASCADE); `side`(Side); `kind`(ShipKind); `bow_x`/`bow_y` PosSmallInt; `orientation`(Orientation). **UniqueConstraint(game, side, kind)**.

### 🟢 `games.Shot`
`game` FK(+shots, CASCADE); `by_side`(Side); `x`/`y` PosSmallInt; `turn_no` PosSmallInt; `result`(ShotOutcome); `created_at`. **UniqueConstraint(game, by_side, x, y)**; ordering=[turn_no].

> Overlap/bounds enforced in `domain.placement` (cross-row). DB enforces one-ship-per-kind + one-shot-per-cell. AI game: opponent null, vs_ai True, opponent_ready True, AI fleet side=opponent.

---

## 3. Architecture (file-by-file)

### domain/ (Django-free, pyright **strict**, seedable `random.Random`)
```
ships.py     ShipKind(StrEnum)+LENGTHS; Orientation; Coord(frozen x,y; .label); ShipPlacement(kind,bow,orientation).cells()->tuple[Coord,...]
placement.py FLEET_KINDS; validate_fleet(placements)->None | raises InvalidPlacement(msg); random_fleet(rng)->tuple[ShipPlacement,...]
rules.py     ShotResult(outcome:ShotOutcome, sunk_kind:ShipKind|None, won:bool); resolve_shot(defender, prior_hits:frozenset[Coord], coord)->ShotResult; first_turn(rng)->Side
ai.py        choose_shot(rng, fired:frozenset[Coord], hits:frozenset[Coord])->Coord   # target neighbors of unfinished hits, else hunt random unfired
```
`validate_fleet` checks: exactly 5, kinds == FLEET_KINDS, all cells 0–9, no cell shared.
`resolve_shot`: miss if coord∉defender cells; else hit; sunk if that ship's cells ⊆ prior_hits∪{coord}; won if every ship sunk.

### games/mappers.py (⚪ boundary, ADR 0002)
`fleet_to_domain(game, side)->tuple[ShipPlacement,...]`; `fired(game, by_side)->frozenset[Coord]`; `hits(game, by_side)->frozenset[Coord]` (result∈{hit,sunk}); `save_fleet(game, side, placements)` bulk_create; `save_shot(game, by_side, coord, result, turn_no)->Shot`.

### games/services.py (`@transaction.atomic`, exceptions below)
Exceptions (→ view HTTP): `GameFull`(409), `OwnGame`(409), `NotYourTurn`(409), `CellAlreadyFired`(409), `GameNotActive`(409), `InvalidPlacement`(400, from domain).
- `create_ai_game(player)->Game`: SETUP, vs_ai, opponent_ready=True; save_fleet(opponent, random_fleet).
- `create_pvp_game(player)->Game`: SETUP.
- `join_game(player, game)`: `select_for_update`; vs_ai→Http404; opponent set & ≠player→GameFull; player==owner→OwnGame; idempotent if already opponent; else set opponent.
- `place_fleet(player, game, placements)`: side=side_of; validate_fleet (→InvalidPlacement); replace Ship rows for side; set `<side>_ready`; if owner_ready & opponent_ready → status=ACTIVE, turn=first_turn(rng). Reject if status≠SETUP.
- `fire_shot(player, game, x, y)->ShotResult`: `select_for_update`; status≠ACTIVE→GameNotActive; side≠turn→NotYourTurn; cell in fired(side)→CellAlreadyFired; resolve_shot; save_shot(turn_no=next); touch last_activity; if won→FINISHED/completed/winner=side; else turn=other. If vs_ai & status ACTIVE & turn==opponent: loop AI `_ai_move` until human turn or FINISHED. Then `events.publish(game)`.
- `_ai_move(game)`: coord=ai.choose_shot(rng, fired(opp), hits(opp)); resolve+save; win/turn update.
- `resign(player, game)`: status≠ACTIVE→GameNotActive; FINISHED/resigned/winner=other side; touch; publish.

### games/events.py
`publish(game)`: `django_eventstream.send_event(f"game-{game.id}", "move", {})`. **Empty payload (ping)** — clients refetch own rendered partial ⇒ fog-of-war safe.

### games/views.py (`@login_required`; map `request.user.player`→side; non-participant non-join→403)
| name | method | path | behavior → response |
|------|--------|------|---------------------|
| home | GET | `/` | render home (2 actions) |
| start_ai | POST | `/games/ai/` | create_ai_game → redirect game_detail |
| create_pvp | POST | `/games/` | create_pvp_game → redirect game_detail |
| game_detail | GET | `/games/<uuid>/` | participant: SETUP→placement, ACTIVE→battle, FINISHED→result. Non-participant: PvP+seat-open→join_game then placement; full/own/ai→403 or 409 |
| randomize | POST | `/games/<uuid>/randomize/` | return `_grid.html` prefilled w/ random_fleet (not persisted) |
| place | POST | `/games/<uuid>/place/` | parse fleet (hidden inputs) → place_fleet → SETUP partial (or 400 errors). If now ACTIVE → swap to battle |
| fire | POST | `/games/<uuid>/fire/` | x,y → fire_shot → swap `_boards.html`+`_turn.html` |
| resign | POST | `/games/<uuid>/resign/` | resign → swap `result` partial |
| stream | GET | `/games/<uuid>/events/` | django-eventstream SSE, channel `game-<uuid>`; 403 if not participant |

### accounts/views.py
`register` (custom `UserCreationForm`, no email verify) → login + redirect home. login/logout = `django.contrib.auth.urls`.

### config/
`settings/base.py`: INSTALLED_APPS += `django_eventstream, django_vite, accounts, games`; WhiteNoise middleware; `LOGIN_URL`, `LOGIN_REDIRECT_URL="home"`, `LOGOUT_REDIRECT_URL="login"`; Postgres via env (`DATABASE_URL`); `DJANGO_VITE`; `STORAGES` WhiteNoise. `dev.py` DEBUG + vite dev-server. `prod.py` ALLOWED_HOSTS, collectstatic.
`asgi.py`: `application = get_asgi_application()` (SSE streams over plain ASGI http; no Channels). Run: `uvicorn config.asgi:application`.

### assets/ (Vite root, django-vite)
`main.js`: import htmx.org, htmx-ext-sse, alpinejs, flowbite; register Alpine `placementGrid()` (select ship, hover-preview, rotate key, click-to-place, hidden-input sync). `main.css`: Tailwind directives. `tailwind.config.js`: content=templates+js, plugin flowbite. `vite.config.js`: manifest, outDir to static.

### templates/
`base.html` (Flowbite navbar, `{% vite_asset %}`, hx + alpine + sse ext) · `home.html` · `registration/login.html` · `register.html` · `games/placement.html`+`_grid.html` · `games/battle.html`+`_boards.html`+`_turn.html` · `games/result.html`.
`battle.html`: `hx-ext="sse"` `sse-connect="{% url 'stream' game.id %}"`; on `sse:move` → `hx-get` `_boards.html`. **Fog-of-war render**: `_boards.html` iterates viewer Ship(side=viewer)+incoming Shot(by_side=opp); opponent grid shows only Shot(by_side=viewer). Never iterate opponent ships.

---

## 4. Test Plan (added behavior only; trust Django/admin/eventstream)

### Unit — `tests/domain/` (pytest + Hypothesis, no DB)
- `test_random_fleet_always_valid` (property: in-bounds, no overlap, 5 kinds).
- `test_validate_rejects_overlap`, `test_validate_rejects_out_of_bounds`, `test_validate_rejects_wrong_count`.
- `test_shot_hit_iff_on_ship_cell` (property), `test_shot_sunk_on_last_cell`, `test_won_when_all_sunk`.
- `test_cells_horizontal_and_vertical`.
- `test_ai_never_repeats`, `test_ai_targets_neighbor_after_hit`, `test_ai_sinks_within_bound` (seeded).

### Integration — `tests/games/` (pytest-django, model-bakery)
- `test_join_first_claims`, `test_join_second_full_409`, `test_join_own_409`, `test_join_ai_404`.
- `test_place_invalid_400`, `test_both_ready_starts_active_sets_turn`.
- `test_fire_out_of_turn_409`, `test_fire_repeat_cell_409`, `test_fire_when_not_active_409`.
- `test_fire_sinks_last_ship_finishes_completed_winner`.
- `test_ai_replies_and_turn_returns_to_human`.
- `test_resign_finishes_resigned_winner_opponent`.
- `test_battle_partial_excludes_opponent_unhit_cells` (fog-of-war).
- `test_fire_calls_send_event_on_game_channel` (mock `send_event`).
- `tests/accounts/`: `test_register_creates_player_and_logs_in`, `test_anon_game_redirects_login`.

---

## 5. To Do List (phase-by-phase)

### Phase 0 — Bootstrap
- [ ] **uv project** — `pyproject.toml`: deps `django>=6,<7`, `psycopg[binary]`, `django-eventstream>=5`, `django-vite`, `whitenoise`; dev `pyright`, `ruff`, `pytest`, `pytest-django`, `pytest-asyncio`, `model-bakery`, `hypothesis`, `django-stubs`, `pre-commit`. ⚠️ verify Django 6 wheels for django-stubs/eventstream.
- [ ] **Django skeleton** — `manage.py`, `config/settings/{base,dev,prod}`, `asgi.py`, `urls.py`, apps `accounts`/`games`, pkg `domain/`.
- [ ] **Tooling config** — pyright (`strict` on `domain/`, `standard` else; plugin django-stubs), ruff (lint+format), pytest.ini (`DJANGO_SETTINGS_MODULE`), `.pre-commit-config.yaml`, `.github/workflows/ci.yml` (uv → ruff, pyright, pytest).
- [ ] **Front-end** — npm: vite, tailwindcss, flowbite, alpinejs, htmx.org, htmx-ext-sse; `assets/`; `django-vite` wired; `base.html`.
- [ ] **Repo docs** — `Makefile` (install/dev/test/lint/type/migrate/run), `CLAUDE.md` (conventions+commands+domain boundary), `docs/architecture.md` (consolidate CONTEXT+ADRs). Verify: `make dev` serves uvicorn; `make test` green (empty).

### Phase 1 — Domain engine (UF6/UF7 core)
- [ ] `domain/{ships,placement,rules,ai}.py`. [ ] `tests/domain/*`. Verify: pyright strict clean; unit+property tests pass; **no Django import in domain/**.

### Phase 2 — UF1 Auth + UF2 Home
- [ ] `accounts`: `Player` + post_save signal; `register` view/form/template; auth urls. [ ] `home` view+template (2 actions). [ ] tests. Verify: anon→login redirect; register→player+home.

### Phase 3 — UF3 AI game + UF6 Placement
- [ ] `games/models.py` + migration; `mappers.py`; `services.create_ai_game`+`place_fleet`. [ ] `placement.html`+`_grid.html`+Alpine `placementGrid()`; `randomize`/`place` views. [ ] `start_ai` view. [ ] tests: placement valid/invalid, both-ready-starts. Verify: vs-Computer→placement→Ready starts ACTIVE.

### Phase 4 — UF7 Fire & resolve (vs AI)
- [ ] `services.fire_shot`+`_ai_move`; `battle.html`+`_boards.html`+`_turn.html`; `fire` view; `game_detail` dispatch. [ ] tests: turn/repeat/active, win, AI reply, fog-of-war. Verify: full AI game playable to win.

### Phase 5 — UF4 Create link + UF5 Join
- [ ] `services.create_pvp_game`+`join_game`; `create_pvp` view; `game_detail` join branch (link copy in template). [ ] tests: claim/full/own/ai. Verify: 2nd browser joins via URL → both place → ACTIVE.

### Phase 6 — UF8 SSE
- [ ] `events.publish`; mount eventstream channel route; `battle.html` sse-connect→refetch `_boards`/`_turn`. [ ] test: publish-on-fire (mock). Verify: opponent move appears <~2s, no reload; payload carries no board data.

### Phase 7 — UF9 Resign + result + abandonment
- [ ] `services.resign`+view (Flowbite confirm modal); `result.html`; `is_abandoned` in `game_detail`. [ ] tests: resign outcome/winner. Verify: resign→opponent wins; >7d game shows abandoned (display-only).

---

## 6. Context: Current System Architecture

Greenfield — none. Target per EPIC §6. Key seams: `domain/` (authority, no Django), `games/services.py` (txn orchestration), `games/mappers.py` (ORM↔domain), `games/events.py` (SSE ping), `config/asgi.py` (ASGI entry).

---

## 7. Reference Implementations

None in-repo. External: `django-eventstream` 5.x ASGI SSE + HTMX `sse` ext; `django-vite` manifest tags; `flowbite` + Alpine coexistence (Flowbite=static components, Alpine=grid). Internal conventions: CONTEXT.md, ADR 0001/0002, EPIC plan.

---

## Notes / Watch items
- **Django 6 + Py 3.14 bleeding edge**: pin & verify `django-stubs`, `django-eventstream`, `psycopg`, `django-vite` support in Phase 0; fall back to Django 5.2 LTS if a blocker.
- **Fog-of-war**: SSE payload empty; per-user partial is the only authoritative render. Assert in `test_battle_partial_excludes_opponent_unhit_cells`.
- **Single ASGI process** (no Redis); scale-out ⇒ eventstream Redis channel manager (out of scope).
- **Docker** deferred despite README; revisit for prod parity.
- **AI loop** in `fire_shot` is bounded (≤100 cells); guard against infinite loop in tests.

## Resolved Decisions
1. **`randomize`**: returns an unsaved candidate layout; client holds it, `place` persists. ✅
2. **`place`**: single submit of full 5-ship fleet (Alpine hidden inputs) → atomic validate+persist+ready. ✅
3. **CI Postgres**: GH Actions service container for integration tests. ✅
4. **Docs**: macro (`battleship-plan.md`) + detailed (`battleship-detailed-plan.md`) kept separate. ✅
