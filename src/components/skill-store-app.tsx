"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
import {
  ArrowUpRight,
  Boxes,
  CloudDownload,
  CloudUpload,
  GitBranch,
  LibraryBig,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";

import { ActionButton } from "@/components/action-button";
import type {
  ActionResponse,
  CatalogSkill,
  DashboardData,
  InstallationState,
  WorkspaceSkill,
} from "@/lib/skillhub-types";

type SkillStoreAppProps = {
  initialData: DashboardData;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function matchesSearch(
  query: string,
  skill: WorkspaceSkill | CatalogSkill,
  extraValues: string[] = [],
) {
  if (!query) {
    return true;
  }

  const haystack = [
    skill.id,
    skill.name,
    skill.description,
    skill.sourceLabel,
    skill.version,
    ...skill.commands,
    ...skill.triggers,
    ...skill.tags,
    ...extraValues,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function workspaceStatusLabel(status: WorkspaceSkill["catalogStatus"]) {
  if (status === "missing") {
    return "未入库";
  }

  if (status === "changed") {
    return "待更新";
  }

  return "已同步";
}

function installationStatusLabel(status: InstallationState) {
  if (status === "missing") {
    return "未安装";
  }

  if (status === "update-available") {
    return "可更新";
  }

  return "已安装";
}

function workspaceStatusTone(status: WorkspaceSkill["catalogStatus"]) {
  if (status === "synced") {
    return "status-pill-good";
  }

  if (status === "changed") {
    return "status-pill-warn";
  }

  return "status-pill-plain";
}

function installationStatusTone(status: InstallationState) {
  if (status === "installed") {
    return "status-pill-good";
  }

  if (status === "update-available") {
    return "status-pill-warn";
  }

  return "status-pill-plain";
}

async function parseResponse(response: Response) {
  return (await response.json()) as Partial<ActionResponse> & {
    ok?: boolean;
    message?: string;
  };
}

async function fetchDashboardData() {
  const response = await fetch("/api/dashboard", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("无法刷新技能面板。");
  }

  return (await response.json()) as DashboardData;
}

export function SkillStoreApp({ initialData }: SkillStoreAppProps) {
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  function applyDashboard(nextData: DashboardData) {
    startTransition(() => {
      setData(nextData);
    });
  }

  async function refreshDashboard() {
    const nextData = await fetchDashboardData();
    applyDashboard(nextData);
  }

  async function runAction(
    endpoint: string,
    body: Record<string, string>,
    key: string,
  ) {
    setBusyKey(key);
    setNotice(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = await parseResponse(response);

      if (!response.ok || !payload.ok || !payload.dashboard) {
        throw new Error(payload.message ?? "操作失败。");
      }

      applyDashboard(payload.dashboard as DashboardData);
      setNotice({
        kind: "success",
        text: payload.message ?? "操作完成。",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "发生未知错误。",
      });
    } finally {
      setBusyKey(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrateDashboard() {
      try {
        const nextData = await fetchDashboardData();

        if (!cancelled) {
          applyDashboard(nextData);
        }
      } catch (error) {
        if (!cancelled) {
          setNotice({
            kind: "error",
            text: error instanceof Error ? error.message : "初始化失败。",
          });
        }
      }
    }

    void hydrateDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const workspaceSkills = data.workspaceSkills.filter((skill) =>
    matchesSearch(deferredSearch, skill, [skill.catalogImportedFrom ?? ""]),
  );
  const catalogSkills = data.catalogSkills.filter((skill) =>
    matchesSearch(
      deferredSearch,
      skill,
      skill.installations.map((installation) => installation.libraryLabel),
    ),
  );

  return (
    <main className="app-shell">
      <section className="panel hero-panel overflow-hidden">
        <div className="hero-grid">
          <div className="space-y-6">
            <div className="hero-ribbon">
              <Sparkles size={16} />
              <span>Skill Registry / Local Libraries / GitHub Sync</span>
            </div>
            <div className="space-y-3">
              <p className="eyebrow">Qianzhu Skill Store</p>
              <h1 className="hero-title">
                把散落在 `.claude`、`.codex`、`.agents` 的 skills 收束成一个可搜索、可更新、可同步的应用商店。
              </h1>
              <p className="hero-copy">
                当前面板会同时扫描本地技能库、Catalog 仓库和远端 GitHub 绑定状态。你可以把任意本地 skill
                导入商店，再一键安装或更新回目标工具目录。
              </p>
            </div>
          </div>

          <div className="panel hero-side-panel">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Git Sync</p>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {data.git.branch ?? data.config.catalog.defaultBranch}
                </h2>
              </div>
              <span
                className={`status-pill ${
                  data.git.clean ? "status-pill-good" : "status-pill-warn"
                }`}
              >
                {data.git.clean ? "工作区干净" : "有未提交变更"}
              </span>
            </div>

            <div className="space-y-3 text-sm text-[var(--ink-soft)]">
              <div className="info-row">
                <GitBranch size={16} />
                <span>{data.git.branch ?? "未创建分支"}</span>
              </div>
              <div className="info-row">
                <CloudUpload size={16} />
                <span className="truncate">
                  {data.git.remote ?? data.config.catalog.remoteRepoUrl}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <ActionButton
                label="连接远端"
                icon={<CloudUpload size={16} />}
                busy={busyKey === "sync-connect"}
                onClick={() =>
                  runAction("/api/actions/sync", { action: "connect" }, "sync-connect")
                }
                tone="secondary"
              />
              <ActionButton
                label="Fetch"
                icon={<RefreshCw size={16} />}
                busy={busyKey === "sync-fetch"}
                onClick={() =>
                  runAction("/api/actions/sync", { action: "fetch" }, "sync-fetch")
                }
                tone="ghost"
              />
              <ActionButton
                label="Pull"
                icon={<CloudDownload size={16} />}
                busy={busyKey === "sync-pull"}
                onClick={() =>
                  runAction("/api/actions/sync", { action: "pull" }, "sync-pull")
                }
                tone="ghost"
              />
              <ActionButton
                label="Push"
                icon={<CloudUpload size={16} />}
                busy={busyKey === "sync-push"}
                onClick={() =>
                  runAction("/api/actions/sync", { action: "push" }, "sync-push")
                }
              />
            </div>
          </div>
        </div>

        <div className="stats-grid">
          <article className="stat-card">
            <p className="stat-label">本地库</p>
            <p className="stat-value">{data.summary.libraries}</p>
            <p className="stat-copy">Claude / Codex / Agents</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">扫描到的技能</p>
            <p className="stat-value">{data.summary.workspaceSkills}</p>
            <p className="stat-copy">聚合来自所有本地目录</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">商店 Catalog</p>
            <p className="stat-value">{data.summary.catalogSkills}</p>
            <p className="stat-copy">已进入仓库、可同步到云端</p>
          </article>
          <article className="stat-card">
            <p className="stat-label">待处理项</p>
            <p className="stat-value">
              {data.summary.pendingImports + data.summary.pendingInstalls}
            </p>
            <p className="stat-copy">
              {data.summary.pendingImports} 个待入库，{data.summary.pendingInstalls} 个待安装
            </p>
          </article>
        </div>
      </section>

      <section className="panel space-y-5">
        <div className="toolbar">
          <label className="search-shell">
            <Search size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索技能名、描述、命令、来源库"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <ActionButton
              label="刷新面板"
              icon={<RefreshCw size={16} />}
              busy={busyKey === "refresh"}
              onClick={async () => {
                setBusyKey("refresh");
                setNotice(null);

                try {
                  await refreshDashboard();
                  setNotice({
                    kind: "success",
                    text: "已刷新面板。",
                  });
                } catch (error) {
                  setNotice({
                    kind: "error",
                    text: error instanceof Error ? error.message : "刷新失败。",
                  });
                } finally {
                  setBusyKey(null);
                }
              }}
              tone="secondary"
            />
            <ActionButton
              label="重建索引"
              icon={<Boxes size={16} />}
              busy={busyKey === "rebuild"}
              onClick={() => runAction("/api/actions/rebuild", {}, "rebuild")}
              tone="secondary"
            />
          </div>
        </div>

        {notice ? (
          <div
            className={`notice-banner ${
              notice.kind === "success" ? "notice-success" : "notice-error"
            }`}
          >
            {notice.text}
          </div>
        ) : null}
      </section>

      <section className="section-block">
        <div className="section-head">
          <div>
            <p className="eyebrow">Workspace Skills</p>
            <h2 className="section-title">本地技能库</h2>
          </div>
          <p className="section-copy">
            这些 skill 来自你现在机器上的各个工具目录，适合作为导入商店和对比更新的源头。
          </p>
        </div>

        <div className="card-grid">
          {workspaceSkills.map((skill) => (
            <article className="skill-card" key={skill.key}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <span className="mini-tag">{skill.sourceLabel}</span>
                    <span
                      className={`status-pill ${workspaceStatusTone(
                        skill.catalogStatus,
                      )}`}
                    >
                      {workspaceStatusLabel(skill.catalogStatus)}
                    </span>
                  </div>
                  <div>
                    <h3 className="card-title">{skill.name}</h3>
                    <p className="card-copy">{skill.shortDescription}</p>
                  </div>
                </div>
                {skill.homepage ? (
                  <a
                    className="icon-link"
                    href={skill.homepage}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ArrowUpRight size={16} />
                  </a>
                ) : null}
              </div>

              <div className="meta-row">
                <span>更新时间 {formatDate(skill.updatedAt)}</span>
                <span>{skill.fileCount} files</span>
                <span>{formatBytes(skill.sizeBytes)}</span>
                {skill.version ? <span>v{skill.version}</span> : null}
              </div>

              <p className="path-chip" title={skill.path}>
                {skill.path}
              </p>

              <div className="flex flex-wrap gap-2">
                {skill.commands.slice(0, 4).map((command) => (
                  <span className="mini-tag mini-tag-subtle" key={command}>
                    {command}
                  </span>
                ))}
                {skill.triggers.slice(0, 3).map((trigger) => (
                  <span className="mini-tag mini-tag-subtle" key={trigger}>
                    {trigger}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <ActionButton
                  label={skill.catalogStatus === "missing" ? "导入商店" : "更新商店"}
                  icon={<Upload size={16} />}
                  busy={busyKey === `${skill.sourceId}:${skill.id}:import`}
                  onClick={() =>
                    runAction(
                      "/api/actions/import",
                      {
                        skillId: skill.id,
                        libraryId: skill.sourceId,
                      },
                      `${skill.sourceId}:${skill.id}:import`,
                    )
                  }
                />
                {skill.catalogImportedFrom ? (
                  <span className="caption-text">
                    Catalog 来源: {skill.catalogImportedFrom}
                  </span>
                ) : (
                  <span className="caption-text">Catalog 中还没有这个 skill</span>
                )}
              </div>
            </article>
          ))}

          {workspaceSkills.length === 0 ? (
            <div className="empty-state">
              <LibraryBig size={28} />
              <p>没有找到匹配的本地技能。</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="section-block">
        <div className="section-head">
          <div>
            <p className="eyebrow">Store Catalog</p>
            <h2 className="section-title">技能商店</h2>
          </div>
          <p className="section-copy">
            Catalog 会写入仓库内的 `catalog/skills` 和 `catalog/index.json`，天然适合和 GitHub
            仓库同步。
          </p>
        </div>

        <div className="card-grid">
          {catalogSkills.map((skill) => (
            <article className="skill-card" key={`catalog:${skill.id}`}>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className="mini-tag">Catalog</span>
                  {skill.manifest?.importedFrom ? (
                    <span className="mini-tag mini-tag-subtle">
                      来源 {skill.manifest.importedFrom.libraryLabel}
                    </span>
                  ) : null}
                </div>
                <div>
                  <h3 className="card-title">{skill.name}</h3>
                  <p className="card-copy">{skill.shortDescription}</p>
                </div>
              </div>

              <div className="meta-row">
                <span>更新时间 {formatDate(skill.updatedAt)}</span>
                <span>{skill.fileCount} files</span>
                <span>{formatBytes(skill.sizeBytes)}</span>
                {skill.version ? <span>v{skill.version}</span> : null}
              </div>

              <p className="path-chip" title={skill.path}>
                {skill.path}
              </p>

              <div className="install-list">
                {skill.installations.map((installation) => (
                  <div className="install-row" key={`${skill.id}:${installation.libraryId}`}>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-[var(--ink-strong)]">
                          {installation.libraryLabel}
                        </span>
                        <span
                          className={`status-pill ${installationStatusTone(
                            installation.status,
                          )}`}
                        >
                          {installationStatusLabel(installation.status)}
                        </span>
                      </div>
                      <p className="caption-text" title={installation.targetPath}>
                        {installation.targetPath}
                      </p>
                    </div>

                    <ActionButton
                      label={
                        installation.status === "missing"
                          ? "安装"
                          : installation.status === "update-available"
                            ? "更新"
                            : "重装"
                      }
                      icon={<CloudDownload size={16} />}
                      busy={busyKey === `${skill.id}:${installation.libraryId}:install`}
                      onClick={() =>
                        runAction(
                          "/api/actions/install",
                          {
                            skillId: skill.id,
                            libraryId: installation.libraryId,
                          },
                          `${skill.id}:${installation.libraryId}:install`,
                        )
                      }
                      tone={
                        installation.status === "installed" ? "ghost" : "secondary"
                      }
                    />
                  </div>
                ))}
              </div>
            </article>
          ))}

          {catalogSkills.length === 0 ? (
            <div className="empty-state">
              <Boxes size={28} />
              <p>Catalog 还是空的，先从上面的本地技能导入几项吧。</p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
