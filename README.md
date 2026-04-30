This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Signage caching + polling (Vercel)

The signage page polls `/api/circle/posts` every 60 seconds, but the API route is configured to be **CDN-cached on Vercel** to avoid multiplying Circle upstream calls when multiple screens are open.

- API route: `app/api/circle/posts/route.ts`
- Cache header: `Cache-Control: s-maxage=60, stale-while-revalidate=300`
- Daily filtering timezone: `Europe/London`

### What to verify on Vercel

- **Response header**: In Vercel Function logs / your browser devtools, confirm `/api/circle/posts` includes the Cache-Control header above.
- **Cache behavior**: With multiple clients hitting `/api/circle/posts` within 60s, Vercel should serve most responses from cache; Circle should not be hit per viewer.
- **Daily snapshot**: Refreshing the page should render quickly from localStorage if a snapshot exists for today (keyed by `staypost:snapshot:YYYY-MM-DD`).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
