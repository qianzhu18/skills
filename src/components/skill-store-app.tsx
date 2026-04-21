"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  Download,
  Eye,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Tags,
  UserCircle2,
  X,
} from "lucide-react";

import type {
  ActionResponse,
  DashboardData,
  DiscoverSkill,
  SkillDetail,
  WorkspaceSkill,
} from "@/lib/skillhub-types";

type SkillStoreAppProps = {
  initialData: DashboardData;
};

type PageTab = "discover" | "library";
type LibraryTab = "claude" | "codex";
type CompatibilityFilter = "all" | LibraryTab;
type RiskFilter = "all" | "safe" | "scripted" | "high";
type LibraryStateFilter = "all" | "enabled" | "disabled";
type InstallState = "missing" | "enabled" | "disabled";

type DiscoverItem = {
  id: string;
  name: string;
  description: string;
  compatibility: LibraryTab[];
  tags: string[];
  discoverSources: DiscoverSkill[];
  trust: DiscoverSkill["trust"];
  installState: Record<LibraryTab, InstallState>;
};

type LibraryItem = {
  id: string;
  name: string;
  description: string;
  libraryId: LibraryTab;
  state: "enabled" | "disabled";
  tags: string[];
  trust: WorkspaceSkill["trust"];
  record: WorkspaceSkill;
  discoverSources: DiscoverSkill[];
};

type DrawerTarget =
  | {
      kind: "discover";
      skillId: string;
    }
  | {
      kind: "library";
      skillId: string;
      libraryId: LibraryTab;
    };

const LIBRARY_LABELS: Record<LibraryTab, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getLibraryLabel(libraryId: LibraryTab) {
  return LIBRARY_LABELS[libraryId];
}

function getMetaTags(data: DashboardData, skillId: string) {
  const record = data.meta.records[skillId];

  return unique([...(record?.generatedTags ?? []), ...(record?.tags ?? [])]);
}

