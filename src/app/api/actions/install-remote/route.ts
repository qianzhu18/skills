import { NextResponse } from "next/server";

import { installRemoteDiscoverSkill } from "@/lib/skillhub";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      source?: string;
      skillId?: string;
      libraryId?: string;
    };

    if (!payload.source || !payload.skillId || !payload.libraryId) {
      return NextResponse.json(
        {
          ok: false,
          message: "缺少 source、skillId 或 libraryId。",
        },
        { status: 400 },
      );
    }

    const dashboard = await installRemoteDiscoverSkill(
      payload.source,
      payload.skillId,
      payload.libraryId,
    );

    return NextResponse.json({
      ok: true,
      message: `已把 ${payload.skillId} 安装到 ${payload.libraryId}。`,
      dashboard,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "远端安装失败。",
      },
      { status: 500 },
    );
  }
}
