# Product brief

## Promise

Load local images, short videos, or a batch of full TikTok video URLs, name two categories, sort every item with a smooth left/right gesture, then review and replay the session.

## Experience principles

- One medium, one decision, one movement.
- The card follows the finger directly; the interface explains the destination while it moves.
- Category names and directions remain visible in addition to color.
- Portrait media receives generous space, while every format remains fully visible with `object-fit: contain`.
- Buttons and keyboard controls are complete alternatives to swiping.
- The interface feels calm and editorial, not like a game or dating product.

## Screens

### Setup

Name the project and both categories, add media, inspect thumbnails, remove items, and set their order. Starting a session freezes the category labels and card order for the recording.

### Sort

Show one active card with a subtle next card behind it. Horizontal movement reveals the left or right category. A clear distance or velocity commits the decision; an incomplete gesture springs back. The user can undo the latest decision.

### Results

Show the two categories as mobile tabs with thumbnail grids. A user may move an item to the other category. This correction changes the current result, never the original recording.

### Replay

Reconstruct the immutable original session from its event log. Replay is strictly read-only and supports play, pause, step, and reset.

## V0.1 boundaries

Included: two categories, image/video import, swipe/buttons/keyboard, undo, local persistence, results corrections, replay, project ZIP import/export, TikTok player cards, and a mobile-first responsive layout.

Excluded: text cards, skip/neutral, more categories, backend services, accounts, generic URL ingest/short-link resolution, collaboration, video editing or transcoding, analytics, and AI classification.

## TikTok cards

Batch input accepts one canonical video URL per line and keeps input order, skipping duplicate IDs. Invalid lines must be fixed before the batch is saved. Watching is online through TikTok's own iframe. Keep it interactive: gestures inside the player control the player; a clearly marked handle below it swipes the card. Buttons remain available for every card, including unavailable videos. Setup uses local labels, Results loads a player on demand, and replay remains an immutable history of sorting decisions rather than a recording of video playback.