function buildDiscoverItems(data: DashboardData): DiscoverItem[] {
  const byId = new Map<string, DiscoverSkill[]>();

  data.discoverSkills.forEach((skill) => {
    if (!skill.compatibility.some((entry) => entry === "claude" || entry === "codex")) {
      return;
    }

    byId.set(skill.id, [...(byId.get(skill.id) ?? []), skill]);
  });

  const installedByLibrary = new Map<
    LibraryTab,
    Map<string, WorkspaceSkill["libraryState"]>
  >([
    [
      "claude",
      new Map(
        data.workspaceSkills
          .filter((skill) => skill.sourceId === "claude")
          .map((skill) => [skill.id, skill.libraryState]),
      ),
    ],
    [
      "codex",
      new Map(
        data.workspaceSkills
          .filter((skill) => skill.sourceId === "codex")
          .map((skill) => [skill.id, skill.libraryState]),
      ),
    ],
  ]);

  return Array.from(byId.entries())
    .map(([skillId, records]) => {
      const primary = records[0];

      return {
        id: skillId,
        name: primary.name,
        description: primary.description,
        compatibility: unique(records.flatMap((record) => record.compatibility)) as LibraryTab[],
        tags: getMetaTags(data, skillId),
        discoverSources: records,
        trust:
          records.find((record) => record.trust.riskLevel === "high")?.trust ??
          records.find((record) => record.trust.riskLevel === "medium")?.trust ??
          primary.trust,
        installState: {
          claude:
            installedByLibrary.get("claude")?.get(skillId) === "enabled"
              ? "enabled"
              : installedByLibrary.get("claude")?.get(skillId) === "disabled"
                ? "disabled"
                : "missing",
          codex:
            installedByLibrary.get("codex")?.get(skillId) === "enabled"
              ? "enabled"
              : installedByLibrary.get("codex")?.get(skillId) === "disabled"
                ? "disabled"
                : "missing",
        },
      } satisfies DiscoverItem;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildLibraryItems(data: DashboardData, libraryId: LibraryTab): LibraryItem[] {
  const discoverById = new Map<string, DiscoverSkill[]>();

  data.discoverSkills.forEach((skill) => {
    discoverById.set(skill.id, [...(discoverById.get(skill.id) ?? []), skill]);
  });

  return data.workspaceSkills
    .filter((skill) => skill.sourceId === libraryId)
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      libraryId,
      state: skill.libraryState,
      tags: getMetaTags(data, skill.id),
      trust: skill.trust,
      record: skill,
      discoverSources: discoverById.get(skill.id) ?? [],
    }))
    .sort((left, right) => {
      if (left.state !== right.state) {
        return left.state === "enabled" ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
}

function riskLabel(trust: DiscoverSkill["trust"]) {
  if (trust.riskLevel === "high") {
    return "高风险";
  }

  if (trust.riskLevel === "medium") {
    return "中风险";
  }

  return "低风险";
}

function riskTone(trust: DiscoverSkill["trust"]) {
  if (trust.riskLevel === "high") {
    return "danger";
  }

  if (trust.riskLevel === "medium") {
    return "warn";
  }

  return "good";
}

function sourceTone(source: DiscoverSkill) {
  return source.compatibility.includes("claude") ? "claude" : "codex";
}

function supportsLibrary(item: DiscoverItem, target: LibraryTab) {
  return item.compatibility.includes(target);
}

function installLabel(state: InstallState, supported: boolean) {
  if (!supported) {
    return "不兼容";
  }

  if (state === "enabled") {
    return "已安装";
  }

  if (state === "disabled") {
    return "已禁用";
  }

  return "安装";
}

function installTone(state: InstallState, supported: boolean) {
  if (!supported) {
    return "disabled";
  }

  if (state === "enabled") {
    return "good";
  }

  if (state === "disabled") {
    return "warn";
  }

  return "plain";
}

async function parseResponse(response: Response) {
  return (await response.json()) as Partial<ActionResponse> & {
    ok?: boolean;
    message?: string;
    detail?: SkillDetail;
  };
}

async function fetchDashboardData() {
  const response = await fetch("/api/dashboard", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("无法刷新技能面板。");
  }

  return (await response.json()) as DashboardData;
}

function Badge({
  tone,
  children,
}: {
  tone: "plain" | "good" | "warn" | "danger" | "claude" | "codex";
  children: React.ReactNode;
}) {
  return <span className={`mvp-badge mvp-badge-${tone}`}>{children}</span>;
}

function EmptyState({
  title,
  copy,
}: {
  title: string;
  copy: string;
}) {
  return (
    <div className="mvp-empty">
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

export function SkillStoreApp({ initialData }: SkillStoreAppProps) {
  const [data, setData] = useState(initialData);
  const [pageTab, setPageTab] = useState<PageTab>("discover");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("claude");
  const [search, setSearch] = useState("");
  const [compatibilityFilter, setCompatibilityFilter] =
    useState<CompatibilityFilter>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [libraryStateFilter, setLibraryStateFilter] =
    useState<LibraryStateFilter>("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawerTarget, setDrawerTarget] = useState<DrawerTarget | null>(null);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [detailsCache, setDetailsCache] = useState<Record<string, SkillDetail>>({});
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const discoverItems = useMemo(() => buildDiscoverItems(data), [data]);
  const libraryItems = useMemo(
    () => buildLibraryItems(data, libraryTab),
    [data, libraryTab],
  );
  const librarySummaries = useMemo(
    () =>
      data.librarySummaries.filter(
        (summary): summary is typeof summary & { id: LibraryTab } =>
          summary.id === "claude" || summary.id === "codex",
      ),
    [data.librarySummaries],
  );
  const activeSummary = useMemo(
    () => librarySummaries.find((summary) => summary.id === libraryTab) ?? null,
    [librarySummaries, libraryTab],
  );
  const availableTags = useMemo(
    () =>
      unique(
        Object.values(data.meta.records).flatMap((record) => record.generatedTags ?? []),
      ),
    [data.meta.records],
  );

  const filteredDiscover = useMemo(() => {
    return discoverItems.filter((item) => {
      if (
        compatibilityFilter !== "all" &&
        !item.compatibility.includes(compatibilityFilter)
      ) {
        return false;
      }

      if (riskFilter === "safe" && item.trust.riskLevel !== "low") {
        return false;
      }

      if (riskFilter === "scripted" && !item.trust.hasScripts) {
        return false;
      }

      if (riskFilter === "high" && item.trust.riskLevel !== "high") {
        return false;
      }

      if (selectedTag && !item.tags.includes(selectedTag)) {
        return false;
      }

      if (!deferredSearch) {
        return true;
      }

      return [
        item.name,
        item.description,
        ...item.tags,
        ...item.compatibility,
        ...item.discoverSources.map((entry) => entry.discoverSourceLabel),
      ]
        .join(" ")
        .toLowerCase()
        .includes(deferredSearch);
    });
  }, [
    compatibilityFilter,
    deferredSearch,
    discoverItems,
    riskFilter,
    selectedTag,
  ]);

  const filteredLibrary = useMemo(() => {
    return libraryItems.filter((item) => {
      if (libraryStateFilter !== "all" && item.state !== libraryStateFilter) {
        return false;
      }

      if (selectedTag && !item.tags.includes(selectedTag)) {
        return false;
      }

      if (!deferredSearch) {
        return true;
      }

      return [
        item.name,
        item.description,
        item.record.relativePath,
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(deferredSearch);
    });
  }, [deferredSearch, libraryItems, libraryStateFilter, selectedTag]);

  const featuredDiscover = filteredDiscover.slice(0, 6);
  const discoverTaggedCount = filteredDiscover.filter((item) => item.tags.length > 0).length;
  const libraryTaggedCount = filteredLibrary.filter((item) => item.tags.length > 0).length;
  const libraryScriptedCount = filteredLibrary.filter((item) => item.trust.hasScripts).length;
  const currentScopeIds = unique(
    (pageTab === "discover" ? filteredDiscover : filteredLibrary).map((item) => item.id),
  );

  async function applyDashboard(nextData: DashboardData) {
    startTransition(() => {
      setData(nextData);
      setSelectedIds([]);
    });
  }

  async function runAction(
    endpoint: string,
    body: unknown,
    key: string,
    successText: string,
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

      await applyDashboard(payload.dashboard);
      setNotice({ kind: "success", text: successText });
      return true;
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "发生未知错误。",
      });
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const nextDashboard = await fetchDashboardData();

        if (!cancelled) {
          await applyDashboard(nextDashboard);
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

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [libraryTab, libraryStateFilter, pageTab]);

  const drawerSources = useMemo(() => {
    if (!drawerTarget) {
      return [];
    }

    if (drawerTarget.kind === "discover") {
      const item = discoverItems.find((entry) => entry.id === drawerTarget.skillId);

      if (!item) {
        return [];
      }

      return item.discoverSources.map((source) => ({
        key: `discover:${source.discoverSourceId}:${source.id}`,
        label: source.discoverSourceLabel,
        sourceId: source.discoverSourceId,
        skillId: source.id,
        locationType: "discover" as const,
      }));
    }

    const item = libraryItems.find(
      (entry) =>
        entry.id === drawerTarget.skillId && entry.libraryId === drawerTarget.libraryId,
    );

    if (!item) {
      return [];
    }

    return [
      {
        key: `library:${item.libraryId}:${item.id}`,
        label: `${getLibraryLabel(item.libraryId)} 已安装版本`,
        sourceId: item.libraryId,
        skillId: item.id,
        locationType: "library" as const,
      },
      ...item.discoverSources.map((source) => ({
        key: `discover:${source.discoverSourceId}:${source.id}`,
        label: source.discoverSourceLabel,
        sourceId: source.discoverSourceId,
        skillId: source.id,
        locationType: "discover" as const,
      })),
    ];
  }, [discoverItems, drawerTarget, libraryItems]);

  useEffect(() => {
    if (!drawerSources.length) {
      setPreviewKey(null);
      return;
    }

    if (!previewKey || !drawerSources.some((source) => source.key === previewKey)) {
      setPreviewKey(drawerSources[0].key);
    }
  }, [drawerSources, previewKey]);

  const activePreview = drawerSources.find((source) => source.key === previewKey) ?? null;
  const detailCacheKey = activePreview
    ? `${activePreview.locationType}:${activePreview.sourceId}:${activePreview.skillId}`
    : null;
  const activeDetail = detailCacheKey ? detailsCache[detailCacheKey] : undefined;
  const activeDrawerDiscoverItem =
    drawerTarget?.kind === "discover"
      ? discoverItems.find((item) => item.id === drawerTarget.skillId) ?? null
      : null;
  const activeDrawerLibraryItem =
    drawerTarget?.kind === "library"
      ? libraryItems.find(
          (item) =>
            item.id === drawerTarget.skillId && item.libraryId === drawerTarget.libraryId,
        ) ?? null
      : null;

  useEffect(() => {
    if (!activePreview || !detailCacheKey || detailsCache[detailCacheKey]) {
      return;
    }

    let cancelled = false;
    const cacheKey = detailCacheKey;
    const preview = activePreview;

    async function loadDetail() {
      setBusyKey(`detail:${cacheKey}`);

      try {
        const response = await fetch(
          `/api/skills/detail?skillId=${encodeURIComponent(
            preview.skillId,
          )}&sourceId=${encodeURIComponent(
            preview.sourceId,
          )}&locationType=${preview.locationType}`,
          { cache: "no-store" },
        );
        const payload = await parseResponse(response);

        if (!response.ok || !payload.ok || !payload.detail) {
          throw new Error(payload.message ?? "详情加载失败。");
        }

        if (!cancelled) {
          setDetailsCache((current) => ({
            ...current,
            [cacheKey]: payload.detail as SkillDetail,
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setNotice({
            kind: "error",
            text: error instanceof Error ? error.message : "详情加载失败。",
          });
        }
      } finally {
        if (!cancelled) {
          setBusyKey(null);
        }
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [activePreview, detailCacheKey, detailsCache]);

  async function installToLibrary(item: DiscoverItem, target: LibraryTab) {
    if (!supportsLibrary(item, target)) {
      setNotice({
        kind: "error",
        text: `${item.name} 当前没有 ${getLibraryLabel(target)} 兼容来源。`,
      });
      return;
    }

    const preferredSource = item.discoverSources.find((source) =>
      source.compatibility.includes(target),
    );

    if (!preferredSource) {
      setNotice({
        kind: "error",
        text: `${item.name} 当前没有 ${getLibraryLabel(target)} 兼容来源。`,
      });
      return;
    }

    await runAction(
      "/api/actions/install-discover",
      {
        skillId: item.id,
        discoverSourceId: preferredSource.discoverSourceId,
        libraryId: target,
      },
      `install:${item.id}:${target}`,
      `已把 ${item.name} 安装到 ${getLibraryLabel(target)}。`,
    );
  }

  async function toggleLibraryState(item: LibraryItem, enabled: boolean) {
    await runAction(
      "/api/actions/library-state",
      {
        skillId: item.id,
        libraryId: item.libraryId,
        enabled,
      },
      `library-state:${item.id}:${item.libraryId}:${enabled}`,
      enabled ? `已启用 ${item.name}。` : `已禁用 ${item.name}。`,
    );
  }

  async function uninstallLibraryItem(item: LibraryItem) {
    if (!window.confirm(`确认卸载 ${item.name} 吗？`)) {
      return;
    }

    await runAction(
      "/api/actions/remove-library",
      {
        skillId: item.id,
        libraryId: item.libraryId,
      },
      `uninstall:${item.id}:${item.libraryId}`,
      `已卸载 ${item.name}。`,
    );
  }

  async function generateTags(skillIds: string[]) {
    if (skillIds.length === 0) {
      return;
    }

    await runAction(
      "/api/actions/ai-tags",
      {
        skillIds,
      },
      `ai-tags:${skillIds.join(",")}`,
      "AI 智能标签已生成。",
    );
  }

  async function batchLibraryAction(action: "enable" | "disable" | "uninstall" | "ai-tags") {
    const targets = filteredLibrary.filter((item) => selectedIds.includes(item.id));

    if (targets.length === 0) {
      return;
    }

    if (action === "ai-tags") {
      await generateTags(targets.map((item) => item.id));
      return;
    }

    setBusyKey(`batch:${action}`);
    setNotice(null);

    try {
      for (const item of targets) {
        if (action === "enable") {
          await fetch("/api/actions/library-state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              skillId: item.id,
              libraryId: item.libraryId,
              enabled: true,
            }),
          });
        }

        if (action === "disable") {
          await fetch("/api/actions/library-state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              skillId: item.id,
              libraryId: item.libraryId,
              enabled: false,
            }),
          });
        }

        if (action === "uninstall") {
          await fetch("/api/actions/remove-library", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              skillId: item.id,
              libraryId: item.libraryId,
            }),
          });
        }
      }

      const nextDashboard = await fetchDashboardData();
      await applyDashboard(nextDashboard);
      setNotice({
        kind: "success",
        text:
          action === "enable"
            ? "批量启用完成。"
            : action === "disable"
              ? "批量禁用完成。"
              : "批量卸载完成。",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "批量操作失败。",
      });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <main className="mvp-shell">
      <header className="mvp-topbar">
        <div className="mvp-brand">
          <div className="mvp-logo">千</div>
          <div>
            <strong>千逐 Skill 管理器</strong>
            <span>Discover / Install / Library / Batch / Trust</span>
          </div>
        </div>

        <nav className="mvp-nav">
          <button
            type="button"
            className={pageTab === "discover" ? "active" : ""}
            onClick={() => setPageTab("discover")}
          >
            Discover
          </button>
          <button
            type="button"
            className={pageTab === "library" ? "active" : ""}
            onClick={() => setPageTab("library")}
          >
            Library
          </button>
        </nav>

        <div className="mvp-tools">
          <label className="mvp-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索 Claude Code / Codex skills 的名称、用途或 AI 标签…"
            />
          </label>
          <button
            type="button"
            className="mvp-primary-button"
            disabled={
              (busyKey?.startsWith("ai-tags") ?? false) || currentScopeIds.length === 0
            }
            onClick={() => void generateTags(currentScopeIds)}
          >
            {busyKey?.startsWith("ai-tags") ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Sparkles size={16} />
            )}
            AI 智能打标
          </button>
          <div className="mvp-avatar">
            <UserCircle2 size={22} />
          </div>
        </div>
      </header>

      <div className="mvp-body">
        <aside className="mvp-sidebar">
          {pageTab === "discover" ? (
            <>
              <section className="mvp-sidebar-card">
                <h3>发现范围</h3>
                <button
                  type="button"
                  className={compatibilityFilter === "all" ? "active" : ""}
                  onClick={() => setCompatibilityFilter("all")}
                >
                  全部技能
                  <strong>{discoverItems.length}</strong>
                </button>
                <button
                  type="button"
                  className={compatibilityFilter === "claude" ? "active" : ""}
                  onClick={() => setCompatibilityFilter("claude")}
                >
                  Claude Code
                  <strong>
                    {
                      discoverItems.filter((item) => item.compatibility.includes("claude"))
                        .length
                    }
                  </strong>
                </button>
                <button
                  type="button"
                  className={compatibilityFilter === "codex" ? "active" : ""}
                  onClick={() => setCompatibilityFilter("codex")}
                >
                  Codex
                  <strong>
                    {
                      discoverItems.filter((item) => item.compatibility.includes("codex"))
                        .length
                    }
                  </strong>
                </button>
                <p className="mvp-sidebar-note">
                  Discover 只负责“看懂和安装”，不再混入云端、镜像、同步中心这些概念。
                </p>
              </section>

              <section className="mvp-sidebar-card">
                <h3>Trust Layer</h3>
                <button
                  type="button"
                  className={riskFilter === "all" ? "active" : ""}
                  onClick={() => setRiskFilter("all")}
                >
                  全部风险级别
                </button>
                <button
                  type="button"
                  className={riskFilter === "safe" ? "active" : ""}
                  onClick={() => setRiskFilter("safe")}
                >
                  低风险
                </button>
                <button
                  type="button"
                  className={riskFilter === "scripted" ? "active" : ""}
                  onClick={() => setRiskFilter("scripted")}
                >
                  含脚本
                </button>
                <button
                  type="button"
                  className={riskFilter === "high" ? "active" : ""}
                  onClick={() => setRiskFilter("high")}
                >
                  高风险
                </button>
                <p className="mvp-sidebar-note">
                  卡片会明确展示来源、兼容性、是否含脚本和风险等级，再决定装不装。
                </p>
              </section>

              <section className="mvp-sidebar-card">
                <div className="mvp-sidebar-title">
                  <Tags size={14} />
                  AI 标签
                </div>
                <div className="mvp-tag-cloud">
                  {availableTags.length === 0 ? (
                    <p>还没有 AI 标签。点右上角 `AI 智能打标` 生成。</p>
                  ) : (
                    availableTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={selectedTag === tag ? "active" : ""}
                        onClick={() =>
                          setSelectedTag((current) => (current === tag ? null : tag))
                        }
                      >
                        {tag}
                      </button>
                    ))
                  )}
                </div>
                <p className="mvp-sidebar-note">
                  这里只保留语义标签，不会把 `Claude`、`Codex`、`含脚本` 这类状态硬塞进内容标签。
                </p>
              </section>
            </>
          ) : (
            <>
              <section className="mvp-sidebar-card">
                <h3>已安装库</h3>
                {librarySummaries.map((summary) => (
                  <div key={summary.id} className="mvp-library-switch">
                    <button
                      type="button"
                      className={libraryTab === summary.id ? "active" : ""}
                      onClick={() => setLibraryTab(summary.id)}
                    >
                      {getLibraryLabel(summary.id)}
                      <strong>{summary.enabledCount + summary.disabledCount}</strong>
                    </button>
                    <p className="mvp-sidebar-meta">
                      启用 {summary.enabledCount} · 禁用 {summary.disabledCount}
                    </p>
                  </div>
                ))}
              </section>

              <section className="mvp-sidebar-card">
                <h3>管理状态</h3>
                <button
                  type="button"
                  className={libraryStateFilter === "all" ? "active" : ""}
                  onClick={() => setLibraryStateFilter("all")}
                >
                  全部
                  <strong>{libraryItems.length}</strong>
                </button>
                <button
                  type="button"
                  className={libraryStateFilter === "enabled" ? "active" : ""}
                  onClick={() => setLibraryStateFilter("enabled")}
                >
                  已启用
                  <strong>
                    {libraryItems.filter((item) => item.state === "enabled").length}
                  </strong>
                </button>
                <button
                  type="button"
                  className={libraryStateFilter === "disabled" ? "active" : ""}
                  onClick={() => setLibraryStateFilter("disabled")}
                >
                  已禁用
                  <strong>
                    {libraryItems.filter((item) => item.state === "disabled").length}
                  </strong>
                </button>
                <p className="mvp-sidebar-note">
                  Library 只管理本机已安装 skills，支持批量启用、禁用、卸载和 AI 打标。
                </p>
              </section>

              <section className="mvp-sidebar-card">
                <div className="mvp-sidebar-title">
                  <Tags size={14} />
                  AI 标签
                </div>
                <div className="mvp-tag-cloud">
                  {availableTags.length === 0 ? (
                    <p>先点右上角 `AI 智能打标`，再用标签筛选已安装库。</p>
                  ) : (
                    availableTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={selectedTag === tag ? "active" : ""}
                        onClick={() =>
                          setSelectedTag((current) => (current === tag ? null : tag))
                        }
                      >
                        {tag}
                      </button>
                    ))
                  )}
                </div>
                <p className="mvp-sidebar-note">
                  AI 标签用来管理主题和用途，不承担兼容性、来源或风险提示的职责。
                </p>
              </section>
            </>
          )}
        </aside>

        <section className="mvp-main">
          {notice ? (
            <div className={`mvp-notice mvp-notice-${notice.kind}`}>{notice.text}</div>
          ) : null}

          {pageTab === "discover" ? (
            <>
              <section className="mvp-hero">
                <div>
                  <span>DISCOVER</span>
                  <h1>先看懂 skill 是干嘛的，再一键安装到正确的端</h1>
                  <p>
                    Discover 现在就是一个轻量应用商店。你先看用途、兼容性、来源和风险，再决定安装到
                    Claude Code 还是 Codex，默认隐藏目录和配置细节。
                  </p>
                </div>
                <div className="mvp-hero-metrics">
                  <article>
                    <strong>{filteredDiscover.length}</strong>
                    <span>可发现技能</span>
                  </article>
                  <article>
                    <strong>
                      {
                        filteredDiscover.filter((item) =>
                          item.compatibility.includes("claude"),
                        ).length
                      }
                    </strong>
                    <span>兼容 Claude</span>
                  </article>
                  <article>
                    <strong>
                      {
                        filteredDiscover.filter((item) =>
                          item.compatibility.includes("codex"),
                        ).length
                      }
                    </strong>
                    <span>兼容 Codex</span>
                  </article>
                  <article>
                    <strong>{discoverTaggedCount}</strong>
                    <span>已生成 AI 标签</span>
                  </article>
                </div>
              </section>

              <section className="mvp-featured-grid">
                {featuredDiscover.map((item) => (
                  <article key={item.id} className="mvp-discover-card featured">
                    <div className="mvp-card-head">
                      <div>
                        <strong>/{item.name}</strong>
                        <p>{item.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDrawerTarget({ kind: "discover", skillId: item.id })
                        }
                      >
                        <Eye size={15} />
                      </button>
                    </div>
                    <div className="mvp-card-badges">
                      {item.discoverSources.map((source) => (
                        <Badge
                          key={`${item.id}:${source.discoverSourceId}`}
                          tone={sourceTone(source)}
                        >
                          {source.compatibility.includes("claude")
                            ? "Claude 来源"
                            : "Codex 来源"}
                        </Badge>
                      ))}
                      <Badge tone={riskTone(item.trust)}>{riskLabel(item.trust)}</Badge>
                      {item.trust.hasScripts ? <Badge tone="danger">含脚本</Badge> : null}
                    </div>
                    <div className="mvp-card-tags">
                      {item.tags.length > 0 ? (
                        item.tags.map((tag) => <span key={tag}>{tag}</span>)
                      ) : (
                        <span className="muted">未生成 AI 标签</span>
                      )}
                    </div>
                    <div className="mvp-install-row">
                      <button
                        type="button"
                        className={`tone-${installTone(
                          item.installState.claude,
                          supportsLibrary(item, "claude"),
                        )}`}
                        disabled={!supportsLibrary(item, "claude")}
                        onClick={() => void installToLibrary(item, "claude")}
                      >
                        <Download size={14} />
                        {installLabel(
                          item.installState.claude,
                          supportsLibrary(item, "claude"),
                        )}{" "}
                        Claude
                      </button>
                      <button
                        type="button"
                        className={`tone-${installTone(
                          item.installState.codex,
                          supportsLibrary(item, "codex"),
                        )}`}
                        disabled={!supportsLibrary(item, "codex")}
                        onClick={() => void installToLibrary(item, "codex")}
                      >
                        <Download size={14} />
                        {installLabel(
                          item.installState.codex,
                          supportsLibrary(item, "codex"),
                        )}{" "}
                        Codex
                      </button>
                    </div>
                  </article>
                ))}
              </section>

              <section className="mvp-section">
                <div className="mvp-section-head">
                  <div>
                    <span>ALL SKILLS</span>
                    <h2>应用商店视图</h2>
                  </div>
                </div>

                {filteredDiscover.length === 0 ? (
                  <EmptyState
                    title="没有匹配的 skills"
                    copy="换个搜索词，或者先点一次 AI 智能打标。"
                  />
                ) : (
                  <div className="mvp-discover-grid">
                    {filteredDiscover.map((item) => (
                      <article key={item.id} className="mvp-discover-card">
                        <div className="mvp-card-head">
                          <div>
                            <strong>/{item.name}</strong>
                            <p>{item.description}</p>
                          </div>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() =>
                              setDrawerTarget({ kind: "discover", skillId: item.id })
                            }
                          >
                            查看
                          </button>
                        </div>

                        <div className="mvp-card-badges">
                          {item.compatibility.includes("claude") ? (
                            <Badge tone="claude">Claude Code</Badge>
                          ) : null}
                          {item.compatibility.includes("codex") ? (
                            <Badge tone="codex">Codex</Badge>
                          ) : null}
                          <Badge tone={riskTone(item.trust)}>{riskLabel(item.trust)}</Badge>
                          {item.trust.hasScripts ? (
                            <Badge tone="danger">含脚本</Badge>
                          ) : (
                            <Badge tone="good">无脚本</Badge>
                          )}
                          {item.trust.hasPackageJson ? (
                            <Badge tone="warn">package.json</Badge>
                          ) : null}
                        </div>

                        <div className="mvp-card-tags">
                          {item.tags.length > 0 ? (
                            item.tags.map((tag) => <span key={tag}>{tag}</span>)
                          ) : (
                            <span className="muted">未生成 AI 标签</span>
                          )}
                        </div>

                        <div className="mvp-install-row">
                          <button
                            type="button"
                            className={`tone-${installTone(
                              item.installState.claude,
                              supportsLibrary(item, "claude"),
                            )}`}
                            disabled={!supportsLibrary(item, "claude")}
                            onClick={() => void installToLibrary(item, "claude")}
                          >
                            {installLabel(
                              item.installState.claude,
                              supportsLibrary(item, "claude"),
                            )}{" "}
                            Claude
                          </button>
                          <button
                            type="button"
                            className={`tone-${installTone(
                              item.installState.codex,
                              supportsLibrary(item, "codex"),
                            )}`}
                            disabled={!supportsLibrary(item, "codex")}
                            onClick={() => void installToLibrary(item, "codex")}
                          >
                            {installLabel(
                              item.installState.codex,
                              supportsLibrary(item, "codex"),
                            )}{" "}
                            Codex
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}

          {pageTab === "library" ? (
            <>
              <section className="mvp-hero compact">
                <div>
                  <span>LIBRARY</span>
                  <h1>把 Claude Code 和 Codex 分开管理，不再混淆</h1>
                  <p>
                    Library 只显示本机已安装的 skills。这里负责批量启用、批量禁用、批量卸载和
                    AI 智能打标，方便你把两个端的技能库管干净。
                  </p>
                </div>
                <div className="mvp-hero-metrics">
                  <article>
                    <strong>{activeSummary?.enabledCount ?? 0}</strong>
                    <span>已启用</span>
                  </article>
                  <article>
                    <strong>{activeSummary?.disabledCount ?? 0}</strong>
                    <span>已禁用</span>
                  </article>
                  <article>
                    <strong>{libraryScriptedCount}</strong>
                    <span>含脚本</span>
                  </article>
                  <article>
                    <strong>{libraryTaggedCount}</strong>
                    <span>已有 AI 标签</span>
                  </article>
                </div>
              </section>

              <div className="mvp-library-tabs">
                <button
                  type="button"
                  className={libraryTab === "claude" ? "active" : ""}
                  onClick={() => setLibraryTab("claude")}
                >
                  Claude Code
                </button>
                <button
                  type="button"
                  className={libraryTab === "codex" ? "active" : ""}
                  onClick={() => setLibraryTab("codex")}
                >
                  Codex
                </button>
              </div>

              <div className="mvp-library-filters">
                <button
                  type="button"
                  className={libraryStateFilter === "all" ? "active" : ""}
                  onClick={() => setLibraryStateFilter("all")}
                >
                  全部
                </button>
                <button
                  type="button"
                  className={libraryStateFilter === "enabled" ? "active" : ""}
                  onClick={() => setLibraryStateFilter("enabled")}
                >
                  已启用
                </button>
                <button
                  type="button"
                  className={libraryStateFilter === "disabled" ? "active" : ""}
                  onClick={() => setLibraryStateFilter("disabled")}
                >
                  已禁用
                </button>
              </div>

              {selectedIds.length > 0 ? (
                <div className="mvp-batch-bar">
                  <span>已选中 {selectedIds.length} 个 skills</span>
                  <div className="mvp-inline-actions">
                    <button type="button" onClick={() => void batchLibraryAction("enable")}>
                      批量启用
                    </button>
                    <button type="button" onClick={() => void batchLibraryAction("disable")}>
                      批量禁用
                    </button>
                    <button type="button" onClick={() => void batchLibraryAction("uninstall")}>
                      批量卸载
                    </button>
                    <button type="button" onClick={() => void batchLibraryAction("ai-tags")}>
                      AI 打标
                    </button>
                  </div>
                </div>
              ) : null}

              <section className="mvp-section">
                {filteredLibrary.length === 0 ? (
                  <EmptyState
                    title="这个技能库里还没有匹配的 skills"
                    copy="你可以先去 Discover 安装，或者切换 Claude / Codex 查看。"
                  />
                ) : (
                  <div className="mvp-table-wrap">
                    <table className="mvp-table">
                      <thead>
                        <tr>
                          <th />
                          <th>Skill</th>
                          <th>用途</th>
                          <th>AI 标签</th>
                          <th>Trust</th>
                          <th>状态</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLibrary.map((item) => (
                          <tr key={`${item.libraryId}:${item.id}`}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(item.id)}
                                onChange={() =>
                                  setSelectedIds((current) =>
                                    current.includes(item.id)
                                      ? current.filter((entry) => entry !== item.id)
                                      : [...current, item.id],
                                  )
                                }
                              />
                            </td>
                            <td>
                              <div className="mvp-table-primary">
                                <strong>/{item.name}</strong>
                                <span>{item.record.relativePath}</span>
                              </div>
                            </td>
                            <td>{item.description}</td>
                            <td>
                              <div className="mvp-inline-tags">
                                {item.tags.length > 0 ? (
                                  item.tags.map((tag) => <span key={tag}>{tag}</span>)
                                ) : (
                                  <span className="muted">暂无</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="mvp-inline-badges">
                                <Badge tone={riskTone(item.trust)}>{riskLabel(item.trust)}</Badge>
                                {item.trust.hasScripts ? (
                                  <Badge tone="danger">含脚本</Badge>
                                ) : (
                                  <Badge tone="good">无脚本</Badge>
                                )}
                              </div>
                            </td>
                            <td>
                              <Badge tone={item.state === "enabled" ? "good" : "warn"}>
                                {item.state === "enabled" ? "已启用" : "已禁用"}
                              </Badge>
                            </td>
                            <td>
                              <div className="mvp-inline-actions">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDrawerTarget({
                                      kind: "library",
                                      skillId: item.id,
                                      libraryId: item.libraryId,
                                    })
                                  }
                                >
                                  查看
                                </button>
                                {item.state === "enabled" ? (
                                  <button
                                    type="button"
                                    onClick={() => void toggleLibraryState(item, false)}
                                  >
                                    禁用
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void toggleLibraryState(item, true)}
                                  >
                                    启用
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void generateTags([item.id])}
                                >
                                  AI 标签
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => void uninstallLibraryItem(item)}
                                >
                                  卸载
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </section>
      </div>

      {drawerTarget ? (
        <div className="mvp-drawer-backdrop" onClick={() => setDrawerTarget(null)}>
          <aside className="mvp-drawer" onClick={(event) => event.stopPropagation()}>
            <header className="mvp-drawer-head">
              <div>
                <span>SKILL DETAIL</span>
                <h2>/{activeDetail?.skill.name ?? drawerTarget.skillId}</h2>
                <p>{activeDetail?.skill.description ?? "正在加载 skill 详情…"}</p>
              </div>
              <button
                type="button"
                className="mvp-icon-button"
                onClick={() => setDrawerTarget(null)}
              >
                <X size={16} />
              </button>
            </header>

            <div className="mvp-preview-tabs">
              {drawerSources.map((source) => (
                <button
                  key={source.key}
                  type="button"
                  className={previewKey === source.key ? "active" : ""}
                  onClick={() => setPreviewKey(source.key)}
                >
                  {source.label}
                </button>
              ))}
            </div>

            {activeDetail ? (
              <>
                <div className="mvp-trust-strip">
                  <Badge tone={riskTone(activeDetail.skill.trust)}>
                    {riskLabel(activeDetail.skill.trust)}
                  </Badge>
                  {activeDetail.skill.compatibility.includes("claude") ? (
                    <Badge tone="claude">Claude Code</Badge>
                  ) : null}
                  {activeDetail.skill.compatibility.includes("codex") ? (
                    <Badge tone="codex">Codex</Badge>
                  ) : null}
                  {activeDetail.skill.trust.hasScripts ? (
                    <Badge tone="danger">
                      <AlertTriangle size={12} />
                      含脚本
                    </Badge>
                  ) : (
                    <Badge tone="good">
                      <ShieldCheck size={12} />
                      低执行风险
                    </Badge>
                  )}
                </div>

                <div className="mvp-info-grid">
                  <article className="mvp-info-card">
                    <span>当前来源</span>
                    <strong>{activePreview?.label ?? "未知来源"}</strong>
                  </article>
                  <article className="mvp-info-card">
                    <span>兼容端</span>
                    <strong>
                      {activeDetail.skill.compatibility
                        .map((entry) =>
                          entry === "claude" ? "Claude Code" : entry === "codex" ? "Codex" : entry,
                        )
                        .join(" / ")}
                    </strong>
                  </article>
                  <article className="mvp-info-card">
                    <span>文件数量</span>
                    <strong>{activeDetail.totalFiles}</strong>
                  </article>
                  <article className="mvp-info-card">
                    <span>最近更新</span>
                    <strong>{new Date(activeDetail.skill.updatedAt).toLocaleDateString()}</strong>
                  </article>
                </div>

                <div className="mvp-card-tags drawer">
                  {getMetaTags(data, activeDetail.skill.id).length > 0 ? (
                    getMetaTags(data, activeDetail.skill.id).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))
                  ) : (
                    <span className="muted">还没有 AI 标签</span>
                  )}
                </div>

                <div className="mvp-drawer-actions">
                  {drawerTarget.kind === "discover" && activeDrawerDiscoverItem ? (
                    <>
                      <button
                        type="button"
                        disabled={!supportsLibrary(activeDrawerDiscoverItem, "claude")}
                        className={`tone-${installTone(
                          activeDrawerDiscoverItem.installState.claude,
                          supportsLibrary(activeDrawerDiscoverItem, "claude"),
                        )}`}
                        onClick={() => void installToLibrary(activeDrawerDiscoverItem, "claude")}
                      >
                        安装到 Claude
                      </button>
                      <button
                        type="button"
                        disabled={!supportsLibrary(activeDrawerDiscoverItem, "codex")}
                        className={`tone-${installTone(
                          activeDrawerDiscoverItem.installState.codex,
                          supportsLibrary(activeDrawerDiscoverItem, "codex"),
                        )}`}
                        onClick={() => void installToLibrary(activeDrawerDiscoverItem, "codex")}
                      >
                        安装到 Codex
                      </button>
                    </>
                  ) : null}

                  {drawerTarget.kind === "library" && activeDrawerLibraryItem ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          void toggleLibraryState(
                            activeDrawerLibraryItem,
                            activeDrawerLibraryItem.state !== "enabled",
                          )
                        }
                      >
                        {activeDrawerLibraryItem.state === "enabled" ? "禁用" : "启用"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void uninstallLibraryItem(activeDrawerLibraryItem)}
                      >
                        卸载
                      </button>
                    </>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void generateTags([activeDetail.skill.id])}
                  >
                    <Sparkles size={14} />
                    AI 智能打标
                  </button>
                </div>

                <div className="mvp-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {activeDetail.readmeMarkdown ?? activeDetail.skillMarkdown}
                  </ReactMarkdown>
                </div>
              </>
            ) : (
              <div className="mvp-loading">
                <LoaderCircle size={22} className="spin" />
                正在加载详情…
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </main>
  );
}
