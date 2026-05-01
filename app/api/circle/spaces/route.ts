import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CirclePaged<T> = {
  page: number;
  per_page: number;
  has_next_page: boolean;
  count: number;
  page_count: number;
  records: T[];
};

type CircleSpace = {
  id: number;
  name?: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function GET() {
  try {
    const token = requireEnv("CIRCLE_API_TOKEN");

    const res = await fetch("https://app.circle.so/api/admin/v2/spaces?page=1&per_page=100", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({ error: `Circle API ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
    }

    const json = (await res.json()) as CirclePaged<CircleSpace>;
    const spaces = (json.records ?? [])
      .filter((s) => Number.isFinite(s.id))
      .map((s) => ({ id: s.id, name: String(s.name ?? `Space ${s.id}`) }));

    return NextResponse.json({ spaces }, { status: 200 });
  } catch {
    return NextResponse.json({ spaces: [] }, { status: 200 });
  }
}

