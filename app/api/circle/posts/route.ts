import { NextResponse } from "next/server";
import { fetchTodaySignageSnapshot } from "@/app/lib/circle";

export const runtime = "nodejs";

function parseSpaceId(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  if (raw === null) return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  const i = Math.floor(n);
  return Math.min(max, Math.max(min, i));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fromQuery = parseSpaceId(url.searchParams.get("spaceId"));
    const fromEnv = parseSpaceId(process.env.CIRCLE_DEFAULT_SPACE_ID ?? null);
    const spaceId = fromQuery ?? fromEnv;

    if (!spaceId) {
      return NextResponse.json(
        { dayKey: null, generatedAt: new Date().toISOString(), signature: "empty", posts: [] },
        {
          status: 200,
          headers: {
            "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
          },
        },
      );
    }

    const daysBack = clampInt(url.searchParams.get("daysBack"), 0, 0, 30);
    const maxPosts = clampInt(url.searchParams.get("maxPosts"), 200, 1, 500);
    const maxCommentsPerPost = clampInt(url.searchParams.get("maxCommentsPerPost"), 10, 0, 25);
    const maxTotalComments = clampInt(url.searchParams.get("maxTotalComments"), 800, 0, 2000);

    const snapshot = await fetchTodaySignageSnapshot(spaceId, {
      daysBack,
      maxPosts,
      maxCommentsPerPost,
      maxTotalComments,
    });
    return NextResponse.json(snapshot, {
      status: 200,
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch {
    return NextResponse.json(
      { dayKey: null, generatedAt: new Date().toISOString(), signature: "empty", posts: [] },
      {
        status: 200,
        headers: {
          "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  }
}

