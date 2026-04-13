import { NextResponse } from "next/server";

import { saveSkillHubConfig } from "@/lib/skillhub";
import type { SkillHubConfig } from "@/lib/skillhub-types";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SkillHubConfig;
    const dashboard = await saveSkillHubConfig(payload);

    return NextResponse.json({
      ok: true,
      message: "配置已保存。",
      dashboard,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to save config.",
      },
      { status: 500 },
    );
  }
}
