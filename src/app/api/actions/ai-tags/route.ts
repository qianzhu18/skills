import { NextResponse } from "next/server";

import { generateSmartTags } from "@/lib/skillhub";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      skillIds?: string[];
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

    const dashboard = await generateSmartTags(payload.skillIds);

    return NextResponse.json({
      ok: true,
      message: "标签已生成。",
      dashboard,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "标签生成失败。",
      },
      { status: 500 },
    );
  }
}
