import { NextResponse } from "next/server";

import { importSkillToCatalog } from "@/lib/skillhub";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      skillId?: string;
      libraryId?: string;
    };

    if (!payload.skillId || !payload.libraryId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing skillId or libraryId.",
        },
        { status: 400 },
      );
    }

    const dashboard = await importSkillToCatalog(payload.skillId, payload.libraryId);

    return NextResponse.json({
      ok: true,
      message: `已将 ${payload.skillId} 同步到技能商店。`,
      dashboard,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Import failed.",
      },
      { status: 500 },
    );
  }
}
