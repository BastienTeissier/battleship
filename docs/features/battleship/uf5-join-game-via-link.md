# UF5: Join a game via invite link

**Notion ticket:** *(not created — Notion integration skipped)*

## Context

The invitee side of multiplayer. An authenticated user opening a valid invite link claims the
single open opponent seat. The link is single-use: 1 link ⇔ 1 game ⇔ 1 seat.

## Specification

AAU (authenticated), opening a valid invite link, I see/can:
- Be assigned as the opponent of that game (the seat is claimed).
- Be routed to fleet placement (UF6) for the game.

## Success Scenario

- AAU (not the creator) opening a link with an open seat, I claim the seat and proceed to
  place my fleet; the game starts once both players are ready.

## Error Scenario

- AAU opening a link whose seat is already taken, I see "game already full" and cannot join.
- AAU who is the creator opening my own link, I am not allowed to occupy both seats; I am
  returned to my existing game view instead.

## Edge Cases

- Anonymous visitor opening the link → redirected to login (UF1), then returned to the join
  flow after authenticating.
- AAU who is already the claimed opponent re-opening the link → resumes the same game.

## Acceptance Criteria

- [ ] The first authenticated non-creator to open the link is set as the opponent.
- [ ] A second visitor to an already-claimed link sees "game already full".
- [ ] The creator cannot claim the opponent seat of their own game.
- [ ] An unauthenticated visitor is sent to login and returned to the join flow afterward.
- [ ] A successful joiner is routed to fleet placement.
