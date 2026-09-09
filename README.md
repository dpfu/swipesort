# SwipeSort

SwipeSort is a mobile-first tool for sorting local images, short videos, and linked TikTok videos into two named categories with a horizontal swipe.

The app has four focused steps:

1. Add media and name the two categories.
2. Sort one card at a time by swiping left or right.
3. Review both groups and correct individual assignments.
4. Replay the original sorting session without changing its recorded history.

SwipeSort runs entirely in the browser. Projects, local media, TikTok links, and sorting recordings stay in IndexedDB unless exported. Linked TikTok videos stream directly through the official TikTok player; they need an internet connection and are not downloaded or included as video files in exports.

## Status

SwipeSort is an experimental pre-release research tool. The first milestone is a small, polished v0.1 rather than a general media platform.

## TikTok videos

In Setup, open **Add TikTok links** and paste one full `https://www.tiktok.com/@creator/video/…` URL per line. Duplicate video IDs are skipped; invalid lines are reported before any cards are added. Short `vm.tiktok.com`, `vt.tiktok.com`, and `/t/` links must first be opened in a browser to obtain the full video URL. No API key, proxy, or TikTok login is required by SwipeSort.

The official player requests autoplay and looping during sorting (sound may initially be muted by the browser). If sound autoplay fails, SwipeSort retries muted once; native volume controls remain available, and a browser may still require a first tap. Replay follows its own play/pause control; in Results, choose **Load TikTok player**. Setup previews do not contact TikTok. During sorting, videos use a fitted, uncropped canvas with a compact toolbar and a single bottom dock. Swipe the **Swipe** grip between the two category buttons, or tap a category. Gestures inside the cross-origin player belong to TikTok and cannot move the card. Unavailable/blocked videos offer retry and an original link; they can still be categorized or removed in Setup.

Exports preserve URLs and original sorting decisions, not an offline copy of TikTok content or its playback timeline. TikTok's availability, regional restrictions, browser settings, and player behavior still apply. A ZIP containing TikTok assets uses archive version 2; this build continues to read and write local-media-only version 1 archives. Older builds cannot open version 2.

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
- local images and short videos, plus full TikTok video URLs
- no backend, accounts, sync, collaboration, statistics, or transcoding
- browser codec and storage limits apply
- pre-release persistence and export formats may change without migration support

See [docs/product.md](docs/product.md) and [docs/architecture.md](docs/architecture.md) for the current product and implementation boundaries.

## License

SwipeSort is available under the MIT License.
