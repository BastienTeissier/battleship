# UF6: Place your fleet

**Notion ticket:** *(not created — Notion integration skipped)*

## Context

The setup screen, shared by both AI and PvP modes. The player arranges the classic fleet of 5
ships on their own 10×10 grid before battle. All placements are validated server-side.

## Specification

AAU (authenticated participant of a `SETUP` game), on the placement screen, I see/can:
- My own empty 10×10 grid and a tray of the 5 ships to place: Carrier (5), Battleship (4),
  Cruiser (3), Submarine (3), Destroyer (2).
- Select a ship, choose a starting cell to place it, and **rotate** between horizontal and
  vertical orientation.
- A **Randomize** action that places all ships in a valid random layout.
- A preview/highlight of where the selected ship will land before confirming.
- A **Ready** action that locks in my placement, enabled only when all 5 ships are placed.

## Success Scenario

- AAU placing all 5 ships validly and pressing *Ready*, my fleet is locked. In an AI game the
  battle begins immediately; in a PvP game the game starts once the opponent is also ready.

## Error Scenario

- AAU attempting a placement that goes off the board or overlaps another ship, the server
  rejects it and I see feedback; the invalid ship is not placed.

## Edge Cases

- Ships **may touch** (no required gap) — adjacent placements are valid.
- AAU pressing *Ready* before becoming ready is prevented (action disabled until 5 placed).
- AAU re-placing a ship already on the grid repositions it rather than adding a 6th.

## Acceptance Criteria

- [ ] All 5 classic ships can be placed via click-to-place with rotation.
- [ ] Randomize produces a valid full layout in one action.
- [ ] The server rejects off-board and overlapping placements with feedback.
- [ ] Touching (adjacent) ships are accepted.
- [ ] *Ready* is only available once all 5 ships are placed and locks the fleet.
- [ ] An AI game starts on Ready; a PvP game starts only when both players are ready.
