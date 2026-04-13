import { NextResponse } from "next/server";

import { installCatalogSkill } from "@/lib/skillhub";

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

    const dashboard = await installCatalogSkill(payload.skillId, payload.libraryId);

    return NextResponse.json({
      ok: true,
      message: `已将 ${payload.skillId} 安装到 ${payload.libraryId}。`,
      dashboard,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Install failed.",
      },
      { status: 500 },
    );
  }
}
