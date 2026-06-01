# 0001 — Server-Sent Events for realtime, over HTMX polling

- Status: Accepted
- Date: 2026-05-31

## Context

Battleship is turn-based: a player only needs to learn "it's your turn" within a
second or two of the opponent's move. We considered three ways to propagate a
resolved move to the waiting player:

1. **HTMX polling** — `hx-trigger="every 2s"`. Keeps plain synchronous Django on WSGI,
   no extra infrastructure. ~2s latency and steady DB load from idle pollers.
2. **WebSockets (Django Channels)** — true push, but requires ASGI + a Redis channel
   layer and heavier testing/deploy. Overkill for a slow turn-based game.
3. **Server-Sent Events** — one-way push over a long-lived HTTP connection. Lighter than
   WebSockets, integrates with the HTMX SSE extension.

## Decision

Use **Server-Sent Events** delivered by the **`django-eventstream`** library, served from
an **ASGI** server with **async views**. Move resolution publishes an event to the game's
channel; each player's open SSE stream receives it and HTMX swaps the updated board.

The application runs as a **single ASGI process** initially, so no Redis channel manager
is required. Horizontal scaling later would reintroduce Redis for cross-process fan-out.

## Consequences

- Commits the project to **ASGI** (Uvicorn/Daphne/Granian) and async-aware views for the
  stream endpoint; the rest of the app may remain conventional.
- Push-based UX (near-instant turn handoff) without per-client polling load.
- Adds `django-eventstream` as an opinionated dependency.
- Long-lived connections require an ASGI server sized for concurrent open streams.
- Single-process assumption must be revisited before scaling out (Redis channel manager).

## Alternatives considered

- **Polling** — simplest infra (WSGI, no async), rejected for the idle DB load and laggier
  feel; remains the fallback if SSE proves operationally heavy.
- **WebSockets/Channels** — rejected as disproportionate for one shot per turn.
