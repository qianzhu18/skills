import { NextResponse } from "next/server";

import { syncSkillBetweenLibraries } from "@/lib/skillhub";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      skillId?: string;
      sourceLibraryId?: string;
      targetLibraryId?: string;
    };

    if (!payload.skillId || !payload.sourceLibraryId || !payload.targetLibraryId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing skillId, sourceLibraryId, or targetLibraryId.",
        },
        { status: 400 },
      );
    }

    const dashboard = await syncSkillBetweenLibraries(
      payload.skillId,
      payload.sourceLibraryId,
      payload.targetLibraryId,
    );

    return NextResponse.json({
      ok: true,
      message: `已将 ${payload.skillId} 从 ${payload.sourceLibraryId} 同步到 ${payload.targetLibraryId}。`,
      dashboard,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Library sync failed.",
      },
      { status: 500 },
    );
  }
}
