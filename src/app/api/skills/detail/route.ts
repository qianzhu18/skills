import { NextResponse } from "next/server";

import { getSkillDetail } from "@/lib/skillhub";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get("skillId");
    const sourceId = searchParams.get("sourceId");
    const locationType = searchParams.get("locationType");

    if (
      !skillId ||
      !sourceId ||
      (locationType !== "library" && locationType !== "catalog")
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing skillId, sourceId, or valid locationType.",
        },
        { status: 400 },
      );
    }

    const detail = await getSkillDetail(skillId, sourceId, locationType);

    return NextResponse.json({
      ok: true,
      detail,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to load detail.",
      },
      { status: 500 },
    );
  }
}
