# UF8: Live opponent updates

**Notion ticket:** *(not created — Notion integration skipped)*

## Context

The realtime upgrade on top of UF7, relevant to PvP games. When the opponent moves, the
waiting player's view refreshes automatically — no manual reload — via Server-Sent Events
(see ADR 0001). Delivered as a separate slice so gameplay (UF7) is playable with manual
refresh before realtime is wired in.

## Specification

AAU (authenticated participant of an `ACTIVE` PvP game), while waiting for the opponent, I
see/can:
- An open SSE connection subscribed to my game's event channel.
- When the opponent fires, my board partials and turn indicator update automatically to show
  the opponent's shot and that it is now my turn.

## Success Scenario

- AAU waiting on the opponent's move, the moment their shot resolves my view updates within
  about a second without any action from me.
- AAU whose game ends on the opponent's move (their winning shot or resignation), my view
  updates to the result screen automatically.

## Error Scenario

- AAU whose SSE connection drops, the page still reflects correct state on the next manual
  interaction/reload; the connection re-establishes when possible.

## Edge Cases

- Single ASGI process in v1: events are fanned out in-process (no Redis). Scaling to multiple
  processes would require a Redis channel manager (out of scope).
- AI games need no live updates because the AI replies synchronously within UF7.

## Acceptance Criteria

- [ ] A participant's battle screen opens an SSE stream for the game.
- [ ] When the opponent's shot resolves, the waiting player's boards and turn indicator update
      without a manual reload.
- [ ] A game-ending event (win/resign) pushes the waiting player to the result view.
- [ ] A dropped stream does not corrupt state; correct state is restored on reload.
