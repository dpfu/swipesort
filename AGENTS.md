# SwipeSort agent guide

SwipeSort is a separate product from SortBoard. Preserve its deliberately mobile-first, single-card interaction model.

## Product invariants

- Exactly two freely named categories.
- Local images/short videos and full TikTok video links. No generic remote-media ingestion.
- One active card during sorting; horizontal swipe is the primary action.
- Buttons and keyboard are complete input alternatives.
- Original session recordings are immutable.
- Results corrections never rewrite replay history.
- Replay is strictly read-only.
- Project data and local files remain browser-local unless explicitly exported. TikTok playback explicitly contacts TikTok; store canonical links, never download its videos.

## Engineering guardrails

- Keep domain, storage, media, and screen components separated.
- Do not grow the app shell into a monolith.
- Persist asset IDs, never object URLs.
- Do not save pointer-move state; persist only meaningful commits.
- Validate ZIP contents and references before writing to IndexedDB.
- Prefer deletion and small focused modules over speculative abstractions.
- Add real mobile Chromium paths for gesture behavior, reload, undo, review, and replay.

## Checks

```bash
npm test
npm run build
npm run test:e2e
npm run lint
git diff --check
```
