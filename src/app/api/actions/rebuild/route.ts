import { NextResponse } from "next/server";

import { rebuildCatalogIndex } from "@/lib/skillhub";

export async function POST() {
  try {
    const dashboard = await rebuildCatalogIndex();

    return NextResponse.json({
      ok: true,
      message: "已重建技能索引。",
      dashboard,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Rebuild failed.",
      },
      { status: 500 },
    );
  }
}
