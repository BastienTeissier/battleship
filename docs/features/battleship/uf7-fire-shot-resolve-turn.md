# UF7: Fire a shot & resolve a turn

**Notion ticket:** *(not created — Notion integration skipped)*

## Context

The core gameplay loop, shared by AI and PvP modes. On an `ACTIVE` game, the player whose turn
it is fires at one cell of the opponent's board; the server resolves the shot, updates state,
and passes the turn. Server is authoritative and enforces fog-of-war.

## Specification

AAU (authenticated participant, when it is my turn), on the battle screen, I see/can:
- **My board**: my ships and the opponent's shots against me.
- **Opponent board (fog-of-war)**: only the cells I have fired at, shown as miss / hit / sunk —
  never the opponent's un-hit ship positions.
- A turn indicator showing whose move it is.
- Fire at exactly one un-fired cell on the opponent board.
- Immediate feedback: **miss**, **hit**, or **"sank the [ship name]"**.

## Success Scenario

- AAU firing on my turn, the shot resolves, feedback is shown, and the turn passes to the
  opponent. In an AI game the AI replies synchronously and the turn returns to me.
- AAU landing the final hit on the opponent's last ship, the game transitions to `FINISHED`
  with outcome *completed* and I am shown as the winner (see UF9).

## Error Scenario

- AAU firing when it is not my turn (e.g. double-submit or stale page), the server rejects the
  shot and my view reflects the true current state.
- AAU firing at a cell I have already targeted, the shot is rejected.

## Edge Cases

- A shot endpoint locks the Game row (`select_for_update`) and re-checks `turn` inside the
  transaction, so concurrent/duplicate submissions cannot produce two shots in one turn.
- Fog-of-war is enforced server-side: the opponent's ship layout is never serialized to the
  client until a cell is hit (and only hit/sunk cells are revealed).

## Acceptance Criteria

- [ ] On their turn, a participant can fire at one un-fired opponent cell.
- [ ] The shot resolves to miss / hit / sunk with the correct feedback.
- [ ] In an AI game, the AI's reply is computed synchronously and the turn returns to the human.
- [ ] Firing out of turn or at an already-targeted cell is rejected server-side.
- [ ] Un-hit opponent ship positions are never sent to the client.
- [ ] Sinking the opponent's last ship ends the game with the firer as winner.
