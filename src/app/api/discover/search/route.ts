import { NextResponse } from "next/server";

import { searchRemoteDiscoverSkills } from "@/lib/skillhub";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";

    if (query.length < 2) {
      return NextResponse.json({
        ok: true,
        query,
        skills: [],
      });
    }

    const skills = await searchRemoteDiscoverSkills(query);

    return NextResponse.json({
      ok: true,
      query,
      skills,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "远端搜索失败。",
        skills: [],
      },
      { status: 500 },
    );
  }
}
