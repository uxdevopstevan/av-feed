import { NextResponse } from "next/server";
import { fetchTodaySignageSnapshot } from "@/app/lib/circle";

export const runtime = "nodejs";

export async function GET() {
  try {
    const spaceIdRaw = process.env.NEXT_PUBLIC_CIRCLE_SPACE_ID;
    const spaceId = spaceIdRaw ? Number(spaceIdRaw) : NaN;
    if (!Number.isFinite(spaceId)) {
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

    const snapshot = await fetchTodaySignageSnapshot(spaceId);
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

