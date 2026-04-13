import { NextResponse } from "next/server";

import { runGitAction } from "@/lib/git";
import { getDashboardData, loadSkillHubConfig } from "@/lib/skillhub";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      action?: "connect" | "fetch" | "pull" | "push";
    };

    if (!payload.action) {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing sync action.",
        },
        { status: 400 },
      );
    }

    const config = await loadSkillHubConfig();
    const message = await runGitAction(
      payload.action,
      config.catalog.remoteRepoUrl,
      config.catalog.defaultBranch,
    );
    const dashboard = await getDashboardData();

    return NextResponse.json({
      ok: true,
      message,
      dashboard,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Sync failed.",
      },
      { status: 500 },
    );
  }
}
