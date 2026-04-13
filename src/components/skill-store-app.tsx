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
  ArrowUpRight,
  Blocks,
  Bot,
  CheckCircle2,
  CloudDownload,
  CloudUpload,
  FileCode2,
  FileJson2,
  Files,
  FolderCog,
  GitBranch,
  LayoutPanelTop,
  LibraryBig,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

import { ActionButton } from "@/components/action-button";
import type {
  ActionResponse,
  CatalogSkill,
  DashboardData,
  InstallationState,
  LibrarySummary,
  SkillDetail,
  SkillHubConfig,
  WorkspaceSkill,
} from "@/lib/skillhub-types";

type SkillStoreAppProps = {
  initialData: DashboardData;
};

type SectionMode = "library" | "catalog" | "sync" | "settings";

type Section = {
  key: string;
  label: string;
  mode: SectionMode;
  description: string;
};

type PreviewTab = "overview" | "skill" | "readme" | "files" | "package" | "manifest";

type SkillFilter = "all" | "needs-action" | "changed" | "missing" | "synced";

type SyncLocationState = "mirrored" | "synced" | "drift" | "local-only" | "missing";

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
    return "云端缺失";
  }

  if (status === "changed") {
    return "存在差异";
  }

  return "云端一致";
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

function syncRowTone(status: SyncMatrixRow["status"]) {
  if (status === "aligned") {
    return "status-pill-good";
  }

  if (status === "partial") {
    return "status-pill-subtle";
  }

  return "status-pill-warn";
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
    return "未同步到云端";
  }

  return "存在差异";
}

