import { NextResponse } from "next/server";

import { updateSkillMetadata } from "@/lib/skillhub";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      skillIds?: string[];
      note?: string;
      tags?: string[];
      trashed?: boolean;
      preferredSources?: string[];
      mergeTags?: boolean;
    };

    if (!Array.isArray(payload.skillIds) || payload.skillIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing skillIds.",
        },
        { status: 400 },
      );
    }

    const dashboard = await updateSkillMetadata(
      payload.skillIds,
      {
        note: payload.note,
        tags: payload.tags,
        trashed: payload.trashed,
        preferredSources: payload.preferredSources,
      },
      { mergeTags: payload.mergeTags },
    );

    return NextResponse.json({
      ok: true,
      message: "技能元数据已更新。",
      dashboard,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to update skill metadata.",
      },
      { status: 500 },
    );
  }
}
