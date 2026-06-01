# UF2: Authenticated home

**Notion ticket:** *(not created — Notion integration skipped)*

## Context

The landing page after login. The navigation hub from which a player starts a game. Kept
deliberately minimal for v1 (no resume list, no stats).

## Specification

AAU (authenticated), arriving on the home screen, I see/can:
- A welcome/header with my identity and a logout action.
- A **Play vs Computer** action that starts an AI game (UF3).
- A **Play vs a Friend** action that creates a PvP game and invite link (UF4).

## Success Scenario

- AAU choosing *Play vs Computer*, I am taken into fleet placement for a new AI game.
- AAU choosing *Play vs a Friend*, I am taken to a game page showing a shareable invite link.

## Edge Cases

- AAU who closed an in-progress PvP game has no resume list here; they return via the game's
  URL (the invite link doubles as the creator's resume link). Out of scope to surface in-app.

## Acceptance Criteria

- [ ] The home screen is only reachable while authenticated.
- [ ] Both actions (*Play vs Computer*, *Play vs a Friend*) are present and route correctly.
- [ ] Logout is reachable from the home screen.
