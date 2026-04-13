import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { GitStatus } from "@/lib/skillhub-types";

const execFileAsync = promisify(execFile);

async function runGit(args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024,
  });

  return [stdout, stderr].filter(Boolean).join("\n").trim();
}

export async function getGitStatus(
  remoteFallback?: string,
): Promise<GitStatus> {
  try {
    await runGit(["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return {
      available: false,
      branch: null,
      remote: remoteFallback ?? null,
      clean: true,
      dirtyFiles: [],
      hasCommits: false,
    };
  }

  let branch: string | null = null;
  let remote: string | null = remoteFallback ?? null;
  let hasCommits = false;

  try {
    branch = (await runGit(["branch", "--show-current"])) || null;
  } catch {
    branch = null;
  }

  try {
    remote = (await runGit(["remote", "get-url", "origin"])) || remote;
  } catch {
    remote = remoteFallback ?? null;
  }

  try {
    await runGit(["rev-parse", "HEAD"]);
    hasCommits = true;
  } catch {
    hasCommits = false;
  }

  let dirtyFiles: string[] = [];

  try {
    const output = await runGit(["status", "--short"]);
    dirtyFiles = output
      ? output
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
  } catch {
    dirtyFiles = [];
  }

  return {
    available: true,
    branch,
    remote,
    clean: dirtyFiles.length === 0,
    dirtyFiles,
    hasCommits,
  };
}

async function ensureRemote(remoteUrl: string) {
  try {
    const existingRemote = await runGit(["remote", "get-url", "origin"]);

    if (existingRemote !== remoteUrl) {
      await runGit(["remote", "set-url", "origin", remoteUrl]);
    }
  } catch {
    await runGit(["remote", "add", "origin", remoteUrl]);
  }
}

async function remoteHasBranch(defaultBranch: string) {
  try {
    const output = await runGit(["ls-remote", "--heads", "origin", defaultBranch]);
    return Boolean(output.trim());
  } catch {
    return false;
  }
}

export async function runGitAction(
  action: "connect" | "fetch" | "pull" | "push",
  remoteUrl: string,
  defaultBranch: string,
) {
  await ensureRemote(remoteUrl);

  if (action === "connect") {
    return "已连接 GitHub 远端仓库。";
  }

  if (action === "fetch") {
    const output = await runGit(["fetch", "origin"]);
    return output || "已抓取远端更新。";
  }

  if (action === "pull") {
    if (!(await remoteHasBranch(defaultBranch))) {
      return `远端仓库暂时还没有 ${defaultBranch} 分支，目前只完成了远端绑定。`;
    }

    const output = await runGit(["pull", "--rebase", "origin", defaultBranch]);
    return output || `已拉取 origin/${defaultBranch}。`;
  }

  const status = await getGitStatus(remoteUrl);

  if (!status.hasCommits) {
    return "本地仓库还没有 commit，先提交一次后再推送。";
  }

  const branch = status.branch || defaultBranch;
  const output = await runGit(["push", "-u", "origin", branch]);
  return output || `已推送到 origin/${branch}。`;
}
