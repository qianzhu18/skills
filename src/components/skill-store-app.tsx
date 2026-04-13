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
  ArrowRightLeft,
  Blocks,
  Bot,
  CheckCircle2,
  CloudDownload,
  CloudUpload,
  FileCode2,
  FileJson2,
  Files,
  GitBranch,
  LayoutDashboard,
  Layers3,
  Link2,
  Moon,
  PackageSearch,
  Radar,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { ActionButton } from "@/components/action-button";
import type {
  ActionResponse,
  CatalogSkill,
  DashboardData,
  LibrarySummary,
  SkillDetail,
  WorkspaceSkill,
} from "@/lib/skillhub-types";

type SkillStoreAppProps = {
  initialData: DashboardData;
};

type ActiveView = "skills" | "similar" | "dashboard" | "sync" | "trash";
type ScopeFilter = "all" | "local" | "catalog";
type StatusFilter = "all" | "local" | "agents" | "pending" | "changed" | "synced";
type GroupBy = "library" | "source" | "flat";
type DetailTab = "overview" | "skill" | "readme" | "files" | "package" | "manifest";
type SyncLocationState = "mirrored" | "synced" | "drift" | "local-only" | "missing";

type StoreSkill = {
  record: WorkspaceSkill | CatalogSkill;
  key: string;
  id: string;
  name: string;
  description: string;
  shortDescription: string;
  sourceId: string;
  sourceLabel: string;
  agentLabel: string;
  agentIcon: string;
  sourceBadge: string;
  scopeLabel: string;
  statusLabel: string;
  statusTone: "good" | "warn" | "plain" | "soft";
  locationType: "library" | "catalog";
  homepage?: string;
  updatedAt: string;
  fileCount: number;
  sizeBytes: number;
  hash: string;
};

type SyncMatrixCell = {
  locationId: string;
  locationLabel: string;
  state: SyncLocationState;
  updatedAt?: string;
};

type SyncMatrixRow = {
  id: string;
  name: string;
  description: string;
  status: "aligned" | "mirror-missing" | "drift" | "partial" | "mirror-only";
  recommendation: string;
  distinctVersions: number;
  locations: SyncMatrixCell[];
};

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusClass(tone: StoreSkill["statusTone"]) {
  if (tone === "good") {
    return "hub-badge-good";
  }

  if (tone === "warn") {
    return "hub-badge-warn";
  }

  if (tone === "soft") {
    return "hub-badge-soft";
  }

  return "hub-badge-plain";
}

function workspaceStatus(skill: WorkspaceSkill) {
  if (skill.catalogStatus === "synced") {
    return { label: "已同步", tone: "good" as const };
  }

  if (skill.catalogStatus === "changed") {
    return { label: "有更新", tone: "warn" as const };
  }

  return { label: "待备份", tone: "plain" as const };
}

function getAgentMeta(sourceId: string) {
  if (sourceId === "claude") {
    return { icon: "🤖", label: "Claude Code" };
  }

  if (sourceId === "codex") {
    return { icon: "◼", label: "Codex" };
  }

  if (sourceId === "agents") {
    return { icon: "🌐", label: "Universal" };
  }

  if (sourceId === "catalog") {
    return { icon: "☁", label: "Cloud Mirror" };
  }

  return { icon: "📦", label: sourceId };
}

function buildStoreSkills(data: DashboardData): StoreSkill[] {
  const localSkills = data.workspaceSkills.map((skill) => {
    const agent = getAgentMeta(skill.sourceId);
    const status = workspaceStatus(skill);

    return {
      record: skill,
      key: `${skill.sourceId}:${skill.id}:${skill.path}`,
      id: skill.id,
      name: skill.name,
      description: skill.description,
      shortDescription: skill.shortDescription,
      sourceId: skill.sourceId,
      sourceLabel: skill.sourceLabel,
      agentLabel: agent.label,
      agentIcon: agent.icon,
      sourceBadge: "local",
      scopeLabel: "全局",
      statusLabel: status.label,
      statusTone: status.tone,
      locationType: "library" as const,
      homepage: skill.homepage,
      updatedAt: skill.updatedAt,
      fileCount: skill.fileCount,
      sizeBytes: skill.sizeBytes,
      hash: skill.hash,
    };
  });

  const catalogSkills = data.catalogSkills.map((skill) => {
    const hasUpdates = skill.installations.some(
      (installation) => installation.status === "update-available",
    );
    const hasMissing = skill.installations.some(
      (installation) => installation.status === "missing",
    );
    const statusLabel = hasUpdates ? "可更新" : hasMissing ? "待安装" : "已安装";
    const statusTone: StoreSkill["statusTone"] = hasUpdates
      ? "warn"
      : hasMissing
        ? "plain"
        : "good";

    return {
      record: skill,
      key: `catalog:${skill.id}:${skill.path}`,
      id: skill.id,
      name: skill.name,
      description: skill.description,
      shortDescription: skill.shortDescription,
      sourceId: "catalog",
      sourceLabel: skill.sourceLabel,
      agentLabel: "Cloud Mirror",
      agentIcon: "☁",
      sourceBadge: "agents",
      scopeLabel: "云端",
      statusLabel,
      statusTone,
      locationType: "catalog" as const,
      homepage: skill.homepage,
      updatedAt: skill.updatedAt,
      fileCount: skill.fileCount,
      sizeBytes: skill.sizeBytes,
      hash: skill.hash,
    };
  });

  return [...localSkills, ...catalogSkills].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function buildDuplicateGroups(skills: StoreSkill[]) {
  const byName = new Map<string, StoreSkill[]>();

  for (const skill of skills) {
    const key = skill.id.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), skill]);
  }

  return Array.from(byName.entries())
    .filter(([, group]) => group.length > 1)
    .map(([id, group]) => ({
      id,
      label: group[0]?.name ?? id,
      skills: group,
    }))
    .sort((left, right) => right.skills.length - left.skills.length);
}

