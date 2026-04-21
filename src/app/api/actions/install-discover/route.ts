import { NextResponse } from "next/server";

import { installDiscoverSkill } from "@/lib/skillhub";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      skillId?: string;
      discoverSourceId?: string;
      libraryId?: string;
    };

    if (!payload.skillId || !payload.discoverSourceId || !payload.libraryId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing skillId, discoverSourceId, or libraryId.",
        },
        { status: 400 },
      );
    }

    const dashboard = await installDiscoverSkill(
      payload.skillId,
      payload.discoverSourceId,
      payload.libraryId,
    );

    return NextResponse.json({
      ok: true,
      message: `已安装 ${payload.skillId} 到 ${payload.libraryId}。`,
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
