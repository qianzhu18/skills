import { NextResponse } from "next/server";

import { removeLibrarySkill } from "@/lib/skillhub";

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

    const dashboard = await removeLibrarySkill(payload.skillId, payload.libraryId);

    return NextResponse.json({
      ok: true,
      message: `已从 ${payload.libraryId} 移除 ${payload.skillId}。`,
      dashboard,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Failed to remove library skill.",
      },
      { status: 500 },
    );
  }
}
