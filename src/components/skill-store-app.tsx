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
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  CloudUpload,
  LayoutGrid,
  LayoutPanelTop,
  PencilLine,
  Plus,
  Radar,
  RefreshCw,
  Search,
  ShieldAlert,
  Tags,
  Trash2,
  UserCircle2,
  X,
} from "lucide-react";

import type {
  ActionResponse,
  CatalogSkill,
  DashboardData,
  SkillDetail,
  WorkspaceSkill,
} from "@/lib/skillhub-types";

type SkillStoreAppProps = {
  initialData: DashboardData;
};

type MainTab = "skills" | "similar" | "dashboard" | "sync" | "trash";
type AgentTab = "all" | "claude" | "codex" | "agents";
type ViewMode = "table" | "cards";
type SortKey =
  | "name"
  | "claude"
  | "codex"
  | "localVersion"
  | "cloudVersion"
  | "sync"
  | "updatedAt";
type SortDirection = "asc" | "desc";
type FilterSource = "claude" | "codex" | "agents" | "catalog";
type FilterStatus = "synced" | "changed" | "unbacked" | "partial" | "cloud-only";
type BadgeTone =
  | "neutral"
  | "claude"
  | "codex"
  | "agents"
  | "catalog"
  | "success"
  | "warning"
  | "danger";
type SyncState = FilterStatus | "idle";

type SkillCell = {
  id: string;
  label: string;
  present: boolean;
  tone: BadgeTone;
  path?: string;
  stateLabel: string;
  versionLabel: string;
};

type SkillEntity = {
  id: string;
  name: string;
  displayPath: string;
  description: string;
  baseDescription: string;
  tags: string[];
  baseTags: string[];
  customTags: string[];
  preferredSources: string[];
  trashed: boolean;
  note?: string;
  claude?: WorkspaceSkill;
  codex?: WorkspaceSkill;
  agents?: WorkspaceSkill;
  catalog?: CatalogSkill;
  cells: Record<FilterSource, SkillCell>;
  localVersion: string;
  cloudVersion: string;
  syncState: SyncState;
  syncLabel: string;
  syncTone: BadgeTone;
  updatedAt: string;
  mirroredSources: string[];
  riskFlags: string[];
};

type SimilarGroup = {
  label: string;
  description: string;
  items: SkillEntity[];
};

const PAGE_SIZE = 15;

const SOURCE_META: Record<
  FilterSource,
  { label: string; tab: AgentTab | "all"; accent: BadgeTone }
> = {
  claude: { label: "Claude Code", tab: "claude", accent: "claude" },
  codex: { label: "Codex", tab: "codex", accent: "codex" },
  agents: { label: "Agents", tab: "agents", accent: "agents" },
  catalog: { label: "云端镜像", tab: "all", accent: "catalog" },
};