function syncCellTone(state: SyncLocationState) {
  if (state === "synced" || state === "mirrored") {
    return "status-pill-good";
  }

  if (state === "drift") {
    return "status-pill-warn";
  }

  if (state === "local-only") {
    return "status-pill-subtle";
  }

  return "status-pill-plain";
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

function sectionBadge(section: Section, data: DashboardData) {
  if (section.mode === "library") {
    return data.librarySummaries.find((library) => library.id === section.key)
      ?.skillCount;
  }

  if (section.key === "catalog") {
    return data.summary.catalogSkills;
  }

  if (section.key === "sync") {
    return data.summary.pendingImports + data.summary.pendingInstalls;
  }

  return undefined;
}

function skillMatchesFilter(
  filter: SkillFilter,
  skill: WorkspaceSkill | CatalogSkill,
) {
  if (filter === "all") {
    return true;
  }

  if (skill.locationType === "library") {
    if (filter === "needs-action") {
      return skill.catalogStatus !== "synced";
    }

    if (filter === "changed") {
      return skill.catalogStatus === "changed";
    }

    if (filter === "missing") {
      return skill.catalogStatus === "missing";
    }

    return skill.catalogStatus === "synced";
  }

  const hasUpdates = skill.installations.some(
    (installation) => installation.status === "update-available",
  );
  const hasMissing = skill.installations.some(
    (installation) => installation.status === "missing",
  );
  const allInstalled = skill.installations.every(
    (installation) => installation.status === "installed",
  );

  if (filter === "needs-action") {
    return hasUpdates || hasMissing;
  }

  if (filter === "changed") {
    return hasUpdates;
  }

  if (filter === "missing") {
    return hasMissing;
  }

  return allInstalled;
}

function buildSkillFilters(
  skills: Array<WorkspaceSkill | CatalogSkill>,
  mode?: SectionMode,
) {
  const catalogMode = mode === "catalog";
  const filters: Array<{
    key: SkillFilter;
    label: string;
    description: string;
  }> = [
    {
      key: "all",
      label: "全部",
      description: "当前视图的全部 skills",
    },
    {
      key: "needs-action",
      label: "待处理",
      description: catalogMode ? "未安装或有更新" : "缺镜像或有差异",
    },
    {
      key: "changed",
      label: catalogMode ? "可更新" : "有差异",
      description: catalogMode ? "本地版本落后于镜像" : "本地与镜像 hash 不一致",
    },
    {
      key: "missing",
      label: catalogMode ? "未安装" : "缺云端",
      description: catalogMode ? "至少一个本地库未安装" : "还没同步到云端镜像",
    },
    {
      key: "synced",
      label: catalogMode ? "已安装" : "已对齐",
      description: catalogMode ? "所有目标库均已安装" : "本地与云端一致",
    },
  ];

  return filters.map((filter) => ({
    ...filter,
    count: skills.filter((skill) => skillMatchesFilter(filter.key, skill)).length,
  }));
}

function getInitialSection(data: DashboardData) {
  return data.librarySummaries.find((library) => library.id === "claude")?.id ??
    data.librarySummaries[0]?.id ??
    "catalog";
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

function buildSections(data: DashboardData): Section[] {
  const librarySections = data.librarySummaries.map((library) => ({
    key: library.id,
    label: library.label,
    mode: "library" as const,
    description: library.description || `${library.label} 本地技能库`,
  }));

  return [
    ...librarySections,
    {
      key: "catalog",
      label: "云端镜像",
      mode: "catalog",
      description: "远端仓库里正在追踪的 skill 镜像",
    },
    {
      key: "sync",
      label: "同步",
      mode: "sync",
      description: "Claude / Codex / Agents / 云端镜像的差异检查",
    },
    {
      key: "settings",
      label: "配置",
      mode: "settings",
      description: "本地目录、远端仓库与管理参数",
    },
  ];
}

function MarkdownPanel({ content }: { content?: string }) {
  if (!content) {
    return <p className="empty-copy">这里还没有内容。</p>;
  }

  return (
    <div className="markdown-shell">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
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
      [
        catalogSkill?.hash,
        ...librarySkills.map((entry) => entry.skill?.hash),
      ].filter(Boolean),
    ).size;
    const missingLibraries = libraries.filter(
      (library) => !workspaceByLibrary.get(library.id)?.has(skillId),
    );

    let status: SyncMatrixRow["status"] = "aligned";
    let recommendation = "当前各位置内容一致。";

    if (!catalogSkill && librarySkills.length > 0 && distinctVersions > 1) {
      status = "drift";
      recommendation = "本地库之间已经出现差异，建议先统一本地版本，再决定是否同步到云端镜像。";
    } else if (!catalogSkill && librarySkills.length > 0) {
      status = "mirror-missing";
      recommendation = "建议把当前本地版本同步到云端镜像，便于后续检查更新。";
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

    const name = referenceSkill?.name ?? skillId;
    const description =
      referenceSkill?.shortDescription ??
      referenceSkill?.description ??
      "暂无描述。";

    return {
      id: skillId,
      name,
      description,
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

      const haystack = [
        row.id,
        row.name,
        row.description,
        row.recommendation,
        ...row.locations.map((location) => location.locationLabel),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    })
    .sort((left, right) => {
      const rankDifference = statusRank[left.status] - statusRank[right.status];

      if (rankDifference !== 0) {
        return rankDifference;
      }

      return left.name.localeCompare(right.name);
    });
}

function JsonPanel({ value }: { value?: Record<string, unknown> }) {
  if (!value) {
    return <p className="empty-copy">暂无 JSON 配置。</p>;
  }

  return <pre className="code-panel">{JSON.stringify(value, null, 2)}</pre>;
}

function SectionButton({
  section,
  active,
  badge,
  onClick,
}: {
  section: Section;
  active: boolean;
  badge?: string | number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`section-button ${active ? "section-button-active" : ""}`}
    >
      <span>{section.label}</span>
      {badge !== undefined ? <span className="section-badge">{badge}</span> : null}
    </button>
  );
}

function SidebarSectionButton({
  section,
  active,
  badge,
  onClick,
}: {
  section: Section;
  active: boolean;
  badge?: string | number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`sidebar-section-button ${
        active ? "sidebar-section-button-active" : ""
      }`}
    >
      <span>
        <span className="sidebar-section-label">{section.label}</span>
        <span className="sidebar-section-copy">{section.description}</span>
      </span>
      {badge !== undefined ? <span className="section-badge">{badge}</span> : null}
    </button>
  );
}

function SkillFilterBar({
  options,
  active,
  onChange,
}: {
  options: ReturnType<typeof buildSkillFilters>;
  active: SkillFilter;
  onChange: (filter: SkillFilter) => void;
}) {
  return (
    <div className="filter-bar">
      {options.map((option) => (
        <button
          type="button"
          key={option.key}
          className={`filter-chip ${active === option.key ? "filter-chip-active" : ""}`}
          onClick={() => onChange(option.key)}
          title={option.description}
        >
          <span>{option.label}</span>
          <span className="filter-count">{option.count}</span>
        </button>
      ))}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="pagination-shell">
      <ActionButton
        label="上一页"
        onClick={onPrev}
        disabled={page <= 1}
        tone="ghost"
        size="compact"
      />
      <span className="caption-text">
        第 {page} / {Math.max(totalPages, 1)} 页
      </span>
      <ActionButton
        label="下一页"
        onClick={onNext}
        disabled={page >= totalPages}
        tone="ghost"
        size="compact"
      />
    </div>
  );
}

function LibraryStatusCard({ library }: { library: LibrarySummary }) {
  return (
    <article className="overview-card">
      <div className="overview-card-head">
        <div>
          <p className="mini-eyebrow">{library.label}</p>
          <h3 className="overview-title">{library.skillCount}</h3>
        </div>
        <span className="status-pill status-pill-subtle">
          {library.updateAvailableCount} 个可更新
        </span>
      </div>
      <div className="overview-row">
        <span>云端一致 {library.syncedCount}</span>
        <span>镜像缺失 {library.missingCount}</span>
        <span>版本差异 {library.changedCount}</span>
      </div>
    </article>
  );
}

export function SkillStoreApp({ initialData }: SkillStoreAppProps) {
  const [data, setData] = useState(initialData);
  const [activeSection, setActiveSection] = useState(getInitialSection(initialData));
  const [skillFilter, setSkillFilter] = useState<SkillFilter>("all");
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [pageBySection, setPageBySection] = useState<Record<string, number>>({});
  const [selectedSkillIds, setSelectedSkillIds] = useState<Record<string, string>>({});
  const [detailsCache, setDetailsCache] = useState<Record<string, SkillDetail>>({});
  const [detailLoadingKey, setDetailLoadingKey] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("overview");
  const [configDraft, setConfigDraft] = useState<SkillHubConfig>(initialData.config);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const sections = useMemo(() => buildSections(data), [data]);
  const activeSectionConfig =
    sections.find((section) => section.key === activeSection) ?? sections[0];
  const itemsPerPage = 10;

  function applyDashboard(nextData: DashboardData) {
    startTransition(() => {
      setData(nextData);
      setDetailsCache({});
      setConfigDraft(nextData.config);
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
    options?: {
      confirmMessage?: string;
    },
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

  useEffect(() => {
    if (activeSectionConfig) {
      setPreviewTab("overview");
      setSkillFilter("all");
    }
  }, [activeSectionConfig]);

  useEffect(() => {
    if (!sections.some((section) => section.key === activeSection)) {
      setActiveSection(getInitialSection(data));
    }
  }, [activeSection, data, sections]);

  const rawCurrentSkills = useMemo(() => {
    if (activeSectionConfig?.mode === "catalog") {
      return data.catalogSkills;
    }

    if (activeSectionConfig?.mode === "library") {
      return data.workspaceSkills.filter(
        (skill) => skill.sourceId === activeSectionConfig.key,
      );
    }

    return [];
  }, [activeSectionConfig, data.catalogSkills, data.workspaceSkills]);

  const currentSkills = useMemo(() => {
    return rawCurrentSkills
      .filter((skill) => skillMatchesFilter(skillFilter, skill))
      .filter((skill) => {
        if (skill.locationType === "catalog") {
          return matchesSearch(
            deferredSearch,
            skill,
            skill.installations.map((installation) => installation.libraryLabel),
          );
        }

        return matchesSearch(deferredSearch, skill, [
          skill.catalogImportedFrom ?? "",
        ]);
      });
  }, [deferredSearch, rawCurrentSkills, skillFilter]);

  const skillFilterOptions = useMemo(
    () => buildSkillFilters(rawCurrentSkills, activeSectionConfig?.mode),
    [activeSectionConfig?.mode, rawCurrentSkills],
  );

  const syncRows = useMemo(
    () => buildSyncMatrix(data, deferredSearch),
    [data, deferredSearch],
  );

  const currentPage = pageBySection[activeSection] ?? 1;
  const totalPages = Math.max(Math.ceil(currentSkills.length / itemsPerPage), 1);
  const safePage = Math.min(currentPage, totalPages);
  const pagedSkills = currentSkills.slice(
    (safePage - 1) * itemsPerPage,
    safePage * itemsPerPage,
  );
  const selectedSkillId = selectedSkillIds[activeSection];
  const selectedSkill =
    currentSkills.find((skill) => skill.id === selectedSkillId) ?? pagedSkills[0];

  useEffect(() => {
    if (
      (activeSectionConfig?.mode === "library" ||
        activeSectionConfig?.mode === "catalog") &&
      selectedSkill
    ) {
      setSelectedSkillIds((current) => ({
        ...current,
        [activeSection]: selectedSkill.id,
      }));
    }
  }, [activeSection, activeSectionConfig?.mode, selectedSkill]);

  useEffect(() => {
    if (currentPage !== safePage) {
      setPageBySection((current) => ({
        ...current,
        [activeSection]: safePage,
      }));
    }
  }, [activeSection, currentPage, safePage]);

  const detailCacheKey = selectedSkill
    ? `${selectedSkill.locationType}:${selectedSkill.sourceId}:${selectedSkill.id}`
    : null;
  const selectedDetail = detailCacheKey ? detailsCache[detailCacheKey] : undefined;
  const syncTotalPages = Math.max(Math.ceil(syncRows.length / itemsPerPage), 1);
  const syncSafePage = Math.min(pageBySection.sync ?? 1, syncTotalPages);
  const pagedSyncRows = syncRows.slice(
    (syncSafePage - 1) * itemsPerPage,
    syncSafePage * itemsPerPage,
  );
  const selectedCatalogSkill =
    selectedSkill?.locationType === "library"
      ? data.catalogSkills.find((skill) => skill.id === selectedSkill.id)
      : undefined;
  const selectedLibrarySyncTargets =
    selectedSkill?.locationType === "library"
      ? data.config.libraries
          .filter((library) => library.id !== selectedSkill.sourceId)
          .map((library) => {
            const installedSkill = data.workspaceSkills.find(
              (skill) =>
                skill.sourceId === library.id && skill.id === selectedSkill.id,
            );

            return {
              library,
              installedSkill,
            };
          })
      : [];

  useEffect(() => {
    if ((pageBySection.sync ?? 1) !== syncSafePage) {
      setPageBySection((current) => ({
        ...current,
        sync: syncSafePage,
      }));
    }
  }, [pageBySection.sync, syncSafePage]);

  useEffect(() => {
    if (
      !selectedSkill ||
      (activeSectionConfig?.mode !== "library" &&
        activeSectionConfig?.mode !== "catalog")
    ) {
      return;
    }

    const cacheKey = `${selectedSkill.locationType}:${selectedSkill.sourceId}:${selectedSkill.id}`;

    if (detailsCache[cacheKey]) {
      return;
    }

    let cancelled = false;

    async function loadDetail() {
      setDetailLoadingKey(cacheKey);

      try {
        const response = await fetch(
          `/api/skills/detail?skillId=${encodeURIComponent(selectedSkill.id)}&sourceId=${encodeURIComponent(selectedSkill.sourceId)}&locationType=${selectedSkill.locationType}`,
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
            [cacheKey]: payload.detail as SkillDetail,
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
  }, [activeSectionConfig?.mode, detailsCache, selectedSkill]);

  function updateLibraryDraft(
    libraryId: string,
    field: keyof SkillHubConfig["libraries"][number],
    value: string,
  ) {
    setConfigDraft((current) => ({
      ...current,
      libraries: current.libraries.map((library) =>
        library.id === libraryId ? { ...library, [field]: value } : library,
      ),
    }));
  }

  function addLibraryDraft() {
    setConfigDraft((current) => ({
      ...current,
      libraries: [
        ...current.libraries,
        {
          id: `library-${current.libraries.length + 1}`,
          label: "New Library",
          path: "",
          description: "",
        },
      ],
    }));
  }

  function removeLibraryDraft(libraryId: string) {
    setConfigDraft((current) => ({
      ...current,
      libraries: current.libraries.filter((library) => library.id !== libraryId),
    }));
  }

  const topStats = [
    {
      label: "本地技能",
      value: data.summary.workspaceSkills,
      copy: "跨 Claude / Codex / Agents",
    },
    {
      label: "云端镜像",
      value: data.summary.catalogSkills,
      copy: "远端仓库已追踪的 skills",
    },
    {
      label: "待同步",
      value: data.summary.pendingImports + data.summary.pendingInstalls,
      copy: `${data.summary.pendingImports} 个镜像待同步，${data.summary.pendingInstalls} 个本地待更新`,
    },
    {
      label: "分支",
      value: data.git.branch ?? data.config.catalog.defaultBranch,
      copy: data.git.clean ? "工作区干净" : `${data.git.dirtyFiles.length} 个变更待处理`,
    },
  ];

  return (
    <main className="manager-shell">
      <header className="hero-strip">
        <div className="hero-copy-block">
          <p className="hero-kicker">Qianzhu Skill Manager</p>
          <h1 className="hero-heading">
            管理你已经装上的 skills，而不是做一个臃肿商店。
          </h1>
          <p className="hero-lead">
            现在的主视角是 `Claude / Codex / Agents` 已安装技能库，重点看预览、差异、删除、更新和同步状态。云端仓库只是镜像层，不再喧宾夺主。
          </p>
        </div>

        <div className="hero-sync-chip">
          <div className="hero-sync-row">
            <GitBranch size={16} />
            <span>{data.git.branch ?? "未命名分支"}</span>
          </div>
          <div className="hero-sync-row">
            <ArrowRightLeft size={16} />
            <span>{data.git.remote ?? data.config.catalog.remoteRepoUrl}</span>
          </div>
        </div>
      </header>

      <section className="metric-row">
        {topStats.map((item) => (
          <article className="metric-card" key={item.label}>
            <p className="metric-label">{item.label}</p>
            <p className="metric-value">{item.value}</p>
            <p className="metric-copy">{item.copy}</p>
          </article>
        ))}
      </section>

      <section className="manager-workbench">
        <aside className="sidebar-rail">
          <div className="sidebar-card sidebar-card-brand">
            <p className="mini-eyebrow">Skill Hub Mode</p>
            <h2 className="sidebar-title">本地技能控制台</h2>
            <p className="sidebar-copy">
              参考 Skill Hub 的左侧导航和状态筛选，但保留 Codex / Claude
              双库同步与 GitHub 镜像能力。
            </p>
          </div>

          <div className="sidebar-card">
            <p className="sidebar-kicker">Agent Libraries</p>
            <div className="sidebar-section-list">
              {sections.map((section) => (
                <SidebarSectionButton
                  key={section.key}
                  section={section}
                  active={activeSection === section.key}
                  badge={sectionBadge(section, data)}
                  onClick={() => setActiveSection(section.key)}
                />
              ))}
            </div>
          </div>

          <div className="sidebar-card sidebar-sync-card">
            <p className="sidebar-kicker">Sync Radar</p>
            <div className="sync-radar-row">
              <span>待同步</span>
              <strong>{data.summary.pendingImports + data.summary.pendingInstalls}</strong>
            </div>
            <div className="sync-radar-row">
              <span>云端镜像</span>
              <strong>{data.summary.catalogSkills}</strong>
            </div>
            <div className="sync-radar-row">
              <span>Git 状态</span>
              <strong>{data.git.clean ? "Clean" : "Dirty"}</strong>
            </div>
          </div>
        </aside>

        <section className="panel-shell">
          <div className="section-nav mobile-section-nav">
          {sections.map((section) => {
            const badge = sectionBadge(section, data);

            return (
              <SectionButton
                key={section.key}
                section={section}
                active={activeSection === section.key}
                badge={badge}
                onClick={() => setActiveSection(section.key)}
              />
            );
          })}
          </div>

          <div className="toolbar-row">
          <div>
            <p className="mini-eyebrow">{activeSectionConfig?.label}</p>
            <h2 className="section-heading">{activeSectionConfig?.description}</h2>
          </div>

          <div className="toolbar-actions">
            {activeSectionConfig?.mode !== "settings" ? (
              <label className="search-shell">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={
                    activeSectionConfig?.mode === "sync"
                      ? "搜索技能名、状态、目标库"
                      : "搜索技能名、描述、命令、触发词"
                  }
                />
              </label>
            ) : null}
            <ActionButton
              label="刷新"
              icon={<RefreshCw size={16} />}
              busy={busyKey === "refresh"}
              onClick={async () => {
                setBusyKey("refresh");
                setNotice(null);

                try {
                  await refreshDashboard();
                  setNotice({
                    kind: "success",
                    text: "已刷新数据。",
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
              tone="ghost"
            />
          </div>
          </div>

          {(activeSectionConfig?.mode === "library" ||
            activeSectionConfig?.mode === "catalog") ? (
            <SkillFilterBar
              options={skillFilterOptions}
              active={skillFilter}
              onChange={setSkillFilter}
            />
          ) : null}

          {notice ? (
          <div
            className={`notice-banner ${
              notice.kind === "success" ? "notice-success" : "notice-error"
            }`}
          >
            {notice.text}
          </div>
          ) : null}

          {activeSectionConfig?.mode === "sync" ? (
          <section className="sync-grid">
            <article className="surface-card">
              <div className="surface-head">
                <div>
                  <p className="mini-eyebrow">Remote Mirror</p>
                  <h3 className="surface-title">远端仓库与镜像操作</h3>
                </div>
                <span
                  className={`status-pill ${
                    data.git.clean ? "status-pill-good" : "status-pill-warn"
                  }`}
                >
                  {data.git.clean ? "工作区干净" : "存在未提交变更"}
                </span>
              </div>

              <div className="info-grid">
                <div className="info-pill">
                  <GitBranch size={16} />
                  <span>{data.git.branch ?? "未创建分支"}</span>
                </div>
                <div className="info-pill">
                  <CloudUpload size={16} />
                  <span>{data.git.remote ?? data.config.catalog.remoteRepoUrl}</span>
                </div>
                <div className="info-pill">
                  <RefreshCw size={16} />
                  <span>{formatDateTime(data.generatedAt)} 更新</span>
                </div>
              </div>

              <div className="action-row-wrap">
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
                  label="检查远端"
                  icon={<RefreshCw size={16} />}
                  busy={busyKey === "sync-fetch"}
                  onClick={() =>
                    runAction("/api/actions/sync", { action: "fetch" }, "sync-fetch")
                  }
                  tone="ghost"
                />
                <ActionButton
                  label="拉取镜像"
                  icon={<CloudDownload size={16} />}
                  busy={busyKey === "sync-pull"}
                  onClick={() =>
                    runAction("/api/actions/sync", { action: "pull" }, "sync-pull")
                  }
                  tone="ghost"
                />
                <ActionButton
                  label="推送镜像"
                  icon={<CloudUpload size={16} />}
                  busy={busyKey === "sync-push"}
                  onClick={() =>
                    runAction("/api/actions/sync", { action: "push" }, "sync-push")
                  }
                />
                <ActionButton
                  label="重建镜像索引"
                  icon={<Blocks size={16} />}
                  busy={busyKey === "rebuild"}
                  onClick={() => runAction("/api/actions/rebuild", {}, "rebuild")}
                  tone="secondary"
                />
              </div>
            </article>

            <article className="surface-card">
              <div className="surface-head">
                <div>
                  <p className="mini-eyebrow">Sync Matrix</p>
                  <h3 className="surface-title">已安装 skill 的同步矩阵</h3>
                </div>
              </div>

              <div className="overview-grid">
                {data.librarySummaries.map((library) => (
                  <LibraryStatusCard key={library.id} library={library} />
                ))}
              </div>

              <div className="matrix-list">
                {pagedSyncRows.map((row) => (
                  <article className="matrix-row" key={row.id}>
                    <div className="matrix-row-head">
                      <div>
                        <div className="matrix-title-line">
                          <h4 className="matrix-title">{row.name}</h4>
                          <span className={`status-pill ${syncRowTone(row.status)}`}>
                            {syncRowLabel(row.status)}
                          </span>
                        </div>
                        <p className="matrix-copy">{row.description}</p>
                      </div>
                      <div className="matrix-meta">
                        <span className="caption-text">{row.id}</span>
                        <span className="caption-text">
                          {row.distinctVersions} 个版本指纹
                        </span>
                      </div>
                    </div>

                    <div className="matrix-chip-row">
                      {row.locations.map((location) => (
                        <div className="matrix-chip" key={`${row.id}:${location.locationId}`}>
                          <span className="caption-text">{location.locationLabel}</span>
                          <span
                            className={`status-pill ${syncCellTone(location.state)}`}
                          >
                            {syncCellLabel(location.state)}
                          </span>
                          {location.updatedAt ? (
                            <span className="caption-text">
                              {formatDate(location.updatedAt)}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    <p className="matrix-tip">{row.recommendation}</p>
                  </article>
                ))}
                {pagedSyncRows.length === 0 ? (
                  <div className="empty-state">
                    <ArrowRightLeft size={28} />
                    <p>没有匹配到同步项，换个关键词试试。</p>
                  </div>
                ) : null}
              </div>

              <Pagination
                page={syncSafePage}
                totalPages={syncTotalPages}
                onPrev={() =>
                  setPageBySection((current) => ({
                    ...current,
                    sync: Math.max(syncSafePage - 1, 1),
                  }))
                }
                onNext={() =>
                  setPageBySection((current) => ({
                    ...current,
                    sync: Math.min(syncSafePage + 1, syncTotalPages),
                  }))
                }
              />

              <div className="dirty-shell">
                <div className="dirty-head">
                  <p className="mini-eyebrow">Dirty Files</p>
                  <span className="caption-text">
                    {data.git.dirtyFiles.length} 个文件
                  </span>
                </div>
                {data.git.dirtyFiles.length > 0 ? (
                  <div className="dirty-list">
                    {data.git.dirtyFiles.map((dirtyFile) => (
                      <code className="dirty-item" key={dirtyFile}>
                        {dirtyFile}
                      </code>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">当前没有未提交的本地改动。</p>
                )}
              </div>
            </article>
          </section>
          ) : null}

          {activeSectionConfig?.mode === "settings" ? (
          <section className="settings-grid">
            <article className="surface-card">
              <div className="surface-head">
                <div>
                  <p className="mini-eyebrow">Mirror Config</p>
                  <h3 className="surface-title">云端镜像与索引配置</h3>
                </div>
                <ActionButton
                  label="保存配置"
                  icon={<Save size={16} />}
                  busy={busyKey === "save-config"}
                  onClick={() =>
                    runAction("/api/actions/config", configDraft, "save-config")
                  }
                />
              </div>

              <div className="form-grid">
                <label className="field-shell">
                  <span>标题</span>
                  <input
                    value={configDraft.catalog.title}
                    onChange={(event) =>
                      setConfigDraft((current) => ({
                        ...current,
                        catalog: { ...current.catalog, title: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="field-shell">
                  <span>默认分支</span>
                  <input
                    value={configDraft.catalog.defaultBranch}
                    onChange={(event) =>
                      setConfigDraft((current) => ({
                        ...current,
                        catalog: {
                          ...current.catalog,
                          defaultBranch: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="field-shell field-wide">
                  <span>描述</span>
                  <textarea
                    rows={3}
                    value={configDraft.catalog.description}
                    onChange={(event) =>
                      setConfigDraft((current) => ({
                        ...current,
                        catalog: {
                          ...current.catalog,
                          description: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="field-shell field-wide">
                  <span>远端仓库</span>
                  <input
                    value={configDraft.catalog.remoteRepoUrl}
                    onChange={(event) =>
                      setConfigDraft((current) => ({
                        ...current,
                        catalog: {
                          ...current.catalog,
                          remoteRepoUrl: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="field-shell">
                  <span>镜像目录</span>
                  <input
                    value={configDraft.catalog.directory}
                    onChange={(event) =>
                      setConfigDraft((current) => ({
                        ...current,
                        catalog: {
                          ...current.catalog,
                          directory: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="field-shell">
                  <span>索引文件</span>
                  <input
                    value={configDraft.catalog.indexFile}
                    onChange={(event) =>
                      setConfigDraft((current) => ({
                        ...current,
                        catalog: {
                          ...current.catalog,
                          indexFile: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
              </div>
            </article>

            <article className="surface-card">
              <div className="surface-head">
                <div>
                  <p className="mini-eyebrow">Libraries</p>
                  <h3 className="surface-title">本地 skill 目录</h3>
                </div>
                <ActionButton
                  label="新增目录"
                  icon={<Plus size={16} />}
                  onClick={addLibraryDraft}
                  tone="secondary"
                />
              </div>

              <div className="library-editor-list">
                {configDraft.libraries.map((library) => (
                  <div className="library-editor-card" key={library.id}>
                    <div className="library-editor-grid">
                      <label className="field-shell">
                        <span>ID</span>
                        <input
                          value={library.id}
                          onChange={(event) =>
                            updateLibraryDraft(library.id, "id", event.target.value)
                          }
                        />
                      </label>
                      <label className="field-shell">
                        <span>名称</span>
                        <input
                          value={library.label}
                          onChange={(event) =>
                            updateLibraryDraft(library.id, "label", event.target.value)
                          }
                        />
                      </label>
                      <label className="field-shell field-wide">
                        <span>路径</span>
                        <input
                          value={library.path}
                          onChange={(event) =>
                            updateLibraryDraft(library.id, "path", event.target.value)
                          }
                        />
                      </label>
                      <label className="field-shell field-wide">
                        <span>说明</span>
                        <textarea
                          rows={2}
                          value={library.description ?? ""}
                          onChange={(event) =>
                            updateLibraryDraft(
                              library.id,
                              "description",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                    </div>
                    <div className="card-footer">
                      <span className="caption-text">
                        Docker 模式下，如果你新增了宿主机路径，也要同步更新
                        `docker-compose.yml` 的挂载目录。
                      </span>
                      <ActionButton
                        label="移除目录"
                        icon={<Trash2 size={16} />}
                        onClick={() => removeLibraryDraft(library.id)}
                        tone="danger"
                        size="compact"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
          ) : null}

          {(activeSectionConfig?.mode === "library" ||
          activeSectionConfig?.mode === "catalog") && (
          <section className="workspace-grid">
            <article className="surface-card list-panel">
              <div className="surface-head">
                <div>
                  <p className="mini-eyebrow">Skill List</p>
                  <h3 className="surface-title">
                    {currentSkills.length} 个结果
                  </h3>
                </div>
                <span className="caption-text">
                  {deferredSearch ? `搜索：${deferredSearch}` : "按名称、命令、触发词检索"}
                </span>
              </div>

              <div className="list-shell">
                {pagedSkills.map((skill) => {
                  const active = selectedSkill?.id === skill.id;
                  const statusElement =
                    skill.locationType === "catalog" ? (
                      <span className="status-pill status-pill-subtle">
                        {skill.installations.filter(
                          (installation) => installation.status === "update-available",
                        ).length > 0
                          ? "本地有待更新"
                          : "云端镜像"}
                      </span>
                    ) : (
                      <span
                        className={`status-pill ${workspaceStatusTone(
                          skill.catalogStatus,
                        )}`}
                      >
                        {workspaceStatusLabel(skill.catalogStatus)}
                      </span>
                    );

                  return (
                    <button
                      type="button"
                      key={`${skill.sourceId}:${skill.id}`}
                      className={`skill-list-row ${active ? "skill-list-row-active" : ""}`}
                      onClick={() =>
                        setSelectedSkillIds((current) => ({
                          ...current,
                          [activeSection]: skill.id,
                        }))
                      }
                    >
                      <div className="skill-list-top">
                        <div>
                          <h4 className="skill-list-title">{skill.name}</h4>
                          <p className="skill-list-copy">{skill.shortDescription}</p>
                        </div>
                        {statusElement}
                      </div>
                      <div className="skill-list-meta">
                        <span>{skill.sourceLabel}</span>
                        <span>{formatDate(skill.updatedAt)}</span>
                        <span>{skill.fileCount} files</span>
                        {skill.version ? <span>v{skill.version}</span> : null}
                      </div>
                    </button>
                  );
                })}
                {pagedSkills.length === 0 ? (
                  <div className="empty-state">
                    <LibraryBig size={28} />
                    <p>没有匹配到技能，换个关键词试试。</p>
                  </div>
                ) : null}
              </div>

              <Pagination
                page={safePage}
                totalPages={totalPages}
                onPrev={() =>
                  setPageBySection((current) => ({
                    ...current,
                    [activeSection]: Math.max(safePage - 1, 1),
                  }))
                }
                onNext={() =>
                  setPageBySection((current) => ({
                    ...current,
                    [activeSection]: Math.min(safePage + 1, totalPages),
                  }))
                }
              />
            </article>

            <article className="surface-card preview-panel">
              {selectedSkill ? (
                <>
                  <div className="surface-head">
                    <div className="preview-header-block">
                      <div className="preview-title-row">
                        <p className="mini-eyebrow">{selectedSkill.sourceLabel}</p>
                        {selectedSkill.homepage ? (
                          <a
                            className="inline-link"
                            href={selectedSkill.homepage}
                            target="_blank"
                            rel="noreferrer"
                          >
                            官网 <ArrowUpRight size={14} />
                          </a>
                        ) : null}
                      </div>
                      <h3 className="preview-title">{selectedSkill.name}</h3>
                      <p className="preview-copy">{selectedSkill.description}</p>
                    </div>
                    {selectedSkill.locationType === "library" ? (
                      <div className="action-row-wrap preview-actions">
                        <ActionButton
                          label="移除本地"
                          icon={<Trash2 size={16} />}
                          busy={
                            busyKey ===
                            `remove:${selectedSkill.sourceId}:${selectedSkill.id}`
                          }
                          onClick={() =>
                            runAction(
                              "/api/actions/remove-library",
                              {
                                skillId: selectedSkill.id,
                                libraryId: selectedSkill.sourceId,
                              },
                              `remove:${selectedSkill.sourceId}:${selectedSkill.id}`,
                              {
                                confirmMessage: `确认从 ${selectedSkill.sourceLabel} 删除 ${selectedSkill.name} 吗？`,
                              },
                            )
                          }
                          tone="danger"
                        />
                      </div>
                    ) : (
                      <div className="action-row-wrap preview-actions">
                        <ActionButton
                          label="删除云端镜像"
                          icon={<Trash2 size={16} />}
                          busy={busyKey === `delete-catalog:${selectedSkill.id}`}
                          onClick={() =>
                            runAction(
                              "/api/actions/delete-catalog",
                              {
                                skillId: selectedSkill.id,
                              },
                              `delete-catalog:${selectedSkill.id}`,
                              {
                                confirmMessage: `确认从 Catalog 删除 ${selectedSkill.name} 吗？`,
                              },
                            )
                          }
                          tone="danger"
                        />
                      </div>
                    )}
                  </div>

                  <div className="meta-chip-row">
                    <span className="status-pill status-pill-subtle">
                      {selectedSkill.locationType === "catalog"
                        ? "云端镜像"
                        : workspaceStatusLabel(selectedSkill.catalogStatus)}
                    </span>
                    <span className="status-pill status-pill-subtle">
                      {selectedSkill.fileCount} files
                    </span>
                    <span className="status-pill status-pill-subtle">
                      {formatBytes(selectedSkill.sizeBytes)}
                    </span>
                    <span className="status-pill status-pill-subtle">
                      更新于 {formatDate(selectedSkill.updatedAt)}
                    </span>
                    {selectedSkill.version ? (
                      <span className="status-pill status-pill-subtle">
                        v{selectedSkill.version}
                      </span>
                    ) : null}
                  </div>

                  {selectedSkill.locationType === "library" ? (
                    <div className="install-stack">
                      <div className="install-item">
                        <div>
                          <div className="install-item-title">
                            <span>云端镜像</span>
                            <span
                              className={`status-pill ${
                                selectedSkill.catalogStatus === "synced"
                                  ? "status-pill-good"
                                  : selectedSkill.catalogStatus === "changed"
                                    ? "status-pill-warn"
                                    : "status-pill-plain"
                              }`}
                            >
                              {workspaceStatusLabel(selectedSkill.catalogStatus)}
                            </span>
                          </div>
                          <p className="caption-text">
                            {selectedCatalogSkill?.path ??
                              "当前远端镜像里还没有这个 skill。"}
                          </p>
                        </div>
                        <ActionButton
                          label={
                            selectedSkill.catalogStatus === "missing"
                              ? "同步"
                              : selectedSkill.catalogStatus === "changed"
                                ? "更新镜像"
                                : "重传镜像"
                          }
                          icon={<Upload size={16} />}
                          busy={
                            busyKey ===
                            `import:${selectedSkill.sourceId}:${selectedSkill.id}`
                          }
                          onClick={() =>
                            runAction(
                              "/api/actions/import",
                              {
                                skillId: selectedSkill.id,
                                libraryId: selectedSkill.sourceId,
                              },
                              `import:${selectedSkill.sourceId}:${selectedSkill.id}`,
                            )
                          }
                          tone={
                            selectedSkill.catalogStatus === "synced"
                              ? "ghost"
                              : "secondary"
                          }
                          size="compact"
                        />
                      </div>

                      {selectedLibrarySyncTargets.map(({ library, installedSkill }) => (
                        <div className="install-item" key={library.id}>
                          <div>
                            <div className="install-item-title">
                              <span>{library.label}</span>
                              <span
                                className={`status-pill ${
                                  !installedSkill
                                    ? "status-pill-plain"
                                    : installedSkill.hash === selectedSkill.hash
                                      ? "status-pill-good"
                                      : "status-pill-warn"
                                }`}
                              >
                                {!installedSkill
                                  ? "未安装"
                                  : installedSkill.hash === selectedSkill.hash
                                    ? "已一致"
                                    : "有差异"}
                              </span>
                            </div>
                            <p className="caption-text">
                              {installedSkill?.path ??
                                `将同步到 ${library.path}/${selectedSkill.id}`}
                            </p>
                          </div>
                          <ActionButton
                            label={
                              !installedSkill
                                ? "同步过去"
                                : installedSkill.hash === selectedSkill.hash
                                  ? "覆盖同步"
                                  : "更新为当前版本"
                            }
                            icon={<ArrowRightLeft size={16} />}
                            busy={
                              busyKey ===
                              `sync-library:${selectedSkill.sourceId}:${library.id}:${selectedSkill.id}`
                            }
                            onClick={() =>
                              runAction(
                                "/api/actions/sync-library",
                                {
                                  skillId: selectedSkill.id,
                                  sourceLibraryId: selectedSkill.sourceId,
                                  targetLibraryId: library.id,
                                },
                                `sync-library:${selectedSkill.sourceId}:${library.id}:${selectedSkill.id}`,
                              )
                            }
                            tone={
                              installedSkill && installedSkill.hash === selectedSkill.hash
                                ? "ghost"
                                : "secondary"
                            }
                            size="compact"
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {selectedSkill.locationType === "catalog" ? (
                    <div className="install-stack">
                      {selectedSkill.installations.map((installation) => (
                        <div className="install-item" key={installation.libraryId}>
                          <div>
                            <div className="install-item-title">
                              <span>{installation.libraryLabel}</span>
                              <span
                                className={`status-pill ${installationStatusTone(
                                  installation.status,
                                )}`}
                              >
                                {installationStatusLabel(installation.status)}
                              </span>
                            </div>
                            <p className="caption-text">{installation.targetPath}</p>
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
                            busy={
                              busyKey ===
                              `install:${selectedSkill.id}:${installation.libraryId}`
                            }
                            onClick={() =>
                              runAction(
                                "/api/actions/install",
                                {
                                  skillId: selectedSkill.id,
                                  libraryId: installation.libraryId,
                                },
                                `install:${selectedSkill.id}:${installation.libraryId}`,
                              )
                            }
                            tone={
                              installation.status === "installed" ? "ghost" : "secondary"
                            }
                            size="compact"
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="preview-tab-row">
                    {(
                      [
                        { key: "overview", label: "概览", icon: LayoutPanelTop },
                        { key: "skill", label: "SKILL.md", icon: Bot },
                        { key: "readme", label: "README", icon: FileCode2 },
                        { key: "files", label: "文件", icon: Files },
                        { key: "package", label: "package", icon: FileJson2 },
                        { key: "manifest", label: "manifest", icon: CheckCircle2 },
                      ] satisfies Array<{
                        key: PreviewTab;
                        label: string;
                        icon: typeof LayoutPanelTop;
                      }>
                    )
                      .filter((tab) => {
                        if (tab.key === "readme") {
                          return Boolean(selectedDetail?.readmeMarkdown);
                        }

                        if (tab.key === "package") {
                          return Boolean(selectedDetail?.packageJson);
                        }

                        if (tab.key === "manifest") {
                          return Boolean(selectedDetail?.manifest);
                        }

                        return true;
                      })
                      .map((tab) => {
                        const Icon = tab.icon;

                        return (
                          <button
                            type="button"
                            key={tab.key}
                            className={`preview-tab ${previewTab === tab.key ? "preview-tab-active" : ""}`}
                            onClick={() => setPreviewTab(tab.key)}
                          >
                            <Icon size={14} />
                            <span>{tab.label}</span>
                          </button>
                        );
                      })}
                  </div>

                  {detailLoadingKey === detailCacheKey ? (
                    <div className="empty-state">
                      <RefreshCw size={24} className="spin" />
                      <p>正在加载预览内容…</p>
                    </div>
                  ) : null}

                  {selectedDetail ? (
                    <div className="preview-body">
                      {previewTab === "overview" ? (
                        <>
                          <div className="info-grid">
                            <div className="info-pill">
                              <FolderCog size={16} />
                              <span>{selectedDetail.skill.path}</span>
                            </div>
                            <div className="info-pill">
                              <Blocks size={16} />
                              <span>{selectedDetail.totalFiles} 个文件</span>
                            </div>
                            <div className="info-pill">
                              <LibraryBig size={16} />
                              <span>{selectedDetail.skill.sourceLabel}</span>
                            </div>
                          </div>

                          <div className="overview-dual">
                            <div className="surface-subcard">
                              <h4 className="subcard-title">说明预览</h4>
                              <MarkdownPanel
                                content={
                                  selectedDetail.readmeMarkdown ||
                                  selectedDetail.skillMarkdown
                                }
                              />
                            </div>
                            <div className="surface-subcard">
                              <h4 className="subcard-title">Frontmatter</h4>
                              <JsonPanel value={selectedDetail.frontmatter} />
                            </div>
                          </div>
                        </>
                      ) : null}

                      {previewTab === "skill" ? (
                        <MarkdownPanel content={selectedDetail.skillMarkdown} />
                      ) : null}

                      {previewTab === "readme" ? (
                        <MarkdownPanel content={selectedDetail.readmeMarkdown} />
                      ) : null}

                      {previewTab === "package" ? (
                        <JsonPanel value={selectedDetail.packageJson} />
                      ) : null}

                      {previewTab === "manifest" ? (
                        <JsonPanel
                          value={
                            selectedDetail.manifest as unknown as Record<string, unknown>
                          }
                        />
                      ) : null}

                      {previewTab === "files" ? (
                        <div className="file-list">
                          {selectedDetail.files.map((file) => (
                            <div className="file-item" key={file.path}>
                              <span>{file.path}</span>
                              <span>{formatBytes(file.sizeBytes)}</span>
                            </div>
                          ))}
                          {selectedDetail.totalFiles > selectedDetail.files.length ? (
                            <p className="caption-text">
                              仅展示前 {selectedDetail.files.length} 个文件，实际共{" "}
                              {selectedDetail.totalFiles} 个。
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="empty-state">
                  <LibraryBig size={28} />
                  <p>选择一个 skill 之后，这里会展示预览和操作面板。</p>
                </div>
              )}
            </article>
          </section>
          )}
        </section>
      </section>
    </main>
  );
}
