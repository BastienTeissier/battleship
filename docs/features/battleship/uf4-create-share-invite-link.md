# UF4: Create & share an invite link

**Notion ticket:** *(not created — Notion integration skipped)*

## Context

Multiplayer entry point. Creates a PvP game in `SETUP` with one open opponent seat and
produces a single-use, shareable invite link. The link is also the creator's way back to the
game (no in-app resume list in v1).

## Specification

AAU (authenticated), choosing *Play vs a Friend* on the home screen, I see/can:
- A new game is created in `SETUP` with me as owner and the opponent seat open.
- A unique, hard-to-guess invite link displayed with a copy-to-clipboard action.
- Guidance that the link can be used by one person and the game waits until they join.
- The ability to proceed to place my own fleet (UF6) while waiting.

## Success Scenario

- AAU copying and sharing the link, my opponent opens it and claims the seat (UF5); when both
  fleets are placed the game starts.

## Edge Cases

- AAU re-opening the same link before anyone joins, I return to my game (resume) rather than
  creating a duplicate.
- AAU placing my fleet before the opponent joins, my readiness is stored; the game starts once
  both players are ready.

## Acceptance Criteria

- [ ] *Play vs a Friend* creates a `SETUP` PvP game owned by the current user with an open seat.
- [ ] A unique invite token/link is generated and shown with a copy action.
- [ ] The creator can navigate to fleet placement for the game while the seat is still open.
- [ ] Re-opening the link as the creator resumes the same game (no duplicate created).
