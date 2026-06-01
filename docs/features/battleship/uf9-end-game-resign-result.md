# UF9: End a game (resign / result)

**Notion ticket:** *(not created — Notion integration skipped)*

## Context

Terminal states of a game. A player can resign at any time, and every finished game shows a
result screen with the outcome. Covers the three end outcomes: *completed*, *resigned*, and
*abandoned* (the last computed lazily on read, no worker).

## Specification

AAU (authenticated participant), during or after a game, I see/can:
- A **Resign** action available throughout an `ACTIVE` game.
- A **result screen** for any `FINISHED` game showing whether I won or lost and why
  (completed / resigned / abandoned).

## Success Scenario

- AAU pressing *Resign* and confirming, the game transitions to `FINISHED` with outcome
  *resigned*, the opponent is the winner, and I see the result screen.
- AAU finishing a game by sinking all opponent ships, I see the result screen with outcome
  *completed* and myself as winner (transition triggered in UF7).

## Error Scenario

- AAU attempting to resign a game that is already `FINISHED`, the action is unavailable and I
  am shown the existing result.

## Edge Cases

- AAU opening a game that has had no activity for more than 7 days, it is presented as
  *abandoned* (computed on read from `last_activity`; no cron/worker).
- Resign is confirmed (e.g. a Flowbite modal) to avoid accidental forfeits.

## Acceptance Criteria

- [ ] Resign is available throughout an `ACTIVE` game and requires confirmation.
- [ ] Resigning sets `FINISHED` / outcome *resigned* and declares the opponent the winner.
- [ ] A completed game (fleet fully sunk) shows the result with the correct winner.
- [ ] A game idle >7 days is presented as *abandoned*, computed on read.
- [ ] The result screen states the outcome and win/loss for the viewing player.