function matchesSearch(query: string, skill: StoreSkill) {
  if (!query) {
    return true;
  }

  const record = skill.record;
  const haystack = [
    skill.id,
    skill.name,
    skill.description,
    skill.sourceLabel,
    skill.agentLabel,
    skill.statusLabel,
    record.version,
    ...record.commands,
    ...record.triggers,
    ...record.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function syncRowTone(status: SyncMatrixRow["status"]) {
  if (status === "aligned") {
    return "hub-badge-good";
  }

  if (status === "partial") {
    return "hub-badge-soft";
  }

  return "hub-badge-warn";
}

function syncRowLabel(status: SyncMatrixRow["status"]) {
  if (status === "aligned") {
    return "已对齐";
  }

  if (status === "partial") {
    return "部分安装";
  }

  if (status === "mirror-only") {
    return "仅云端有";
  }

  if (status === "mirror-missing") {
    return "未备份";
  }

  return "存在差异";
}

function syncCellTone(state: SyncLocationState) {
  if (state === "synced" || state === "mirrored") {
    return "hub-badge-good";
  }

  if (state === "drift") {
    return "hub-badge-warn";
  }

  if (state === "local-only") {
    return "hub-badge-soft";
  }

  return "hub-badge-plain";
}

function syncCellLabel(state: SyncLocationState) {
  if (state === "mirrored") {
    return "已镜像";
  }

  if (state === "synced") {
    return "一致";
  }

  if (state === "drift") {
    return "有差异";
  }

  if (state === "local-only") {
    return "仅本地";
  }

  return "缺失";
}

function buildSyncMatrix(data: DashboardData, query: string): SyncMatrixRow[] {
  const libraries = data.config.libraries;
  const catalogById = new Map(data.catalogSkills.map((skill) => [skill.id, skill]));
  const workspaceByLibrary = new Map<string, Map<string, WorkspaceSkill>>();
  const skillIds = new Set<string>();

  for (const library of libraries) {
    const skills = data.workspaceSkills.filter((skill) => skill.sourceId === library.id);
    workspaceByLibrary.set(
      library.id,
      new Map(skills.map((skill) => [skill.id, skill])),
    );
    skills.forEach((skill) => skillIds.add(skill.id));
  }

  data.catalogSkills.forEach((skill) => skillIds.add(skill.id));

  const rows = Array.from(skillIds).map((skillId) => {
    const catalogSkill = catalogById.get(skillId);
    const librarySkills = libraries
      .map((library) => ({
        library,
        skill: workspaceByLibrary.get(library.id)?.get(skillId),
      }))
      .filter((entry) => Boolean(entry.skill));
    const referenceSkill = catalogSkill ?? librarySkills[0]?.skill;
    const distinctVersions = new Set(
      [catalogSkill?.hash, ...librarySkills.map((entry) => entry.skill?.hash)].filter(
        Boolean,
      ),
    ).size;
    const missingLibraries = libraries.filter(
      (library) => !workspaceByLibrary.get(library.id)?.has(skillId),
    );

    let status: SyncMatrixRow["status"] = "aligned";
    let recommendation = "当前各位置内容一致。";

    if (!catalogSkill && librarySkills.length > 0 && distinctVersions > 1) {
      status = "drift";
      recommendation = "本地库之间已经出现差异，建议先统一本地版本。";
    } else if (!catalogSkill && librarySkills.length > 0) {
      status = "mirror-missing";
      recommendation = "建议把当前本地版本备份到远端 skills 仓库。";
    } else if (catalogSkill && librarySkills.length === 0) {
      status = "mirror-only";
      recommendation = "云端存在镜像，但本地库都还没安装。";
    } else if (distinctVersions > 1) {
      status = "drift";
      recommendation = "不同位置存在版本差异，建议选一个版本作为基线后统一同步。";
    } else if (missingLibraries.length > 0) {
      status = "partial";
      recommendation = "内容已经一致，但不是每个库都安装了这个 skill。";
    }

    const locations: SyncMatrixCell[] = [
      ...libraries.map((library) => {
        const workspaceSkill = workspaceByLibrary.get(library.id)?.get(skillId);

        if (!workspaceSkill) {
          return {
            locationId: library.id,
            locationLabel: library.label,
            state: "missing" as const,
          };
        }

        if (!catalogSkill) {
          return {
            locationId: library.id,
            locationLabel: library.label,
            state: "local-only" as const,
            updatedAt: workspaceSkill.updatedAt,
          };
        }

        return {
          locationId: library.id,
          locationLabel: library.label,
          state:
            workspaceSkill.hash === catalogSkill.hash
              ? ("synced" as const)
              : ("drift" as const),
          updatedAt: workspaceSkill.updatedAt,
        };
      }),
      {
        locationId: "catalog",
        locationLabel: "云端镜像",
        state: catalogSkill ? ("mirrored" as const) : ("missing" as const),
        updatedAt: catalogSkill?.updatedAt,
      },
    ];

    return {
      id: skillId,
      name: referenceSkill?.name ?? skillId,
      description:
        referenceSkill?.shortDescription ??
        referenceSkill?.description ??
        "暂无描述。",
      status,
      recommendation,
      distinctVersions,
      locations,
    };
  });

  const statusRank = {
    drift: 0,
    "mirror-missing": 1,
    partial: 2,
    "mirror-only": 3,
    aligned: 4,
  } as const;

  return rows
    .filter((row) => {
      if (!query) {
        return true;
      }

      return [
        row.id,
        row.name,
        row.description,
        row.recommendation,
        ...row.locations.map((location) => location.locationLabel),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((left, right) => {
      const rankDifference = statusRank[left.status] - statusRank[right.status];

      if (rankDifference !== 0) {
        return rankDifference;
      }

      return left.name.localeCompare(right.name);
    });
}

async function parseResponse(response: Response) {
  return (await response.json()) as Partial<ActionResponse> & {
    ok?: boolean;
    message?: string;
    detail?: SkillDetail;
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

function MarkdownPanel({ content }: { content?: string }) {
  if (!content) {
    return <p className="hub-empty-copy">这里还没有内容。</p>;
  }

  return (
    <div className="hub-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function JsonPanel({ value }: { value?: Record<string, unknown> }) {
  if (!value) {
    return <p className="hub-empty-copy">暂无 JSON 配置。</p>;
  }

  return <pre className="hub-code-panel">{JSON.stringify(value, null, 2)}</pre>;
}

function FilterButton({
  active,
  label,
  count,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  icon?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`hub-filter-button ${active ? "hub-filter-button-active" : ""}`}
      onClick={onClick}
    >
      <span className="hub-filter-label">
        {icon ? <span>{icon}</span> : null}
        <span>{label}</span>
      </span>
      {count !== undefined ? <span className="hub-filter-count">{count}</span> : null}
    </button>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hub-filter-group">
      <p className="hub-filter-title">{title}</p>
      <div className="hub-filter-list">{children}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "blue" | "amber" | "cyan" | "green" | "muted";
}) {
  return (
    <article className={`hub-stat-card ${tone ? `hub-stat-${tone}` : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function SkillCard({
  skill,
  selected,
  onClick,
}: {
  skill: StoreSkill;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`hub-skill-card ${selected ? "hub-skill-card-active" : ""}`}
      onClick={onClick}
    >
      <div className="hub-skill-card-head">
        <h3>/{skill.name}</h3>
        <div className="hub-card-badges">
          <span className="hub-agent-badge">
            <span>{skill.agentIcon}</span>
            {skill.agentLabel}
          </span>
          <span className="hub-scope-badge">{skill.scopeLabel}</span>
        </div>
      </div>
      <p>{skill.shortDescription || skill.description || "暂无描述"}</p>
      <div className="hub-skill-card-foot">
        <span className={`hub-source-badge ${skill.sourceBadge === "agents" ? "hub-source-agents" : ""}`}>
          {skill.sourceBadge}
        </span>
        <span className={`hub-mini-badge ${statusClass(skill.statusTone)}`}>
          {skill.statusLabel}
        </span>
      </div>
      {skill.homepage ? <Link2 className="hub-card-link" size={15} /> : null}
    </button>
  );
}

function GroupedSkillGrid({
  groups,
  selectedKey,
  onSelect,
}: {
  groups: Array<{ key: string; label: string; items: StoreSkill[] }>;
  selectedKey?: string;
  onSelect: (skill: StoreSkill) => void;
}) {
  if (groups.every((group) => group.items.length === 0)) {
    return (
      <div className="hub-empty-state">
        <PackageSearch size={28} />
        <p>没有匹配的 Skills</p>
      </div>
    );
  }

  return (
    <div className="hub-group-stack">
      {groups.map((group) => (
        <section key={group.key} className="hub-skill-group">
          <div className="hub-group-title">
            <h2>{group.label}</h2>
            <span>{group.items.length}</span>
            <div />
          </div>
          <div className="hub-skill-grid">
            {group.items.map((skill) => (
              <SkillCard
                key={skill.key}
                skill={skill}
                selected={selectedKey === skill.key}
                onClick={() => onSelect(skill)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function LibrarySummaryCard({ library }: { library: LibrarySummary }) {
  return (
    <article className="hub-library-card">
      <div>
        <p>{library.label}</p>
        <strong>{library.skillCount}</strong>
      </div>
      <div className="hub-library-meta">
        <span>已同步 {library.syncedCount}</span>
        <span>缺云端 {library.missingCount}</span>
        <span>有差异 {library.changedCount}</span>
      </div>
    </article>
  );
}

export function SkillStoreApp({ initialData }: SkillStoreAppProps) {
  const [data, setData] = useState(initialData);
  const [activeView, setActiveView] = useState<ActiveView>("skills");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("library");
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<StoreSkill | null>(null);
  const [detailsCache, setDetailsCache] = useState<Record<string, SkillDetail>>({});
  const [detailLoadingKey, setDetailLoadingKey] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  function applyDashboard(nextData: DashboardData) {
    startTransition(() => {
      setData(nextData);
      setDetailsCache({});
    });
  }

  async function refreshDashboard() {
    const nextData = await fetchDashboardData();
    applyDashboard(nextData);
  }

  async function runAction(
    endpoint: string,
    body: unknown,
    key: string,
    options?: { confirmMessage?: string },
  ) {
    if (options?.confirmMessage && !window.confirm(options.confirmMessage)) {
      return;
    }

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

      applyDashboard(payload.dashboard);
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

  const allSkills = useMemo(() => buildStoreSkills(data), [data]);
  const duplicateGroups = useMemo(() => buildDuplicateGroups(allSkills), [allSkills]);

  const filteredSkills = useMemo(() => {
    return allSkills.filter((skill) => {
      if (scopeFilter !== "all" && skill.locationType !== scopeFilter) {
        return false;
      }

      if (agentFilter !== "all" && skill.sourceId !== agentFilter) {
        return false;
      }

      if (libraryFilter !== "all" && skill.sourceId !== libraryFilter) {
        return false;
      }

      if (statusFilter === "local" && skill.locationType !== "library") {
        return false;
      }

      if (statusFilter === "agents" && skill.locationType !== "catalog") {
        return false;
      }

      if (
        statusFilter === "pending" &&
        (skill.statusTone === "good" || skill.statusLabel === "已同步")
      ) {
        return false;
      }

      if (statusFilter === "changed" && skill.statusTone !== "warn") {
        return false;
      }

      if (statusFilter === "synced" && skill.statusTone !== "good") {
        return false;
      }

      return matchesSearch(deferredSearch, skill);
    });
  }, [
    agentFilter,
    allSkills,
    deferredSearch,
    libraryFilter,
    scopeFilter,
    statusFilter,
  ]);

  const groupedSkills = useMemo(() => {
    if (groupBy === "flat") {
      return [{ key: "all", label: "全部 Skills", items: filteredSkills }];
    }

    const groups = new Map<string, StoreSkill[]>();

    for (const skill of filteredSkills) {
      const key = groupBy === "source" ? skill.sourceBadge : skill.sourceId;
      const label = groupBy === "source" ? skill.sourceBadge : skill.sourceLabel;
      groups.set(key, [...(groups.get(key) ?? []), skill]);

      if (!groups.has(`${key}:label`)) {
        groups.set(`${key}:label`, [{ ...skill, name: label }]);
      }
    }

    return Array.from(groups.entries())
      .filter(([key]) => !key.endsWith(":label"))
      .map(([key, items]) => ({
        key,
        label: groups.get(`${key}:label`)?.[0]?.name ?? key,
        items,
      }))
      .sort((left, right) => right.items.length - left.items.length);
  }, [filteredSkills, groupBy]);

  const syncRows = useMemo(
    () => buildSyncMatrix(data, deferredSearch),
    [data, deferredSearch],
  );
  const topStats = [
    { label: "总计", value: allSkills.length },
    { label: "本地", value: data.summary.workspaceSkills, tone: "blue" as const },
    { label: "云端", value: data.summary.catalogSkills, tone: "amber" as const },
    { label: "来源", value: data.summary.libraries, tone: "cyan" as const },
    { label: "待同步", value: data.summary.pendingImports + data.summary.pendingInstalls, tone: "green" as const },
    { label: "冲突", value: duplicateGroups.length, tone: "muted" as const },
  ];
  const selectedWorkspaceSkill =
    selectedSkill?.record.locationType === "library"
      ? selectedSkill.record
      : undefined;
  const selectedCatalogRecord =
    selectedSkill?.record.locationType === "catalog"
      ? selectedSkill.record
      : undefined;
  const selectedCatalogSkill =
    selectedWorkspaceSkill
      ? data.catalogSkills.find((skill) => skill.id === selectedWorkspaceSkill.id)
      : undefined;
  const selectedLibrarySyncTargets =
    selectedWorkspaceSkill
      ? data.config.libraries
          .filter((library) => library.id !== selectedWorkspaceSkill.sourceId)
          .map((library) => {
            const installedSkill = data.workspaceSkills.find(
              (skill) =>
                skill.sourceId === library.id &&
                skill.id === selectedWorkspaceSkill.id,
            );

            return { library, installedSkill };
          })
      : [];
  const detailCacheKey = selectedSkill
    ? `${selectedSkill.record.locationType}:${selectedSkill.record.sourceId}:${selectedSkill.id}`
    : null;
  const selectedDetail = detailCacheKey ? detailsCache[detailCacheKey] : undefined;

  useEffect(() => {
    const currentSkill = selectedSkill;

    if (!currentSkill || !detailCacheKey || detailsCache[detailCacheKey]) {
      return;
    }

    const detailKey = detailCacheKey;
    const skillId = currentSkill.id;
    const sourceId = currentSkill.record.sourceId;
    const locationType = currentSkill.record.locationType;
    let cancelled = false;

    async function loadDetail() {
      setDetailLoadingKey(detailKey);

      try {
        const response = await fetch(
          `/api/skills/detail?skillId=${encodeURIComponent(skillId)}&sourceId=${encodeURIComponent(sourceId)}&locationType=${locationType}`,
          {
            cache: "no-store",
          },
        );
        const payload = await parseResponse(response);

        if (!response.ok || !payload.ok || !payload.detail) {
          throw new Error(payload.message ?? "加载详情失败。");
        }

        if (!cancelled) {
          setDetailsCache((current) => ({
            ...current,
            [detailKey]: payload.detail as SkillDetail,
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setNotice({
            kind: "error",
            text: error instanceof Error ? error.message : "加载详情失败。",
          });
        }
      } finally {
        if (!cancelled) {
          setDetailLoadingKey(null);
        }
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [detailCacheKey, detailsCache, selectedSkill]);

  const navItems = [
    { key: "skills", label: "Skills" },
    { key: "similar", label: "相似检测", badge: duplicateGroups.length },
    { key: "dashboard", label: "仪表盘" },
    { key: "sync", label: "同步", badge: data.summary.pendingImports + data.summary.pendingInstalls },
    { key: "trash", label: "回收站", badge: 0 },
  ] satisfies Array<{ key: ActiveView; label: string; badge?: number }>;

  return (
    <main className="hub-gradient">
      <section className="hub-shell">
        <header className="hub-header">
          <div className="hub-brand">
            <div className="hub-logo">黄</div>
            <strong>Skill 管理器</strong>
          </div>

          <nav className="hub-top-tabs">
            {navItems.map((item) => (
              <button
                type="button"
                key={item.key}
                className={activeView === item.key ? "hub-top-tab-active" : ""}
                onClick={() => setActiveView(item.key)}
              >
                {item.label}
                {item.badge ? <span>{item.badge}</span> : null}
              </button>
            ))}
          </nav>

          <div className="hub-header-actions">
            <label className="hub-search">
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索 Skills...（名称/描述）"
              />
            </label>
            <button type="button" className="hub-icon-button" aria-label="Theme">
              <Moon size={17} />
            </button>
            <button
              type="button"
              className="hub-scan-button"
              disabled={busyKey === "refresh"}
              onClick={async () => {
                setBusyKey("refresh");
                setNotice(null);

                try {
                  await refreshDashboard();
                  setNotice({ kind: "success", text: "已完成扫描。" });
                } catch (error) {
                  setNotice({
                    kind: "error",
                    text: error instanceof Error ? error.message : "扫描失败。",
                  });
                } finally {
                  setBusyKey(null);
                }
              }}
            >
              <RefreshCw size={16} className={busyKey === "refresh" ? "spin" : ""} />
              一键扫描
            </button>
          </div>
        </header>

        <div className="hub-content">
          <aside className="hub-sidebar">
            <FilterGroup title="层级">
              <FilterButton
                active={scopeFilter === "all"}
                label="全部"
                count={allSkills.length}
                icon="▣"
                onClick={() => setScopeFilter("all")}
              />
              <FilterButton
                active={scopeFilter === "local"}
                label="本地 Skills"
                count={data.summary.workspaceSkills}
                icon="🌐"
                onClick={() => setScopeFilter("local")}
              />
              <FilterButton
                active={scopeFilter === "catalog"}
                label="云端镜像"
                count={data.summary.catalogSkills}
                icon="☁"
                onClick={() => setScopeFilter("catalog")}
              />
            </FilterGroup>

            <FilterGroup title="Agent 类型">
              <FilterButton
                active={agentFilter === "all"}
                label="全部 Agent"
                count={allSkills.length}
                icon="▣"
                onClick={() => setAgentFilter("all")}
              />
              {data.librarySummaries.map((library) => {
                const meta = getAgentMeta(library.id);

                return (
                  <FilterButton
                    key={library.id}
                    active={agentFilter === library.id}
                    label={meta.label}
                    count={library.skillCount}
                    icon={meta.icon}
                    onClick={() => setAgentFilter(library.id)}
                  />
                );
              })}
            </FilterGroup>

            <FilterGroup title="来源">
              <FilterButton
                active={statusFilter === "all"}
                label="全部来源"
                icon="○"
                onClick={() => setStatusFilter("all")}
              />
              <FilterButton
                active={statusFilter === "local"}
                label="本地"
                count={data.summary.workspaceSkills}
                icon="🟢"
                onClick={() => setStatusFilter("local")}
              />
              <FilterButton
                active={statusFilter === "agents"}
                label="Agents 平台"
                count={data.summary.catalogSkills}
                icon="🔵"
                onClick={() => setStatusFilter("agents")}
              />
              <FilterButton
                active={statusFilter === "changed"}
                label="有更新"
                icon="🟠"
                onClick={() => setStatusFilter("changed")}
              />
              <FilterButton
                active={statusFilter === "synced"}
                label="已同步"
                icon="✅"
                onClick={() => setStatusFilter("synced")}
              />
            </FilterGroup>

            <FilterGroup title="项目">
              <FilterButton
                active={libraryFilter === "all"}
                label="全部项目"
                icon="▤"
                onClick={() => setLibraryFilter("all")}
              />
              {data.librarySummaries.map((library) => (
                <FilterButton
                  key={library.id}
                  active={libraryFilter === library.id}
                  label={library.label}
                  count={library.skillCount}
                  icon="📁"
                  onClick={() => setLibraryFilter(library.id)}
                />
              ))}
            </FilterGroup>
          </aside>

          <section className="hub-main">
            {notice ? (
              <div className={`hub-notice hub-notice-${notice.kind}`}>
                {notice.text}
              </div>
            ) : null}

            <section className="hub-stats-grid">
              {topStats.map((stat) => (
                <StatCard key={stat.label} {...stat} />
              ))}
            </section>

            {activeView === "skills" ? (
              <>
                <div className="hub-list-toolbar">
                  <div>
                    <button type="button" className="hub-view-icon">
                      <Layers3 size={17} />
                    </button>
                    <span>共 {filteredSkills.length} 个 Skill</span>
                  </div>
                  <div className="hub-segmented">
                    <button
                      type="button"
                      className={groupBy === "library" ? "hub-segmented-active" : ""}
                      onClick={() => setGroupBy("library")}
                    >
                      按层级
                    </button>
                    <button
                      type="button"
                      className={groupBy === "source" ? "hub-segmented-active" : ""}
                      onClick={() => setGroupBy("source")}
                    >
                      按来源
                    </button>
                    <button
                      type="button"
                      className={groupBy === "flat" ? "hub-segmented-active" : ""}
                      onClick={() => setGroupBy("flat")}
                    >
                      平铺
                    </button>
                  </div>
                </div>

                <GroupedSkillGrid
                  groups={groupedSkills}
                  selectedKey={selectedSkill?.key}
                  onSelect={(skill) => {
                    setSelectedSkill(skill);
                    setDetailTab("overview");
                  }}
                />
              </>
            ) : null}

            {activeView === "similar" ? (
              <section className="hub-panel-view">
                <div className="hub-panel-head">
                  <div>
                    <p>Similar Skills</p>
                    <h2>相似 / 重复检测</h2>
                  </div>
                  <Radar size={24} />
                </div>
                {duplicateGroups.length === 0 ? (
                  <div className="hub-empty-state">
                    <CheckCircle2 size={28} />
                    <p>当前没有发现同名 skill。</p>
                  </div>
                ) : (
                  <div className="hub-duplicate-list">
                    {duplicateGroups.map((group) => (
                      <article className="hub-duplicate-card" key={group.id}>
                        <div className="hub-group-title">
                          <h2>/{group.label}</h2>
                          <span>{group.skills.length}</span>
                          <div />
                        </div>
                        <div className="hub-skill-grid">
                          {group.skills.map((skill) => (
                            <SkillCard
                              key={skill.key}
                              skill={skill}
                              selected={selectedSkill?.key === skill.key}
                              onClick={() => setSelectedSkill(skill)}
                            />
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {activeView === "dashboard" ? (
              <section className="hub-panel-view">
                <div className="hub-panel-head">
                  <div>
                    <p>Dashboard</p>
                    <h2>技能库仪表盘</h2>
                  </div>
                  <LayoutDashboard size={24} />
                </div>
                <div className="hub-library-grid">
                  {data.librarySummaries.map((library) => (
                    <LibrarySummaryCard key={library.id} library={library} />
                  ))}
                </div>
                <div className="hub-git-card">
                  <div>
                    <p>GitHub 同步</p>
                    <strong>{data.git.branch ?? data.config.catalog.defaultBranch}</strong>
                    <span>{data.git.remote ?? data.config.catalog.remoteRepoUrl}</span>
                  </div>
                  <span className={`hub-mini-badge ${data.git.clean ? "hub-badge-good" : "hub-badge-warn"}`}>
                    {data.git.clean ? "工作区干净" : `${data.git.dirtyFiles.length} 个改动`}
                  </span>
                </div>
              </section>
            ) : null}

            {activeView === "sync" ? (
              <section className="hub-panel-view">
                <div className="hub-panel-head">
                  <div>
                    <p>Sync</p>
                    <h2>同步与更新检查</h2>
                  </div>
                  <div className="hub-sync-actions">
                    <ActionButton
                      label="检查远端"
                      icon={<RefreshCw size={16} />}
                      busy={busyKey === "sync-fetch"}
                      onClick={() =>
                        runAction("/api/actions/sync", { action: "fetch" }, "sync-fetch")
                      }
                      tone="ghost"
                      size="compact"
                    />
                    <ActionButton
                      label="拉取"
                      icon={<CloudDownload size={16} />}
                      busy={busyKey === "sync-pull"}
                      onClick={() =>
                        runAction("/api/actions/sync", { action: "pull" }, "sync-pull")
                      }
                      tone="secondary"
                      size="compact"
                    />
                    <ActionButton
                      label="推送"
                      icon={<CloudUpload size={16} />}
                      busy={busyKey === "sync-push"}
                      onClick={() =>
                        runAction("/api/actions/sync", { action: "push" }, "sync-push")
                      }
                      size="compact"
                    />
                  </div>
                </div>

                <div className="hub-sync-list">
                  {syncRows.map((row) => (
                    <article className="hub-sync-row" key={row.id}>
                      <div className="hub-sync-row-head">
                        <div>
                          <h3>/{row.name}</h3>
                          <p>{row.description}</p>
                        </div>
                        <span className={`hub-mini-badge ${syncRowTone(row.status)}`}>
                          {syncRowLabel(row.status)}
                        </span>
                      </div>
                      <div className="hub-sync-chips">
                        {row.locations.map((location) => (
                          <span
                            className={`hub-sync-chip ${syncCellTone(location.state)}`}
                            key={`${row.id}:${location.locationId}`}
                          >
                            {location.locationLabel} · {syncCellLabel(location.state)}
                          </span>
                        ))}
                      </div>
                      <p className="hub-sync-tip">{row.recommendation}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {activeView === "trash" ? (
              <section className="hub-panel-view">
                <div className="hub-panel-head">
                  <div>
                    <p>Trash</p>
                    <h2>回收站</h2>
                  </div>
                  <Trash2 size={24} />
                </div>
                <div className="hub-empty-state">
                  <Trash2 size={28} />
                  <p>
                    回收站后端还没接入。下一步会参考 Skill Hub 的 7 天恢复机制，把删除从硬删除改成可恢复。
                  </p>
                </div>
              </section>
            ) : null}
          </section>
        </div>
      </section>

      {selectedSkill ? (
        <div className="hub-modal-backdrop" onClick={() => setSelectedSkill(null)}>
          <aside className="hub-detail-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="hub-detail-head">
              <div>
                <p>
                  {selectedSkill.agentIcon} {selectedSkill.agentLabel}
                </p>
                <h2>/{selectedSkill.name}</h2>
                <span>{selectedSkill.description}</span>
              </div>
              <button
                type="button"
                className="hub-icon-button"
                onClick={() => setSelectedSkill(null)}
                aria-label="关闭"
              >
                <X size={18} />
              </button>
            </div>

            <div className="hub-detail-meta">
              <span className={`hub-mini-badge ${statusClass(selectedSkill.statusTone)}`}>
                {selectedSkill.statusLabel}
              </span>
              <span>{selectedSkill.fileCount} files</span>
              <span>{formatBytes(selectedSkill.sizeBytes)}</span>
              <span>{new Intl.DateTimeFormat("zh-CN", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(selectedSkill.updatedAt))}</span>
            </div>

            <div className="hub-detail-actions">
              {selectedWorkspaceSkill ? (
                <>
                  <ActionButton
                    label={
                      selectedWorkspaceSkill.catalogStatus === "missing"
                        ? "备份到云端"
                        : selectedWorkspaceSkill.catalogStatus === "changed"
                          ? "更新云端"
                          : "重传备份"
                    }
                    icon={<CloudUpload size={16} />}
                    busy={busyKey === `import:${selectedWorkspaceSkill.sourceId}:${selectedWorkspaceSkill.id}`}
                    onClick={() =>
                      runAction(
                        "/api/actions/import",
                        {
                          skillId: selectedWorkspaceSkill.id,
                          libraryId: selectedWorkspaceSkill.sourceId,
                        },
                        `import:${selectedWorkspaceSkill.sourceId}:${selectedWorkspaceSkill.id}`,
                      )
                    }
                    size="compact"
                  />
                  <ActionButton
                    label="移除本地"
                    icon={<Trash2 size={16} />}
                    busy={busyKey === `remove:${selectedWorkspaceSkill.sourceId}:${selectedWorkspaceSkill.id}`}
                    onClick={() =>
                      runAction(
                        "/api/actions/remove-library",
                        {
                          skillId: selectedWorkspaceSkill.id,
                          libraryId: selectedWorkspaceSkill.sourceId,
                        },
                        `remove:${selectedWorkspaceSkill.sourceId}:${selectedWorkspaceSkill.id}`,
                        {
                          confirmMessage: `确认从 ${selectedWorkspaceSkill.sourceLabel} 删除 ${selectedWorkspaceSkill.name} 吗？`,
                        },
                      )
                    }
                    tone="danger"
                    size="compact"
                  />
                </>
              ) : null}

              {selectedCatalogRecord ? (
                <ActionButton
                  label="删除云端镜像"
                  icon={<Trash2 size={16} />}
                  busy={busyKey === `delete-catalog:${selectedCatalogRecord.id}`}
                  onClick={() =>
                    runAction(
                      "/api/actions/delete-catalog",
                      { skillId: selectedCatalogRecord.id },
                      `delete-catalog:${selectedCatalogRecord.id}`,
                      {
                        confirmMessage: `确认从云端镜像删除 ${selectedCatalogRecord.name} 吗？`,
                      },
                    )
                  }
                  tone="danger"
                  size="compact"
                />
              ) : null}
            </div>

            {selectedWorkspaceSkill ? (
              <div className="hub-install-stack">
                <div className="hub-install-row">
                  <div>
                    <strong>云端镜像</strong>
                    <span>{selectedCatalogSkill?.path ?? "当前远端镜像里还没有这个 skill。"}</span>
                  </div>
                  <span className={`hub-mini-badge ${statusClass(workspaceStatus(selectedWorkspaceSkill).tone)}`}>
                    {workspaceStatus(selectedWorkspaceSkill).label}
                  </span>
                </div>
                {selectedLibrarySyncTargets.map(({ library, installedSkill }) => (
                  <div className="hub-install-row" key={library.id}>
                    <div>
                      <strong>{library.label}</strong>
                      <span>{installedSkill?.path ?? `将同步到 ${library.path}/${selectedWorkspaceSkill.id}`}</span>
                    </div>
                    <ActionButton
                      label={!installedSkill ? "同步过去" : "覆盖同步"}
                      icon={<ArrowRightLeft size={16} />}
                      busy={busyKey === `sync-library:${selectedWorkspaceSkill.sourceId}:${library.id}:${selectedWorkspaceSkill.id}`}
                      onClick={() =>
                        runAction(
                          "/api/actions/sync-library",
                          {
                            skillId: selectedWorkspaceSkill.id,
                            sourceLibraryId: selectedWorkspaceSkill.sourceId,
                            targetLibraryId: library.id,
                          },
                          `sync-library:${selectedWorkspaceSkill.sourceId}:${library.id}:${selectedWorkspaceSkill.id}`,
                        )
                      }
                      tone="secondary"
                      size="compact"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {selectedCatalogRecord ? (
              <div className="hub-install-stack">
                {selectedCatalogRecord.installations.map((installation) => (
                  <div className="hub-install-row" key={installation.libraryId}>
                    <div>
                      <strong>{installation.libraryLabel}</strong>
                      <span>{installation.targetPath}</span>
                    </div>
                    <ActionButton
                      label={
                        installation.status === "missing"
                          ? "同步到本地"
                          : installation.status === "update-available"
                            ? "更新本地"
                            : "覆盖同步"
                      }
                      icon={<CloudDownload size={16} />}
                      busy={busyKey === `install:${selectedCatalogRecord.id}:${installation.libraryId}`}
                      onClick={() =>
                        runAction(
                          "/api/actions/install",
                          {
                            skillId: selectedCatalogRecord.id,
                            libraryId: installation.libraryId,
                          },
                          `install:${selectedCatalogRecord.id}:${installation.libraryId}`,
                        )
                      }
                      tone={installation.status === "installed" ? "ghost" : "secondary"}
                      size="compact"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            <div className="hub-detail-tabs">
              {(
                [
                  { key: "overview", label: "概览", icon: Blocks },
                  { key: "skill", label: "SKILL.md", icon: Bot },
                  { key: "readme", label: "README", icon: FileCode2 },
                  { key: "files", label: "文件", icon: Files },
                  { key: "package", label: "package", icon: FileJson2 },
                  { key: "manifest", label: "manifest", icon: CheckCircle2 },
                ] satisfies Array<{
                  key: DetailTab;
                  label: string;
                  icon: typeof Blocks;
                }>
              ).map((tab) => {
                const Icon = tab.icon;

                return (
                  <button
                    type="button"
                    key={tab.key}
                    className={detailTab === tab.key ? "hub-detail-tab-active" : ""}
                    onClick={() => setDetailTab(tab.key)}
                  >
                    <Icon size={14} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="hub-detail-body">
              {detailLoadingKey === detailCacheKey ? (
                <div className="hub-empty-state">
                  <RefreshCw size={24} className="spin" />
                  <p>正在加载预览内容…</p>
                </div>
              ) : null}

              {selectedDetail && detailTab === "overview" ? (
                <>
                  <div className="hub-info-grid">
                    <span>
                      <GitBranch size={15} /> {selectedDetail.skill.sourceLabel}
                    </span>
                    <span>
                      <Files size={15} /> {selectedDetail.totalFiles} 个文件
                    </span>
                    <span>{selectedDetail.skill.path}</span>
                  </div>
                  <MarkdownPanel
                    content={selectedDetail.readmeMarkdown ?? selectedDetail.skillMarkdown}
                  />
                </>
              ) : null}

              {selectedDetail && detailTab === "skill" ? (
                <MarkdownPanel content={selectedDetail.skillMarkdown} />
              ) : null}

              {selectedDetail && detailTab === "readme" ? (
                <MarkdownPanel content={selectedDetail.readmeMarkdown} />
              ) : null}

              {selectedDetail && detailTab === "package" ? (
                <JsonPanel value={selectedDetail.packageJson} />
              ) : null}

              {selectedDetail && detailTab === "manifest" ? (
                <JsonPanel
                  value={selectedDetail.manifest as unknown as Record<string, unknown>}
                />
              ) : null}

              {selectedDetail && detailTab === "files" ? (
                <div className="hub-file-list">
                  {selectedDetail.files.map((file) => (
                    <div key={file.path}>
                      <span>{file.path}</span>
                      <strong>{formatBytes(file.sizeBytes)}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
