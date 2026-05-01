Circle AV Feed is a Next.js app that renders an event “signage” screen powered by the Circle Admin API:

- **Main area**: rotates through **posts** (image, video, or text-only).
- **Bottom bar**: shows **comments for the currently displayed post** (or a CTA when a promo slide is showing).
- **Config page (`/config`)**: per-device settings stored in localStorage (space selection + fetch limits + theming + assets + import/export).

## Getting Started

### Local development

Run the dev server:

```bash
npm run dev
```

- Signage screen: `http://localhost:3000`
- Config screen: `http://localhost:3000/config`

### Production build

```bash
npm run build
npm run start
```

## How it works

### Data flow

- The client polls `GET /api/circle/posts` every 60 seconds.
- The server fetches posts + comments from Circle Admin API v2 and returns a `SignageSnapshot`.
- The client keeps a **stable, append-only queue** of post slides (new posts append to the end of the cycle).

Relevant files:

- Client signage UI: `app/components/SignageClient.tsx`
- Snapshot fetch + Circle parsing: `app/lib/circle.ts`
- Posts API route: `app/api/circle/posts/route.ts`
- Spaces API route: `app/api/circle/spaces/route.ts`

### Main area content rules

- Only **post** media is shown in the main area.
- Media attached to **comments** is ignored for the main area.
- Text-only posts render centered on a dark background.

### Video playback

Circle videos are commonly delivered as **HLS (`.m3u8`)**.

- **Chrome / Windows**: we use **`hls.js`** to play HLS inside a normal `<video>`.
- **Safari**: uses native HLS when available.
- Videos autoplay muted and loop, and slides are capped to 10 seconds on-screen.

## Signage caching + polling (Vercel)

The signage page polls `/api/circle/posts` every 60 seconds, but the API route is configured to be **CDN-cached on Vercel** to avoid multiplying Circle upstream calls when multiple screens are open.

- API route: `app/api/circle/posts/route.ts`
- Cache header: `Cache-Control: s-maxage=60, stale-while-revalidate=300`
- Daily filtering timezone: `Europe/London`

## Environment variables

### Required (server-only)

- `CIRCLE_API_TOKEN`: Circle Admin API token. **Do not** use `NEXT_PUBLIC_` — this must remain server-only.

### Optional

- `CIRCLE_DEFAULT_SPACE_ID`: Default Circle `spaceId` used when no per-device `spaceId` is selected.
- `NEXT_PUBLIC_SIGNAGE_CONFIG_PIN`: PIN required to unlock `/config` on a device.

## Per-device space selection

The config page (`/config`) loads a list of Circle spaces from `/api/circle/spaces` and stores a selected `spaceId` in localStorage for that browser/device.

When set, the signage client polls `/api/circle/posts?spaceId=<id>`. This means CDN caching on Vercel will be effectively per-space ID (different query string = different cache key).

## Configurable fetch limits (safe defaults + server-side clamping)

The config page also controls how much data we fetch from Circle. These values are stored per-device and are **clamped server-side** to prevent abuse.

- `daysBack` (0–30): include posts/comments from the last N days in London time.
- `maxPosts` (1–500): cap post fetch volume.
- `maxCommentsPerPost` (0–25): cap comments per post in the bottom bar.
- `maxTotalComments` (0–2000): cap total comments returned.

### What to verify on Vercel

- **Response header**: In Vercel Function logs / your browser devtools, confirm `/api/circle/posts` includes the Cache-Control header above.
- **Cache behavior**: With multiple clients hitting `/api/circle/posts` within 60s, Vercel should serve most responses from cache; Circle should not be hit per viewer.
- **Daily snapshot**: Refreshing the page should render quickly from localStorage if a snapshot exists for today (keyed by `circle:snapshot:YYYY-MM-DD`).
