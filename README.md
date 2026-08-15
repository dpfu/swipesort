# SwipeSort

SwipeSort is a mobile-first, local-only tool for sorting images and short videos into two named categories with a horizontal swipe.

The app has four focused steps:

1. Add media and name the two categories.
2. Sort one card at a time by swiping left or right.
3. Review both groups and correct individual assignments.
4. Replay the original sorting session without changing its recorded history.

SwipeSort runs entirely in the browser. Projects, media, and recordings stay in IndexedDB unless the user explicitly exports them.

## Status

SwipeSort is an experimental pre-release research tool. The first milestone is a small, polished v0.1 rather than a general media platform.

## Local development

Requirements:

- Node.js 22.22.2 or newer
- npm 10 or newer
- a modern browser

```bash
npm ci
npm run dev
```

Run the checks:

```bash
npm test
npm run build
npm run test:e2e
```

## Product limits

- exactly two categories
- images and short videos only
- no backend, accounts, sync, collaboration, statistics, or transcoding
- browser codec and storage limits apply
- pre-release persistence and export formats may change without migration support

See [docs/product.md](docs/product.md) and [docs/architecture.md](docs/architecture.md) for the current product and implementation boundaries.

## License

SwipeSort is available under the MIT License.
