import { NextResponse } from "next/server";

import { removeCatalogSkill } from "@/lib/skillhub";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      skillId?: string;
    };

    if (!payload.skillId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing skillId.",
        },
        { status: 400 },
      );
    }

    const dashboard = await removeCatalogSkill(payload.skillId);

    return NextResponse.json({
      ok: true,
      message: `已从 Catalog 删除 ${payload.skillId}。`,
      dashboard,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Failed to delete catalog skill.",
      },
      { status: 500 },
    );
  }
}
