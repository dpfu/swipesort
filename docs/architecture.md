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

ZIP imports are validated before any write. The pre-release schema supports only its current version and does not migrate legacy data.