function normalizeVersion(record?: WorkspaceSkill | CatalogSkill) {
  if (!record) {
    return "—";
  }

  if (record.version) {
    return record.version;
  }

  return record.hash.slice(0, 7);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatDate(value: string) {
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

function statusBadge(syncState: SyncState): { label: string; tone: BadgeTone } {
  if (syncState === "synced") {
    return { label: "已同步", tone: "success" };
  }

  if (syncState === "changed") {
    return { label: "存在差异", tone: "danger" };
  }

  if (syncState === "partial") {
    return { label: "部分同步", tone: "warning" };
  }

  if (syncState === "unbacked") {
    return { label: "未备份", tone: "warning" };
  }

  if (syncState === "cloud-only") {
    return { label: "仅云端", tone: "neutral" };
  }

  return { label: "待整理", tone: "neutral" };
}

function sortValueForCell(cell: SkillCell) {
  if (cell.stateLabel === "已同步") {
    return 0;
  }

  if (cell.stateLabel === "仅本地" || cell.stateLabel === "仅云端") {
    return 1;
  }

  if (cell.stateLabel === "缺失") {
    return 2;
  }

  if (cell.stateLabel === "存在差异") {
    return 3;
  }

  return 4;
}

function buildSkillEntities(data: DashboardData): SkillEntity[] {
  const workspaceById = new Map<string, WorkspaceSkill[]>();

  data.workspaceSkills.forEach((skill) => {
    workspaceById.set(skill.id, [...(workspaceById.get(skill.id) ?? []), skill]);
  });

  const catalogById = new Map(data.catalogSkills.map((skill) => [skill.id, skill]));
  const ids = unique([
    ...data.workspaceSkills.map((skill) => skill.id),
    ...data.catalogSkills.map((skill) => skill.id),
    ...Object.keys(data.meta.records),
  ]);

  return ids
    .map<SkillEntity | null>((id) => {
      const localGroup = workspaceById.get(id) ?? [];
      const claude = localGroup.find((skill) => skill.sourceId === "claude");
      const codex = localGroup.find((skill) => skill.sourceId === "codex");
      const agents = localGroup.find((skill) => skill.sourceId === "agents");
      const catalog = catalogById.get(id);
      const meta = data.meta.records[id];
      const primary = claude ?? codex ?? agents ?? catalog;

      if (!primary) {
        return null;
      }

      const combinedTags = unique([
        ...localGroup.flatMap((skill) => skill.tags),
        ...(catalog?.tags ?? []),
      ]);
      const customTags = meta?.tags ?? [];
      const tags = unique([...combinedTags, ...customTags]);
      const localVersions = unique(localGroup.map((skill) => normalizeVersion(skill)));
      const localVersion =
        localVersions.length === 0
          ? "—"
          : localVersions.length === 1
            ? localVersions[0]
            : "多版本";
      const cloudVersion = normalizeVersion(catalog);
      const localHashes = unique(localGroup.map((skill) => skill.hash));
      const hasLocal = localGroup.length > 0;
      const hasCatalog = Boolean(catalog);
      const localMatchesCatalog = Boolean(
        catalog &&
          localGroup.length > 0 &&
          localGroup.every((skill) => skill.hash === catalog.hash),
      );
      const localConflict = localHashes.length > 1;
      let syncState: SyncState = "idle";

      if (hasCatalog && hasLocal && localMatchesCatalog) {
        syncState = "synced";
      } else if (hasCatalog && hasLocal && !localMatchesCatalog) {
        syncState = "changed";
      } else if (!hasCatalog && hasLocal) {
        syncState = "unbacked";
      } else if (hasCatalog && !hasLocal) {
        syncState = "cloud-only";
      }

      if (!localConflict && hasCatalog && hasLocal) {
        const missingLocal = data.config.libraries.some(
          (library) =>
            ["claude", "codex", "agents"].includes(library.id) &&
            !localGroup.some((skill) => skill.sourceId === library.id),
        );

        if (missingLocal && localMatchesCatalog) {
          syncState = "partial";
        }
      }

      if (localConflict) {
        syncState = "changed";
      }

      const syncInfo = statusBadge(syncState);
      const describeLocalCell = (
        sourceId: Exclude<FilterSource, "catalog">,
        record?: WorkspaceSkill,
      ): SkillCell => {
        const label = SOURCE_META[sourceId].label;

        if (!record) {
          return {
            id: label,
            label,
            present: false,
            tone: "neutral",
            stateLabel: hasCatalog ? "缺失" : "—",
            versionLabel: "—",
          };
        }

        if (!catalog) {
          return {
            id: label,
            label,
            present: true,
            tone: SOURCE_META[sourceId].accent,
            path: record.relativePath || record.path,
            stateLabel: "仅本地",
            versionLabel: normalizeVersion(record),
          };
        }

        return {
          id: label,
          label,
          present: true,
          tone: record.hash === catalog.hash ? "success" : "danger",
          path: record.relativePath || record.path,
          stateLabel: record.hash === catalog.hash ? "已同步" : "存在差异",
          versionLabel: normalizeVersion(record),
        };
      };

      const cloudCell: SkillCell = catalog
        ? {
            id: "catalog",
            label: SOURCE_META.catalog.label,
            present: true,
            tone: hasLocal && localMatchesCatalog ? "success" : hasLocal ? "danger" : "catalog",
            path: catalog.relativePath || catalog.path,
            stateLabel: hasLocal ? (localMatchesCatalog ? "已同步" : "存在差异") : "仅云端",
            versionLabel: normalizeVersion(catalog),
          }
        : {
            id: "catalog",
            label: SOURCE_META.catalog.label,
            present: false,
            tone: "neutral",
            stateLabel: hasLocal ? "未备份" : "—",
            versionLabel: "—",
          };

      const riskFlags = unique([
        primary.fileCount > 25 ? "大体积" : "",
        localGroup.some((skill) => skill.commands.length > 0) || (catalog?.commands.length ?? 0) > 0
          ? "含脚本"
          : "",
        primary.homepage ? "外部来源" : "",
      ]);

      const mirroredSources = localGroup.map((skill) => skill.sourceId);
      const primaryPath =
        claude?.relativePath ??
        codex?.relativePath ??
        agents?.relativePath ??
        catalog?.relativePath ??
        primary.relativePath ??
        `/${id}`;

      return {
        id,
        name: primary.name,
        displayPath: primaryPath.startsWith("/") ? primaryPath : `/${id}`,
        description: meta?.note || primary.shortDescription || primary.description,
        baseDescription: primary.description,
        tags,
        baseTags: combinedTags,
        customTags,
        preferredSources: meta?.preferredSources ?? [],
        trashed: Boolean(meta?.trashed),
        note: meta?.note,
        claude,
        codex,
        agents,
        catalog,
        cells: {
          claude: describeLocalCell("claude", claude),
          codex: describeLocalCell("codex", codex),
          agents: describeLocalCell("agents", agents),
          catalog: cloudCell,
        },
        localVersion,
        cloudVersion,
        syncState,
        syncLabel: syncInfo.label,
        syncTone: syncInfo.tone,
        updatedAt: [meta?.updatedAt, primary.updatedAt, catalog?.updatedAt]
          .filter(Boolean)
          .sort()
          .at(-1) as string,
        mirroredSources,
        riskFlags,
      } satisfies SkillEntity;
    })
    .filter((entity): entity is SkillEntity => entity !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function matchesAgentTab(entity: SkillEntity, tab: AgentTab) {
  if (tab === "all") {
    return true;
  }

  if (tab === "claude") {
    return Boolean(entity.claude || entity.catalog?.installations.some((item) => item.libraryId === "claude"));
  }

  if (tab === "codex") {
    return Boolean(entity.codex || entity.catalog?.installations.some((item) => item.libraryId === "codex"));
  }

  return Boolean(entity.agents || entity.catalog?.installations.some((item) => item.libraryId === "agents"));
}

function matchesSearch(entity: SkillEntity, query: string) {
  if (!query) {
    return true;
  }

  return [
    entity.id,
    entity.name,
    entity.displayPath,
    entity.description,
    entity.baseDescription,
    entity.localVersion,
    entity.cloudVersion,
    entity.syncLabel,
    ...entity.tags,
    entity.cells.claude.stateLabel,
    entity.cells.codex.stateLabel,
    entity.cells.agents.stateLabel,
    entity.cells.catalog.stateLabel,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function sortEntities(
  items: SkillEntity[],
  sortKey: SortKey,
  direction: SortDirection,
) {
  const multiplier = direction === "asc" ? 1 : -1;

  return [...items].sort((left, right) => {
    const compareText = (a: string, b: string) => a.localeCompare(b) * multiplier;
    const compareNumber = (a: number, b: number) => (a - b) * multiplier;

    if (sortKey === "name") {
      return compareText(left.name, right.name);
    }

    if (sortKey === "claude") {
      return compareNumber(
        sortValueForCell(left.cells.claude),
        sortValueForCell(right.cells.claude),
      );
    }

    if (sortKey === "codex") {
      return compareNumber(
        sortValueForCell(left.cells.codex),
        sortValueForCell(right.cells.codex),
      );
    }

    if (sortKey === "localVersion") {
      return compareText(left.localVersion, right.localVersion);
    }

    if (sortKey === "cloudVersion") {
      return compareText(left.cloudVersion, right.cloudVersion);
    }

    if (sortKey === "updatedAt") {
      return compareNumber(
        new Date(left.updatedAt).getTime(),
        new Date(right.updatedAt).getTime(),
      );
    }

    return compareNumber(
      ["synced", "partial", "cloud-only", "unbacked", "changed", "idle"].indexOf(
        left.syncState,
      ),
      ["synced", "partial", "cloud-only", "unbacked", "changed", "idle"].indexOf(
        right.syncState,
      ),
    );
  });
}

function buildSimilarGroups(entities: SkillEntity[]): SimilarGroup[] {
  const sameSourceDuplicates: SimilarGroup[] = [];
  const mirrored = entities.filter((entity) => entity.mirroredSources.length > 1);

  if (mirrored.length > 0) {
    sameSourceDuplicates.push({
      label: "跨平台映射",
      description:
        "这些技能同时存在于 Claude Code、Codex 或 Agents 中。它们是正常镜像关系，不再被当作重复冲突。",
      items: mirrored,
    });
  }

  return sameSourceDuplicates;
}

function pickPreferredLocalSource(entity: SkillEntity, agentTab: AgentTab) {
  const order = unique([
    ...entity.preferredSources,
    agentTab === "all" ? "" : agentTab,
    "claude",
    "codex",
    "agents",
  ]).filter(Boolean);

  return order.find((sourceId) =>
    ["claude", "codex", "agents"].includes(sourceId) &&
    Boolean(entity[sourceId as "claude" | "codex" | "agents"]),
  );
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
    throw new Error("无法刷新技能管理面板。");
  }

  return (await response.json()) as DashboardData;
}

function HighlightedText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  if (!query) {
    return <>{text}</>;
  }

  const index = text.toLowerCase().indexOf(query.toLowerCase());

  if (index < 0) {
    return <>{text}</>;
  }

  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: React.ReactNode;
}) {
  return <span className={`spa-badge spa-badge-${tone}`}>{children}</span>;
}

function EmptyPanel({
  title,
  copy,
  icon,
}: {
  title: string;
  copy: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="spa-empty-panel">
      <div>{icon}</div>
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

export function SkillStoreApp({ initialData }: SkillStoreAppProps) {
  const [data, setData] = useState(initialData);
  const [mainTab, setMainTab] = useState<MainTab>("skills");
  const [agentTab, setAgentTab] = useState<AgentTab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sourceFilters, setSourceFilters] = useState<FilterSource[]>([]);
  const [statusFilters, setStatusFilters] = useState<FilterStatus[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );
  const [detailsCache, setDetailsCache] = useState<Record<string, SkillDetail>>({});
  const [detailSourceKey, setDetailSourceKey] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftNote, setDraftNote] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const allEntities = useMemo(() => buildSkillEntities(data), [data]);
  const suggestedTags = useMemo(
    () =>
      unique([
        ...data.meta.tagCatalog,
        ...allEntities.flatMap((entity) => entity.tags),
      ]).slice(0, 24),
    [allEntities, data.meta.tagCatalog],
  );

  const visibleEntities = useMemo(() => {
    return sortEntities(
      allEntities.filter((entity) => {
        const inTrash = entity.trashed;

        if (mainTab === "trash") {
          if (!inTrash) {
            return false;
          }
        } else if (inTrash) {
          return false;
        }

        if (!matchesAgentTab(entity, agentTab)) {
          return false;
        }

        if (selectedTag && !entity.tags.includes(selectedTag)) {
          return false;
        }

        if (sourceFilters.length > 0) {
          const sourceMatch = sourceFilters.some((sourceId) => entity.cells[sourceId].present);
          if (!sourceMatch) {
            return false;
          }
        }

        if (statusFilters.length > 0 && !statusFilters.includes(entity.syncState as FilterStatus)) {
          return false;
        }

        return matchesSearch(entity, deferredSearch);
      }),
      sortKey,
      sortDirection,
    );
  }, [
    agentTab,
    allEntities,
    deferredSearch,
    mainTab,
    selectedTag,
    sortDirection,
    sortKey,
    sourceFilters,
    statusFilters,
  ]);

  const pageCount = Math.max(1, Math.ceil(visibleEntities.length / PAGE_SIZE));
  const pagedEntities = visibleEntities.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const similarGroups = useMemo(
    () => buildSimilarGroups(allEntities.filter((entity) => !entity.trashed)),
    [allEntities],
  );

  const activeEntity = allEntities.find((entity) => entity.id === activeSkillId) ?? null;
  const detailSourceOptions = useMemo(() => {
    if (!activeEntity) {
      return [];
    }

    return [
      activeEntity.claude
        ? {
            key: "library:claude",
            label: "Claude Code",
            sourceId: "claude",
            locationType: "library" as const,
            record: activeEntity.claude,
          }
        : null,
      activeEntity.codex
        ? {
            key: "library:codex",
            label: "Codex",
            sourceId: "codex",
            locationType: "library" as const,
            record: activeEntity.codex,
          }
        : null,
      activeEntity.agents
        ? {
            key: "library:agents",
            label: "Agents",
            sourceId: "agents",
            locationType: "library" as const,
            record: activeEntity.agents,
          }
        : null,
      activeEntity.catalog
        ? {
            key: "catalog:catalog",
            label: "云端镜像",
            sourceId: "catalog",
            locationType: "catalog" as const,
            record: activeEntity.catalog,
          }
        : null,
    ].filter(Boolean) as Array<{
      key: string;
      label: string;
      sourceId: string;
      locationType: "library" | "catalog";
      record: WorkspaceSkill | CatalogSkill;
    }>;
  }, [activeEntity]);

  const selectedDetailSource =
    detailSourceOptions.find((item) => item.key === detailSourceKey) ??
    detailSourceOptions[0];
  const detailCacheKey = selectedDetailSource
    ? `${selectedDetailSource.locationType}:${selectedDetailSource.sourceId}:${selectedDetailSource.record.id}`
    : null;
  const selectedDetail = detailCacheKey ? detailsCache[detailCacheKey] : undefined;

  function applyDashboard(nextData: DashboardData) {
    startTransition(() => {
      setData(nextData);
    });
  }

  async function postAction(endpoint: string, body: unknown) {
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

    return payload.dashboard;
  }

  async function runAction(
    endpoint: string,
    body: unknown,
    key: string,
    successText: string,
    confirmMessage?: string,
  ) {
    if (confirmMessage && !window.confirm(confirmMessage)) {
      return false;
    }

    setBusyKey(key);
    setNotice(null);

    try {
      const nextDashboard = await postAction(endpoint, body);
      applyDashboard(nextDashboard);
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
          applyDashboard(nextDashboard);
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
    setPage(1);
  }, [agentTab, mainTab, selectedTag, search, sourceFilters, statusFilters, sortDirection, sortKey, viewMode]);

  useEffect(() => {
    const visibleIds = new Set(visibleEntities.map((entity) => entity.id));
    setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [visibleEntities]);

  useEffect(() => {
    if (!activeEntity) {
      setDraftTags([]);
      setDraftNote("");
      setDetailSourceKey(null);
      return;
    }

    setDraftTags(activeEntity.customTags);
    setDraftNote(activeEntity.note ?? activeEntity.baseDescription);
  }, [activeEntity]);

  useEffect(() => {
    if (!detailSourceOptions.length) {
      setDetailSourceKey(null);
      return;
    }

    if (!detailSourceKey || !detailSourceOptions.some((item) => item.key === detailSourceKey)) {
      setDetailSourceKey(detailSourceOptions[0].key);
    }
  }, [detailSourceKey, detailSourceOptions]);

  useEffect(() => {
    const source = selectedDetailSource;

    if (!source || !detailCacheKey || detailsCache[detailCacheKey]) {
      return;
    }

    const cacheKey = detailCacheKey;
    let cancelled = false;
    setBusyKey(`detail:${cacheKey}`);

    async function loadDetail() {
      try {
        const response = await fetch(
          `/api/skills/detail?skillId=${encodeURIComponent(source.record.id)}&sourceId=${encodeURIComponent(source.sourceId)}&locationType=${source.locationType}`,
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
  }, [detailCacheKey, detailsCache, selectedDetailSource]);

  async function saveMetaForSkills(skillIds: string[], options: {
    note?: string;
    tags?: string[];
    trashed?: boolean;
    preferredSources?: string[];
    mergeTags?: boolean;
  }) {
    return runAction(
      "/api/actions/skill-meta",
      {
        skillIds,
        ...options,
      },
      `meta:${skillIds.join(",")}`,
      "技能标签与备注已更新。",
    );
  }

  async function syncEntityToCatalog(entity: SkillEntity) {
    const sourceId = pickPreferredLocalSource(entity, agentTab);

    if (!sourceId) {
      setNotice({
        kind: "error",
        text: `/${entity.id} 当前没有可作为基线的本地版本。`,
      });
      return false;
    }

    return runAction(
      "/api/actions/import",
      {
        skillId: entity.id,
        libraryId: sourceId,
      },
      `import:${entity.id}:${sourceId}`,
      `已将 /${entity.id} 同步到云端镜像。`,
    );
  }

  async function toggleLibrary(entity: SkillEntity, targetId: FilterSource, enabled: boolean) {
    if (targetId === "catalog") {
      if (enabled) {
        return syncEntityToCatalog(entity);
      }

      return runAction(
        "/api/actions/delete-catalog",
        { skillId: entity.id },
        `delete-catalog:${entity.id}`,
        `已从云端镜像移除 /${entity.id}。`,
        `确认把 /${entity.id} 从云端镜像移除吗？`,
      );
    }

    if (enabled) {
      if (entity.catalog) {
        return runAction(
          "/api/actions/install",
          { skillId: entity.id, libraryId: targetId },
          `install:${entity.id}:${targetId}`,
          `已把 /${entity.id} 安装到 ${SOURCE_META[targetId].label}。`,
        );
      }

      const sourceId = pickPreferredLocalSource(entity, agentTab);

      if (!sourceId || sourceId === targetId) {
        setNotice({
          kind: "error",
          text: `/${entity.id} 当前没有可同步到 ${SOURCE_META[targetId].label} 的来源。`,
        });
        return false;
      }

      return runAction(
        "/api/actions/sync-library",
        {
          skillId: entity.id,
          sourceLibraryId: sourceId,
          targetLibraryId: targetId,
        },
        `sync-library:${entity.id}:${sourceId}:${targetId}`,
        `已把 /${entity.id} 从 ${SOURCE_META[sourceId as FilterSource].label} 同步到 ${SOURCE_META[targetId].label}。`,
      );
    }

    return runAction(
      "/api/actions/remove-library",
      { skillId: entity.id, libraryId: targetId },
      `remove:${entity.id}:${targetId}`,
      `已从 ${SOURCE_META[targetId].label} 移除 /${entity.id}。`,
      `确认从 ${SOURCE_META[targetId].label} 移除 /${entity.id} 吗？`,
    );
  }

  async function batchSyncSelected() {
    const candidates = allEntities.filter((entity) => selectedIds.includes(entity.id));

    if (candidates.length === 0) {
      return;
    }

    setBusyKey("batch-sync");

    try {
      for (const entity of candidates) {
        const sourceId = pickPreferredLocalSource(entity, agentTab);

        if (!sourceId) {
          continue;
        }

        await postAction("/api/actions/import", {
          skillId: entity.id,
          libraryId: sourceId,
        });
      }

      const nextDashboard = await fetchDashboardData();
      applyDashboard(nextDashboard);
      setNotice({
        kind: "success",
        text: `已批量同步 ${candidates.length} 个 skills 到云端镜像。`,
      });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "批量同步失败。",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function batchTagSelected() {
    if (selectedIds.length === 0) {
      return;
    }

    const raw = window.prompt("输入要追加的标签，多个标签请用逗号分隔。");

    if (!raw) {
      return;
    }

    const tags = unique(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    );

    if (tags.length === 0) {
      return;
    }

    await saveMetaForSkills(selectedIds, {
      tags,
      mergeTags: true,
    });
  }

  function toggleSourceFilter(sourceId: FilterSource) {
    setSourceFilters((current) =>
      current.includes(sourceId)
        ? current.filter((item) => item !== sourceId)
        : [...current, sourceId],
    );
  }

  function toggleStatusFilter(status: FilterStatus) {
    setStatusFilters((current) =>
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    );
  }

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "name" ? "asc" : "desc");
  }

  function toggleSelection(skillId: string) {
    setSelectedIds((current) =>
      current.includes(skillId)
        ? current.filter((item) => item !== skillId)
        : [...current, skillId],
    );
  }

  function addDraftTag() {
    if (!tagInput.trim()) {
      return;
    }

    setDraftTags((current) => unique([...current, tagInput.trim()]));
    setTagInput("");
  }

  const topNav = [
    { key: "skills", label: "Skills" },
    { key: "similar", label: "相似检测" },
    { key: "dashboard", label: "仪表盘" },
    { key: "sync", label: "同步" },
    { key: "trash", label: "回收站", badge: data.meta.trashedCount },
  ] satisfies Array<{ key: MainTab; label: string; badge?: number }>;

  const agentTabs = [
    { key: "all", label: "全部", count: allEntities.filter((entity) => !entity.trashed).length },
    {
      key: "claude",
      label: "Claude Code",
      count: allEntities.filter((entity) => !entity.trashed && matchesAgentTab(entity, "claude")).length,
    },
    {
      key: "codex",
      label: "Codex",
      count: allEntities.filter((entity) => !entity.trashed && matchesAgentTab(entity, "codex")).length,
    },
    {
      key: "agents",
      label: "Agents",
      count: allEntities.filter((entity) => !entity.trashed && matchesAgentTab(entity, "agents")).length,
    },
  ] satisfies Array<{ key: AgentTab; label: string; count: number }>;

  const counters = {
    local: allEntities.filter(
      (entity) => !entity.trashed && (entity.claude || entity.codex || entity.agents),
    ).length,
    catalog: allEntities.filter((entity) => !entity.trashed && entity.catalog).length,
    changed: allEntities.filter((entity) => !entity.trashed && entity.syncState === "changed").length,
    pending: allEntities.filter(
      (entity) =>
        !entity.trashed &&
        (entity.syncState === "partial" || entity.syncState === "unbacked" || entity.syncState === "cloud-only"),
    ).length,
    synced: allEntities.filter((entity) => !entity.trashed && entity.syncState === "synced").length,
  };

  return (
    <main className="spa-shell">
      <header className="spa-topbar">
        <div className="spa-brand">
          <div className="spa-logo">千</div>
          <div>
            <strong>千逐 Skill 管理器</strong>
            <span>单页 SPA · Skills-first 管理台</span>
          </div>
        </div>

        <nav className="spa-topnav">
          {topNav.map((item) => (
            <button
              key={item.key}
              type="button"
              className={mainTab === item.key ? "spa-topnav-active" : ""}
              onClick={() => setMainTab(item.key)}
            >
              {item.label}
              {item.badge ? <span>{item.badge}</span> : null}
            </button>
          ))}
        </nav>

        <div className="spa-toptools">
          <label className="spa-search">
            <Search size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索 Claude Code / Codex 技能路径、描述或标签…"
            />
          </label>
          <button
            type="button"
            className="spa-primary-button"
            disabled={busyKey === "scan"}
            onClick={async () => {
              setBusyKey("scan");
              setNotice(null);

              try {
                const nextDashboard = await fetchDashboardData();
                applyDashboard(nextDashboard);
                setNotice({ kind: "success", text: "扫描完成，当前视图已刷新。" });
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
            <RefreshCw size={16} className={busyKey === "scan" ? "spin" : ""} />
            一键扫描
          </button>
          <div className="spa-avatar">
            <UserCircle2 size={24} />
          </div>
        </div>
      </header>

      {mainTab === "skills" ? (
        <section className="spa-subtabs">
          {agentTabs.map((item) => (
            <button
              key={item.key}
              type="button"
              className={agentTab === item.key ? "spa-subtabs-active" : ""}
              onClick={() => setAgentTab(item.key)}
            >
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </section>
      ) : null}

      <div className="spa-body">
        <aside className={`spa-sidebar ${sidebarCollapsed ? "spa-sidebar-collapsed" : ""}`}>
          <button
            type="button"
            className="spa-sidebar-toggle"
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          {!sidebarCollapsed ? (
            <>
              <section className="spa-sidebar-section">
                <h3>全部 Skills</h3>
                <button type="button" onClick={() => setAgentTab("all")}>
                  <span>全部 Skills</span>
                  <strong>{allEntities.filter((entity) => !entity.trashed).length}</strong>
                </button>
                <button type="button" className={agentTab === "claude" ? "active" : ""} onClick={() => setAgentTab("claude")}>
                  <span>Claude Code</span>
                  <strong>{agentTabs.find((item) => item.key === "claude")?.count ?? 0}</strong>
                </button>
                <button type="button" className={agentTab === "codex" ? "active" : ""} onClick={() => setAgentTab("codex")}>
                  <span>Codex</span>
                  <strong>{agentTabs.find((item) => item.key === "codex")?.count ?? 0}</strong>
                </button>
                <button type="button" className={agentTab === "agents" ? "active" : ""} onClick={() => setAgentTab("agents")}>
                  <span>Agents</span>
                  <strong>{agentTabs.find((item) => item.key === "agents")?.count ?? 0}</strong>
                </button>
              </section>

              <section className="spa-sidebar-section">
                <h3>快速过滤</h3>
                <button type="button" onClick={() => setSourceFilters(["claude", "codex", "agents"])}>
                  <span>本地 Skills</span>
                  <strong>{counters.local}</strong>
                </button>
                <button type="button" onClick={() => setSourceFilters(["catalog"])}>
                  <span>云端镜像</span>
                  <strong>{counters.catalog}</strong>
                </button>
                <button type="button" onClick={() => setStatusFilters(["changed"])}>
                  <span>有差异 / 冲突</span>
                  <strong>{counters.changed}</strong>
                </button>
                <button type="button" onClick={() => setStatusFilters(["partial", "unbacked", "cloud-only"])}>
                  <span>待同步</span>
                  <strong>{counters.pending}</strong>
                </button>
              </section>

              <section className="spa-sidebar-section">
                <h3>来源标签</h3>
                <button type="button" onClick={() => setSourceFilters(["claude", "codex", "agents"])}>
                  <span>本地</span>
                  <strong>{counters.local}</strong>
                </button>
                <button type="button" onClick={() => setSourceFilters(["agents"])}>
                  <span>Agents 平台</span>
                  <strong>{agentTabs.find((item) => item.key === "agents")?.count ?? 0}</strong>
                </button>
                <button type="button" onClick={() => setStatusFilters(["changed", "partial"])}>
                  <span>有更新</span>
                  <strong>{counters.changed + counters.pending}</strong>
                </button>
                <button type="button" onClick={() => setStatusFilters(["synced"])}>
                  <span>已同步</span>
                  <strong>{counters.synced}</strong>
                </button>
              </section>
            </>
          ) : null}
        </aside>

        <section className="spa-main">
          {notice ? (
            <div className={`spa-notice spa-notice-${notice.kind}`}>{notice.text}</div>
          ) : null}

          {mainTab === "skills" ? (
            <>
              <div className="spa-toolbar">
                <div className="spa-toolbar-left">
                  <div className="spa-view-switch">
                    <button
                      type="button"
                      className={viewMode === "table" ? "active" : ""}
                      onClick={() => setViewMode("table")}
                    >
                      <LayoutPanelTop size={16} />
                      表格视图
                    </button>
                    <button
                      type="button"
                      className={viewMode === "cards" ? "active" : ""}
                      onClick={() => setViewMode("cards")}
                    >
                      <LayoutGrid size={16} />
                      卡片视图
                    </button>
                  </div>

                  <div className="spa-filter-row">
                    {(
                      ["claude", "codex", "agents", "catalog"] as FilterSource[]
                    ).map((sourceId) => (
                      <button
                        key={sourceId}
                        type="button"
                        className={sourceFilters.includes(sourceId) ? "active" : ""}
                        onClick={() => toggleSourceFilter(sourceId)}
                      >
                        {SOURCE_META[sourceId].label}
                      </button>
                    ))}
                    {(
                      ["synced", "changed", "unbacked", "partial", "cloud-only"] as FilterStatus[]
                    ).map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={statusFilters.includes(status) ? "active" : ""}
                        onClick={() => toggleStatusFilter(status)}
                      >
                        {statusBadge(status).label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="spa-toolbar-right">
                  <button
                    type="button"
                    className="spa-outline-button"
                    onClick={() =>
                      setNotice({
                        kind: "success",
                        text: "新建 Skill 按钮已预留，下一步可接 scaffold API。",
                      })
                    }
                  >
                    <Plus size={16} />
                    新建 Skill
                  </button>
                </div>
              </div>

              <div className="spa-tag-cloud">
                <div className="spa-tag-label">
                  <Tags size={14} />
                  标签云
                </div>
                {suggestedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={selectedTag === tag ? "active" : ""}
                    onClick={() => setSelectedTag((current) => (current === tag ? null : tag))}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {selectedIds.length > 0 ? (
                <div className="spa-batch-bar">
                  <span>已选中 {selectedIds.length} 个 skills</span>
                  <div>
                    <button type="button" onClick={() => void batchSyncSelected()}>
                      批量同步
                    </button>
                    <button type="button" onClick={() => void batchTagSelected()}>
                      批量打 tag
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void saveMetaForSkills(selectedIds, { trashed: true })}
                    >
                      批量删除
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="spa-summary-cards">
                <article>
                  <span>当前视图</span>
                  <strong>{visibleEntities.length}</strong>
                  <small>筛选后可管理 skills</small>
                </article>
                <article>
                  <span>待同步</span>
                  <strong>{counters.pending}</strong>
                  <small>未备份 / 部分同步 / 仅云端</small>
                </article>
                <article>
                  <span>冲突</span>
                  <strong>{counters.changed}</strong>
                  <small>本地与云端或多本地版本不一致</small>
                </article>
                <article>
                  <span>标签</span>
                  <strong>{suggestedTags.length}</strong>
                  <small>已收录标签词表</small>
                </article>
              </div>

              {viewMode === "table" ? (
                <div className="spa-table-wrap">
                  <table className="spa-table">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            checked={
                              pagedEntities.length > 0 &&
                              pagedEntities.every((entity) => selectedIds.includes(entity.id))
                            }
                            onChange={() => {
                              const pageIds = pagedEntities.map((entity) => entity.id);

                              if (pageIds.every((id) => selectedIds.includes(id))) {
                                setSelectedIds((current) =>
                                  current.filter((id) => !pageIds.includes(id)),
                                );
                              } else {
                                setSelectedIds((current) => unique([...current, ...pageIds]));
                              }
                            }}
                          />
                        </th>
                        <th>
                          <button type="button" onClick={() => toggleSort("name")}>
                            技能路径
                          </button>
                        </th>
                        <th>简短描述</th>
                        <th>
                          <button type="button" onClick={() => toggleSort("claude")}>
                            Claude 状态
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => toggleSort("codex")}>
                            Codex 状态
                          </button>
                        </th>
                        <th>Agents 状态</th>
                        <th>
                          <button type="button" onClick={() => toggleSort("localVersion")}>
                            本地版本
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => toggleSort("cloudVersion")}>
                            云端版本
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => toggleSort("sync")}>
                            同步状态
                          </button>
                        </th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedEntities.map((entity) => (
                        <tr
                          key={entity.id}
                          className={activeSkillId === entity.id ? "active" : ""}
                          onClick={() => setActiveSkillId(entity.id)}
                        >
                          <td onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(entity.id)}
                              onChange={() => toggleSelection(entity.id)}
                            />
                          </td>
                          <td>
                            <div className="spa-primary-cell">
                              <strong>
                                <HighlightedText text={entity.displayPath} query={deferredSearch} />
                              </strong>
                              <small>{entity.tags.slice(0, 3).join(" · ") || "无标签"}</small>
                            </div>
                          </td>
                          <td>
                            <p className="spa-copy">
                              <HighlightedText text={entity.description} query={deferredSearch} />
                            </p>
                          </td>
                          <td>
                            <Badge tone={entity.cells.claude.tone}>
                              {entity.cells.claude.stateLabel}
                            </Badge>
                          </td>
                          <td>
                            <Badge tone={entity.cells.codex.tone}>
                              {entity.cells.codex.stateLabel}
                            </Badge>
                          </td>
                          <td>
                            <Badge tone={entity.cells.agents.tone}>
                              {entity.cells.agents.stateLabel}
                            </Badge>
                          </td>
                          <td>{entity.localVersion}</td>
                          <td>{entity.cloudVersion}</td>
                          <td>
                            <Badge tone={entity.syncTone}>{entity.syncLabel}</Badge>
                          </td>
                          <td onClick={(event) => event.stopPropagation()}>
                            <div className="spa-row-actions">
                              <button type="button" onClick={() => setActiveSkillId(entity.id)}>
                                编辑
                              </button>
                              <button type="button" onClick={() => void syncEntityToCatalog(entity)}>
                                同步
                              </button>
                              <button
                                type="button"
                                className="danger"
                                onClick={() => void saveMetaForSkills([entity.id], { trashed: true })}
                              >
                                删除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="spa-card-grid">
                  {pagedEntities.map((entity) => (
                    <article
                      key={entity.id}
                      className={`spa-skill-card ${activeSkillId === entity.id ? "active" : ""}`}
                      onClick={() => setActiveSkillId(entity.id)}
                    >
                      <div className="spa-card-check" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(entity.id)}
                          onChange={() => toggleSelection(entity.id)}
                        />
                      </div>
                      <strong>{entity.displayPath}</strong>
                      <p>{entity.description}</p>
                      <div className="spa-card-badges">
                        <Badge tone={entity.cells.claude.tone}>Claude {entity.cells.claude.stateLabel}</Badge>
                        <Badge tone={entity.cells.codex.tone}>Codex {entity.cells.codex.stateLabel}</Badge>
                        <Badge tone={entity.syncTone}>{entity.syncLabel}</Badge>
                        {entity.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} tone="neutral">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <footer className="spa-pagination">
                <div>
                  第 {page} / {pageCount} 页，共 {visibleEntities.length} 项
                </div>
                <div>
                  <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                    <ChevronLeft size={16} />
                    上一页
                  </button>
                  <button
                    type="button"
                    disabled={page >= pageCount}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    下一页
                    <ChevronRight size={16} />
                  </button>
                </div>
              </footer>
            </>
          ) : null}

          {mainTab === "similar" ? (
            similarGroups.length === 0 ? (
              <EmptyPanel
                title="没有需要警惕的重复项"
                copy="Claude Code 与 Codex 的同名技能现在被视作正常镜像关系，不会再混进重复检测。"
                icon={<Radar size={28} />}
              />
            ) : (
              <div className="spa-stack">
                {similarGroups.map((group) => (
                  <section key={group.label} className="spa-similar-group">
                    <div className="spa-section-head">
                      <div>
                        <span>SIMILAR</span>
                        <h2>{group.label}</h2>
                        <p>{group.description}</p>
                      </div>
                    </div>
                    <div className="spa-card-grid compact">
                      {group.items.map((entity) => (
                        <article key={entity.id} className="spa-skill-card" onClick={() => setActiveSkillId(entity.id)}>
                          <strong>{entity.displayPath}</strong>
                          <p>{entity.description}</p>
                          <div className="spa-card-badges">
                            {entity.mirroredSources.map((sourceId) => (
                              <Badge key={sourceId} tone={SOURCE_META[sourceId as FilterSource].accent}>
                                {SOURCE_META[sourceId as FilterSource].label}
                              </Badge>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )
          ) : null}

          {mainTab === "dashboard" ? (
            <div className="spa-stack">
              <div className="spa-summary-cards">
                {data.librarySummaries.map((library) => (
                  <article key={library.id}>
                    <span>{library.label}</span>
                    <strong>{library.skillCount}</strong>
                    <small>
                      已同步 {library.syncedCount} · 差异 {library.changedCount} · 缺云端 {library.missingCount}
                    </small>
                  </article>
                ))}
              </div>
              <section className="spa-section-card">
                <div className="spa-section-head">
                  <div>
                    <span>DASHBOARD</span>
                    <h2>标签与版本概览</h2>
                    <p>先看全局分布，再决定清理、同步还是分组管理。</p>
                  </div>
                </div>
                <div className="spa-dashboard-grid">
                  <div>
                    <h3>高频标签</h3>
                    <div className="spa-tag-cloud">
                      {suggestedTags.slice(0, 16).map((tag) => (
                        <button key={tag} type="button">
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3>同步状态</h3>
                    <ul className="spa-metric-list">
                      <li>
                        <span>已同步</span>
                        <strong>{counters.synced}</strong>
                      </li>
                      <li>
                        <span>待同步</span>
                        <strong>{counters.pending}</strong>
                      </li>
                      <li>
                        <span>存在差异</span>
                        <strong>{counters.changed}</strong>
                      </li>
                      <li>
                        <span>云端镜像</span>
                        <strong>{counters.catalog}</strong>
                      </li>
                    </ul>
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {mainTab === "sync" ? (
            <div className="spa-stack">
              <section className="spa-section-card">
                <div className="spa-section-head">
                  <div>
                    <span>SYNC</span>
                    <h2>同步高亮视图</h2>
                    <p>这里只看有差异、未备份或部分同步的 skills，点击任意一行可直接处理。</p>
                  </div>
                  <div className="spa-sync-mini-actions">
                    <button
                      type="button"
                      onClick={() => void runAction("/api/actions/sync", { action: "fetch" }, "git-fetch", "已完成远端检查。")}
                    >
                      <RefreshCw size={16} />
                      检查远端
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction("/api/actions/sync", { action: "pull" }, "git-pull", "已拉取远端更新。")}
                    >
                      <CloudDownload size={16} />
                      拉取
                    </button>
                    <button
                      type="button"
                      className="push"
                      onClick={() => void runAction("/api/actions/sync", { action: "push" }, "git-push", "已推送当前分支。")}
                    >
                      <CloudUpload size={16} />
                      推送
                    </button>
                  </div>
                </div>
                <div className="spa-sync-list">
                  {visibleEntities
                    .filter((entity) => entity.syncState !== "synced" && entity.syncState !== "idle")
                    .map((entity) => (
                      <button
                        type="button"
                        key={entity.id}
                        className="spa-sync-row"
                        onClick={() => setActiveSkillId(entity.id)}
                      >
                        <div>
                          <strong>{entity.displayPath}</strong>
                          <p>{entity.description}</p>
                        </div>
                        <div className="spa-card-badges">
                          <Badge tone={entity.cells.claude.tone}>{entity.cells.claude.stateLabel}</Badge>
                          <Badge tone={entity.cells.codex.tone}>{entity.cells.codex.stateLabel}</Badge>
                          <Badge tone={entity.syncTone}>{entity.syncLabel}</Badge>
                        </div>
                      </button>
                    ))}
                </div>
              </section>
            </div>
          ) : null}

          {mainTab === "trash" ? (
            visibleEntities.length === 0 ? (
              <EmptyPanel
                title="回收站是空的"
                copy="软删除后的 skill 会留在这里，后续可以恢复，不会立刻从磁盘上硬删除。"
                icon={<Trash2 size={28} />}
              />
            ) : (
              <div className="spa-card-grid">
                {visibleEntities.map((entity) => (
                  <article key={entity.id} className="spa-skill-card">
                    <strong>{entity.displayPath}</strong>
                    <p>{entity.description}</p>
                    <div className="spa-card-actions">
                      <button type="button" onClick={() => void saveMetaForSkills([entity.id], { trashed: false })}>
                        <ArchiveRestore size={16} />
                        恢复
                      </button>
                      <button type="button" onClick={() => setActiveSkillId(entity.id)}>
                        <PencilLine size={16} />
                        查看
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : null}
        </section>
      </div>

      {activeEntity ? (
        <div className="spa-drawer-backdrop" onClick={() => setActiveSkillId(null)}>
          <aside className="spa-drawer" onClick={(event) => event.stopPropagation()}>
            <header className="spa-drawer-head">
              <div>
                <span>SKILL DETAIL</span>
                <h2>{activeEntity.displayPath}</h2>
                <p>{activeEntity.baseDescription}</p>
              </div>
              <button type="button" className="spa-icon-button" onClick={() => setActiveSkillId(null)}>
                <X size={16} />
              </button>
            </header>

            <div className="spa-drawer-meta">
              <Badge tone={activeEntity.syncTone}>{activeEntity.syncLabel}</Badge>
              <span>本地 {activeEntity.localVersion}</span>
              <span>云端 {activeEntity.cloudVersion}</span>
              <span>{formatDate(activeEntity.updatedAt)}</span>
            </div>

            <section className="spa-drawer-section">
              <div className="spa-section-title">
                <h3>完整描述</h3>
                <small>可作为管理面板里的覆盖描述，不直接改原始 `SKILL.md`。</small>
              </div>
              <textarea
                value={draftNote}
                onChange={(event) => setDraftNote(event.target.value)}
                className="spa-textarea"
              />
            </section>

            <section className="spa-drawer-section">
              <div className="spa-section-title">
                <h3>标签管理</h3>
                <small>支持自动补全和自定义标签。</small>
              </div>
              <div className="spa-tag-editor">
                {draftTags.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    className="spa-tag-pill"
                    onClick={() => setDraftTags((current) => current.filter((item) => item !== tag))}
                  >
                    {tag}
                    <X size={12} />
                  </button>
                ))}
                <input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addDraftTag();
                    }
                  }}
                  list="skill-tag-suggestions"
                  placeholder="输入标签后回车"
                />
                <datalist id="skill-tag-suggestions">
                  {suggestedTags.map((tag) => (
                    <option key={tag} value={tag} />
                  ))}
                </datalist>
              </div>
            </section>

            <section className="spa-drawer-section">
              <div className="spa-section-title">
                <h3>来源配置</h3>
                <small>直接控制 Claude / Codex / Agents / 云端镜像 的安装与移除。</small>
              </div>
              <div className="spa-source-grid">
                {(["claude", "codex", "agents", "catalog"] as FilterSource[]).map((sourceId) => {
                  const cell = activeEntity.cells[sourceId];

                  return (
                    <label key={sourceId} className="spa-source-toggle">
                      <div>
                        <strong>{SOURCE_META[sourceId].label}</strong>
                        <span>{cell.stateLabel}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={cell.present}
                        onChange={(event) => {
                          void toggleLibrary(activeEntity, sourceId, event.target.checked);
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="spa-drawer-section">
              <div className="spa-section-title">
                <h3>版本对比</h3>
                <small>先看本地和云端，再决定同步哪边作为基线。</small>
              </div>
              <div className="spa-compare-grid">
                <article>
                  <span>Claude</span>
                  <strong>{activeEntity.cells.claude.versionLabel}</strong>
                  <Badge tone={activeEntity.cells.claude.tone}>{activeEntity.cells.claude.stateLabel}</Badge>
                </article>
                <article>
                  <span>Codex</span>
                  <strong>{activeEntity.cells.codex.versionLabel}</strong>
                  <Badge tone={activeEntity.cells.codex.tone}>{activeEntity.cells.codex.stateLabel}</Badge>
                </article>
                <article>
                  <span>Agents</span>
                  <strong>{activeEntity.cells.agents.versionLabel}</strong>
                  <Badge tone={activeEntity.cells.agents.tone}>{activeEntity.cells.agents.stateLabel}</Badge>
                </article>
                <article>
                  <span>云端</span>
                  <strong>{activeEntity.cells.catalog.versionLabel}</strong>
                  <Badge tone={activeEntity.cells.catalog.tone}>{activeEntity.cells.catalog.stateLabel}</Badge>
                </article>
              </div>
            </section>

            <section className="spa-drawer-section">
              <div className="spa-section-title">
                <h3>风险提示</h3>
                <small>先把来源、脚本和体积信息显性化。</small>
              </div>
              <div className="spa-card-badges">
                {activeEntity.riskFlags.length > 0 ? (
                  activeEntity.riskFlags.map((flag) => (
                    <Badge key={flag} tone={flag === "含脚本" ? "danger" : "warning"}>
                      <ShieldAlert size={12} />
                      {flag}
                    </Badge>
                  ))
                ) : (
                  <Badge tone="success">当前未识别高风险标记</Badge>
                )}
              </div>
            </section>

            {detailSourceOptions.length > 0 ? (
              <section className="spa-drawer-section">
                <div className="spa-section-title">
                  <h3>文件预览</h3>
                  <small>点击不同来源查看原始 SKILL 内容和 README。</small>
                </div>
                <div className="spa-source-tabs">
                  {detailSourceOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={detailSourceKey === option.key ? "active" : ""}
                      onClick={() => setDetailSourceKey(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="spa-preview-panel">
                  {busyKey === `detail:${detailCacheKey}` ? (
                    <EmptyPanel
                      title="正在加载详情"
                      copy="稍等一下，正在读取当前来源的 SKILL.md 与辅助文件。"
                      icon={<RefreshCw size={24} className="spin" />}
                    />
                  ) : selectedDetail ? (
                    <>
                      <div className="spa-preview-meta">
                        <span>{selectedDetail.skill.path}</span>
                        <span>{selectedDetail.totalFiles} files</span>
                        <span>{formatBytes(selectedDetail.skill.sizeBytes)}</span>
                      </div>
                      <div className="spa-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {selectedDetail.readmeMarkdown ?? selectedDetail.skillMarkdown}
                        </ReactMarkdown>
                      </div>
                    </>
                  ) : null}
                </div>
              </section>
            ) : null}

            <footer className="spa-drawer-footer">
              <button
                type="button"
                className="spa-outline-button"
                onClick={() =>
                  void saveMetaForSkills([activeEntity.id], {
                    note: draftNote,
                    tags: draftTags,
                    preferredSources: ["claude", "codex", "agents", "catalog"].filter(
                      (sourceId) => activeEntity.cells[sourceId as FilterSource].present,
                    ),
                  })
                }
              >
                保存修改
              </button>
              <button
                type="button"
                className="spa-outline-button"
                onClick={() => void syncEntityToCatalog(activeEntity)}
              >
                <CloudUpload size={16} />
                同步到云端
              </button>
              <button
                type="button"
                className="spa-danger-button"
                onClick={() => void saveMetaForSkills([activeEntity.id], { trashed: true })}
              >
                <Trash2 size={16} />
                软删除
              </button>
            </footer>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
