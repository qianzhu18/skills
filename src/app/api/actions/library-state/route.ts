import { NextResponse } from "next/server";

import { setLibrarySkillEnabled } from "@/lib/skillhub";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      skillId?: string;
      libraryId?: string;
      enabled?: boolean;
    };

    if (!payload.skillId || !payload.libraryId || typeof payload.enabled !== "boolean") {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing skillId, libraryId, or enabled state.",
        },
        { status: 400 },
      );
    }

    const dashboard = await setLibrarySkillEnabled(
      payload.skillId,
      payload.libraryId,
      payload.enabled,
    );

    return NextResponse.json({
      ok: true,
      message: payload.enabled ? "技能已启用。" : "技能已禁用。",
      dashboard,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "State update failed.",
      },
      { status: 500 },
    );
  }
}
