# Architecture

SwipeSort is a client-only React application with four screen states and no backend or router dependency.

## Layers

- `src/domain`: current data types, the sort reducer, assignments, undo, review corrections, and replay derivation
- `src/storage`: IndexedDB stores, media assets, object URL lifecycle, and ZIP import/export
- `src/media`: metadata extraction, poster generation, and the shared media renderer
- `src/features`: Setup, Sort, Results, Replay, and their shared media view

The app shell coordinates navigation and persistence but does not contain gesture geometry or storage implementation details.

## Recording

A session freezes its category labels and card order. Committed assignments and undo actions are appended as immutable events. Sparse normalized pointer samples may accompany an assignment for device-independent animation, but decisions are the source of truth.

Review corrections are stored separately. Replay derives a read-only view from the original session and cannot write to the current project or result.

## Persistence

IndexedDB stores project metadata, media metadata, blobs, and sessions. Runtime object URLs are never persisted. Writes happen at meaningful boundaries such as media import, a committed decision, undo, correction, and navigation.

ZIP imports are validated before any write. Project and session schemas remain version 1; supported archive versions are described below. Unsupported schemas are rejected rather than migrated.

## Linked TikTok media

TikTok is an explicit third media kind with a validated canonical URL and string video ID. Its stored Blob is a small `text/uri-list` asset containing that URL, so existing asset ownership, session snapshots, and atomic project bundles remain applicable. Media hydration never creates an object URL for it. No fetching occurs during URL import or ZIP import/export.

Only the official `https://www.tiktok.com/player/v1/{id}` iframe is constructed. Incoming player messages require both the exact TikTok origin and the current iframe window. Player controls do not write sorting state. The parent uses a separate drag handle because cross-origin iframe pointer events do not bubble into SwipeSort. Player errors offer retry and a source link without blocking categorization. A missing ready message only adds a retry hint: the live player can show its cover and cookie controls before Play triggers this event, so a timeout must never remove its iframe.

Archive version 2 is used when any referenced asset (including old session snapshots) is a TikTok link; local-only exports remain version 1. Both versions are validated before any IndexedDB write, including URL/ID consistency and URI payload equality. Existing projects and local media need no database migration. URLs/decisions are preserved, but no promise is made to preserve remote video availability or its playback timeline.

Player contract: https://developers.tiktok.com/docs/en/embed-player

Video sorting uses the dynamic viewport height and a size-container to fit each card at its media aspect ratio. The toolbar and category dock have separate layout rows, so they never intercept cross-origin player controls. TikTok's dock grip starts the existing drag controls through the card ref; assignment recording is unchanged. Active TikToks request autoplay/loop, with one mute/play retry on error 3002. Do not set `muted=1` in the iframe URL: TikTok documents it as locking the user's volume control. Results remain opt-in and replay remains independently controlled.
