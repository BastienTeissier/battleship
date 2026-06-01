# UF3: Start a game vs the AI

**Notion ticket:** *(not created — Notion integration skipped)*

## Context

Single-player entry point. Creates a game whose opponent is the built-in Hunt/Target AI and
routes the player straight into fleet placement (UF6). No link, no waiting for a second player.

## Specification

AAU (authenticated), choosing *Play vs Computer* on the home screen, I see/can:
- A new game is created in `SETUP` status with me as owner and the AI as opponent.
- I am immediately taken to the fleet placement screen for that game.

## Success Scenario

- AAU starting an AI game, the AI's fleet is placed automatically (randomized) so that once I
  confirm my placement the game can begin without waiting.

## Edge Cases

- AAU starting multiple AI games, each is an independent game; there is no limit imposed in v1.

## Acceptance Criteria

- [ ] *Play vs Computer* creates a `SETUP` game with the current user as owner and AI opponent.
- [ ] The player is routed to fleet placement (UF6) for the new game.
- [ ] The AI fleet is placed server-side and is never revealed to the player.
