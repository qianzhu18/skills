"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
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
  RemoteDiscoverSkill,
  SkillDetail,
  WorkspaceSkill,
} from "@/lib/skillhub-types";

type SkillStoreAppProps = {
  initialData: DashboardData;
};

type InstalledLibraryId = "claude" | "codex";
type LibraryTab = "all" | InstalledLibraryId;
type RiskFilter = "all" | "safe" | "scripted" | "high";

const LIBRARY_PAGE_SIZE = 10;

type LibraryItem = {
  id: string;
  name: string;
  description: string;
  installedIn: InstalledLibraryId[];
  tags: string[];
  trust: WorkspaceSkill["trust"];
  records: Partial<Record<InstalledLibraryId, WorkspaceSkill>>;
  primaryRecord: WorkspaceSkill;
  discoverSources: DiscoverSkill[];
};

type DrawerTarget = {
  kind: "library";
  skillId: string;
};

const LIBRARY_LABELS: Record<LibraryTab, string> = {
  all: "全部 Skills",
  claude: "Claude Code",
  codex: "Codex",
};

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;

  return items.slice(start, start + pageSize);
}

function getLibraryLabel(libraryId: LibraryTab) {
  return LIBRARY_LABELS[libraryId];
}

function joinLibraryLabels(libraryIds: InstalledLibraryId[]) {
  return libraryIds.map((libraryId) => getLibraryLabel(libraryId)).join(" / ");
}

function scoreQuery(query: string, fields: string[]) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return 0;
  }

  return fields.reduce((score, field, index) => {
    const value = field.toLowerCase();

    if (!value) {
      return score;
    }

    if (value === normalized || value === `/${normalized}`) {
      return score + 140 - index * 2;
    }

    if (value.startsWith(normalized)) {
      return score + 80 - index * 2;
    }

    if (value.includes(normalized)) {
      return score + 32 - index;
    }

    return score;
  }, 0);
}

function getMetaTags(data: DashboardData, skillId: string) {
  const record = data.meta.records[skillId];

  return unique([...(record?.generatedTags ?? []), ...(record?.tags ?? [])]);
}

function pickHighestRiskTrust(trusts: WorkspaceSkill["trust"][]) {
  return (
    trusts.find((trust) => trust.riskLevel === "high") ??
    trusts.find((trust) => trust.riskLevel === "medium") ??
    trusts[0]
  );
}

function buildLibraryItems(data: DashboardData): LibraryItem[] {
  const discoverById = new Map<string, DiscoverSkill[]>();
  const installedById = new Map<string, WorkspaceSkill[]>();

  data.discoverSkills.forEach((skill) => {
    discoverById.set(skill.id, [...(discoverById.get(skill.id) ?? []), skill]);
  });

  data.workspaceSkills
    .filter(
      (skill) =>
        skill.libraryState === "enabled" &&
        (skill.sourceId === "claude" || skill.sourceId === "codex"),
    )
    .forEach((skill) => {
      installedById.set(skill.id, [...(installedById.get(skill.id) ?? []), skill]);
    });

  return Array.from(installedById.entries())
    .map(([skillId, records]) => {
      const primary = records[0];

      return {
        id: skillId,
        name: primary.name,
        description: primary.description,
        installedIn: unique(records.map((record) => record.sourceId)) as InstalledLibraryId[],
        tags: getMetaTags(data, skillId),
        trust: pickHighestRiskTrust(records.map((record) => record.trust)),
        records: Object.fromEntries(
          records.map((record) => [record.sourceId, record]),
        ) as Partial<Record<InstalledLibraryId, WorkspaceSkill>>,
        primaryRecord: primary,
        discoverSources: discoverById.get(skillId) ?? [],
      } satisfies LibraryItem;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
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

function matchesTrustFilter(trust: DiscoverSkill["trust"], riskFilter: RiskFilter) {
  if (riskFilter === "safe" && trust.riskLevel !== "low") {
    return false;
  }

  if (riskFilter === "scripted" && !trust.hasScripts) {
    return false;
  }

  if (riskFilter === "high" && trust.riskLevel !== "high") {
    return false;
  }

  return true;
}

function sourceTrustLabel(sourceTrust: DiscoverSkill["trust"]["sourceTrust"]) {
  if (sourceTrust === "official") {
    return "官方源";
  }

  if (sourceTrust === "community") {
    return "社区源";
  }

  return "本地源";
}

function sourceTrustTone(sourceTrust: DiscoverSkill["trust"]["sourceTrust"]) {
  if (sourceTrust === "official") {
    return "good" as const;
  }

  if (sourceTrust === "community") {
    return "warn" as const;
  }

  return "plain" as const;
}

function formatInstalls(installs: number) {
  if (installs >= 1_000_000) {
    return `${(installs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }

  if (installs >= 1_000) {
    return `${(installs / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }

  return String(installs);
}

function remoteInstallButtonText(
  item: RemoteDiscoverSkill,
  target: InstalledLibraryId,
  installed: boolean,
) {
  const targetLabel = target === "claude" ? "Claude" : "Codex";

  if (!item.compatibility.includes(target)) {
    return `未收录 ${targetLabel}`;
  }

  return `${installed ? "已安装" : "安装"} ${targetLabel}`;
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

function buildPaginationItems(page: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);

  return Array.from(pages)
    .filter((entry) => entry >= 1 && entry <= totalPages)
    .sort((left, right) => left - right);
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = buildPaginationItems(page, totalPages);

  return (
    <div className="mvp-pagination">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </button>
      <div className="mvp-page-numbers">
        {pages.map((entry, index) => {
          const previous = pages[index - 1];
          const showGap = previous && entry - previous > 1;

          return (
            <span key={entry} className="mvp-page-group">
              {showGap ? <em>…</em> : null}
              <button
                type="button"
                className={entry === page ? "active" : ""}
                onClick={() => onChange(entry)}
              >
                {entry}
              </button>
            </span>
          );
        })}
      </div>
      <span>
        第 {page} / {totalPages} 页
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        下一页
      </button>
    </div>
  );
}

export function SkillStoreApp({ initialData }: SkillStoreAppProps) {
  const [data, setData] = useState(initialData);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("all");
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawerTarget, setDrawerTarget] = useState<DrawerTarget | null>(null);
  const [libraryPage, setLibraryPage] = useState(1);
  const [remoteDiscoverResults, setRemoteDiscoverResults] = useState<RemoteDiscoverSkill[]>(
    [],
  );
  const [remoteDiscoverLoading, setRemoteDiscoverLoading] = useState(false);
  const [remoteDiscoverError, setRemoteDiscoverError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [detailsCache, setDetailsCache] = useState<Record<string, SkillDetail>>({});
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const librarySectionRef = useRef<HTMLElement | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const allLibraryItems = useMemo(() => buildLibraryItems(data), [data]);
  const libraryItems = useMemo(
    () =>
      libraryTab === "all"
        ? allLibraryItems
        : allLibraryItems.filter((item) => item.installedIn.includes(libraryTab)),
    [allLibraryItems, libraryTab],
  );
  const librarySummaries = useMemo(
    () =>
      data.librarySummaries.filter(
        (summary): summary is typeof summary & { id: InstalledLibraryId } =>
          summary.id === "claude" || summary.id === "codex",
      ),
    [data.librarySummaries],
  );
  const activeSummary = useMemo(
    () =>
      libraryTab === "all"
        ? null
        : librarySummaries.find((summary) => summary.id === libraryTab) ?? null,
    [librarySummaries, libraryTab],
  );
  const totalManagedCount = allLibraryItems.length;
  const totalInstallationCount = useMemo(
    () => librarySummaries.reduce((total, summary) => total + summary.enabledCount, 0),
    [librarySummaries],
  );
  const availableTags = useMemo(
    () =>
      unique(
        Object.values(data.meta.records).flatMap((record) => record.generatedTags ?? []),
      ),
    [data.meta.records],
  );
  const installedSkillIdsByLibrary = useMemo(
    () => ({
      claude: new Set(
        data.workspaceSkills
          .filter((skill) => skill.sourceId === "claude" && skill.libraryState === "enabled")
          .map((skill) => skill.id),
      ),
      codex: new Set(
        data.workspaceSkills
          .filter((skill) => skill.sourceId === "codex" && skill.libraryState === "enabled")
          .map((skill) => skill.id),
      ),
    }),
    [data.workspaceSkills],
  );

  const filteredLibrary = useMemo(() => {
    return libraryItems
      .filter((item) => {
        if (!matchesTrustFilter(item.trust, riskFilter)) {
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
          ...item.installedIn.map((entry) => getLibraryLabel(entry)),
          ...item.installedIn
            .map((entry) => item.records[entry]?.relativePath)
            .filter((value): value is string => Boolean(value)),
          ...item.tags,
        ]
          .join(" ")
          .toLowerCase()
          .includes(deferredSearch);
      })
      .sort((left, right) => {
        if (!deferredSearch) {
          return left.name.localeCompare(right.name);
        }

        const leftScore = scoreQuery(deferredSearch, [
          left.name,
          `/${left.name}`,
          ...left.tags,
          left.description,
          ...left.installedIn.map((entry) => getLibraryLabel(entry)),
          ...left.installedIn
            .map((entry) => left.records[entry]?.relativePath)
            .filter((value): value is string => Boolean(value)),
        ]);
        const rightScore = scoreQuery(deferredSearch, [
          right.name,
          `/${right.name}`,
          ...right.tags,
          right.description,
          ...right.installedIn.map((entry) => getLibraryLabel(entry)),
          ...right.installedIn
            .map((entry) => right.records[entry]?.relativePath)
            .filter((value): value is string => Boolean(value)),
        ]);

        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }

        return left.name.localeCompare(right.name);
      });
  }, [deferredSearch, libraryItems, selectedTag, riskFilter]);

  const filteredRemoteResults = useMemo(() => {
    return remoteDiscoverResults.filter((item) => {
      if (libraryTab !== "all" && !item.compatibility.includes(libraryTab)) {
        return false;
      }

      if (!matchesTrustFilter(item.trust, riskFilter)) {
        return false;
      }

      if (selectedTag && !item.tags.includes(selectedTag)) {
        return false;
      }

      return true;
    });
  }, [libraryTab, remoteDiscoverResults, riskFilter, selectedTag]);

  const libraryScriptedCount = filteredLibrary.filter((item) => item.trust.hasScripts).length;
  const libraryRiskCount = filteredLibrary.filter(
    (item) => item.trust.riskLevel === "high",
  ).length;
  const libraryTotalPages = Math.max(
    1,
    Math.ceil(filteredLibrary.length / LIBRARY_PAGE_SIZE),
  );
  const pagedLibrary = paginateItems(
    filteredLibrary,
    Math.min(libraryPage, libraryTotalPages),
    LIBRARY_PAGE_SIZE,
  );
  const currentScopeIds = unique(filteredLibrary.map((item) => item.id));

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
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const nextLibraryTab = params.get("library");

    if (nextLibraryTab === "all" || nextLibraryTab === "claude" || nextLibraryTab === "codex") {
      setLibraryTab(nextLibraryTab);
    }
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [libraryTab]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set("library", libraryTab);
    params.delete("tab");

    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [libraryTab]);

  useEffect(() => {
    setLibraryPage(1);
  }, [deferredSearch, libraryTab, riskFilter, selectedTag]);

  useEffect(() => {
    if (deferredSearch.length < 2) {
      setRemoteDiscoverResults([]);
      setRemoteDiscoverLoading(false);
      setRemoteDiscoverError(null);
      return;
    }

    let cancelled = false;

    async function searchRemote() {
      setRemoteDiscoverLoading(true);
      setRemoteDiscoverError(null);

      try {
        const response = await fetch(
          `/api/discover/search?q=${encodeURIComponent(deferredSearch)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          message?: string;
          skills?: RemoteDiscoverSkill[];
        };

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message ?? "远端搜索失败。");
        }

        if (!cancelled) {
          setRemoteDiscoverResults(Array.isArray(payload.skills) ? payload.skills : []);
        }
      } catch (error) {
        if (!cancelled) {
          setRemoteDiscoverResults([]);
          setRemoteDiscoverError(error instanceof Error ? error.message : "远端搜索失败。");
        }
      } finally {
        if (!cancelled) {
          setRemoteDiscoverLoading(false);
        }
      }
    }

    void searchRemote();

    return () => {
      cancelled = true;
    };
  }, [deferredSearch]);

  const drawerSources = useMemo(() => {
    if (!drawerTarget) {
      return [];
    }

    const item = allLibraryItems.find((entry) => entry.id === drawerTarget.skillId);

    if (!item) {
      return [];
    }

    return [
      ...item.installedIn.map((libraryId) => ({
        key: `library:${libraryId}:${item.id}`,
        label: `${getLibraryLabel(libraryId)} 已安装版本`,
        sourceId: libraryId,
        skillId: item.id,
        locationType: "library" as const,
      })),
      ...item.discoverSources.map((source) => ({
        key: `discover:${source.discoverSourceId}:${source.id}`,
        label: source.discoverSourceLabel,
        sourceId: source.discoverSourceId,
        skillId: source.id,
        locationType: "discover" as const,
      })),
    ];
  }, [allLibraryItems, drawerTarget]);

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
  const activeDrawerLibraryItem = drawerTarget
    ? allLibraryItems.find((item) => item.id === drawerTarget.skillId) ?? null
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

  async function installRemoteToLibrary(item: RemoteDiscoverSkill, target: InstalledLibraryId) {
    await runAction(
      "/api/actions/install-remote",
      {
        source: item.source,
        skillId: item.skillId,
        libraryId: target,
      },
      `remote-install:${item.source}:${item.skillId}:${target}`,
      `已把 ${item.skillId} 从 skills.sh 安装到 ${getLibraryLabel(target)}。`,
    );
  }

  function getRemovalTargets(item: LibraryItem): InstalledLibraryId[] {
    if (libraryTab === "all") {
      return item.installedIn;
    }

    return item.installedIn.filter((entry) => entry === libraryTab);
  }

  async function removeSkillFromLibraries(
    skillId: string,
    targetLibraries: InstalledLibraryId[],
    successText: string,
  ) {
    if (targetLibraries.length === 0) {
      return;
    }

    setBusyKey(`uninstall:${skillId}:${targetLibraries.join(",")}`);
    setNotice(null);

    try {
      for (const libraryId of targetLibraries) {
        const response = await fetch("/api/actions/remove-library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skillId, libraryId }),
        });
        const payload = await parseResponse(response);

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message ?? "删除失败。");
        }
      }

      const nextDashboard = await fetchDashboardData();
      await applyDashboard(nextDashboard);
      setNotice({ kind: "success", text: successText });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "删除失败。",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function uninstallLibraryItem(item: LibraryItem, targetLibraries = getRemovalTargets(item)) {
    if (targetLibraries.length === 0) {
      return;
    }

    const label = joinLibraryLabels(targetLibraries);

    if (!window.confirm(`确认从 ${label} 删除 ${item.name} 吗？`)) {
      return;
    }

    await removeSkillFromLibraries(
      item.id,
      targetLibraries,
      `已从 ${label} 删除 ${item.name}。`,
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
      "智能标签已生成。",
    );
  }

  async function batchLibraryAction(action: "uninstall" | "ai-tags") {
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
        if (action === "uninstall") {
          const targetLibraries = getRemovalTargets(item);

          for (const libraryId of targetLibraries) {
            const response = await fetch("/api/actions/remove-library", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                skillId: item.id,
                libraryId,
              }),
            });
            const payload = await parseResponse(response);

            if (!response.ok || !payload.ok) {
              throw new Error(payload.message ?? "批量删除失败。");
            }
          }
        }
      }

      const nextDashboard = await fetchDashboardData();
      await applyDashboard(nextDashboard);
      setNotice({
        kind: "success",
        text: "批量删除完成。",
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

  function changeLibraryPage(nextPage: number) {
    setLibraryPage(nextPage);
    librarySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function isRemoteInstalled(skillId: string, target: InstalledLibraryId) {
    return installedSkillIdsByLibrary[target].has(skillId);
  }

  return (
    <main className="mvp-shell">
      <header className="mvp-topbar">
        <div className="mvp-brand">
          <div className="mvp-logo">千</div>
          <div>
            <strong>千逐 Skill 管理器</strong>
            <span>Search / Install / Manage / Trust</span>
          </div>
        </div>

        <div className="mvp-tools">
          <label className="mvp-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索本地 skills，或去 skills.sh 找新技能…"
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
            生成标签
          </button>
          <div className="mvp-avatar">
            <UserCircle2 size={22} />
          </div>
        </div>
      </header>

      <div className="mvp-body">
        <aside className="mvp-sidebar">
          <section className="mvp-sidebar-card">
            <h3>我的技能库</h3>
            <div className="mvp-library-switch">
              <button
                type="button"
                className={libraryTab === "all" ? "active" : ""}
                onClick={() => setLibraryTab("all")}
              >
                全部 Skills
                <strong>{totalManagedCount}</strong>
              </button>
              <p className="mvp-sidebar-meta">共 {totalInstallationCount} 个安装实例</p>
            </div>
            {librarySummaries.map((summary) => (
              <div key={summary.id} className="mvp-library-switch">
                <button
                  type="button"
                  className={libraryTab === summary.id ? "active" : ""}
                  onClick={() => setLibraryTab(summary.id)}
                >
                  {getLibraryLabel(summary.id)}
                  <strong>{summary.enabledCount}</strong>
                </button>
                <p className="mvp-sidebar-meta">已安装 {summary.enabledCount}</p>
              </div>
            ))}
            <p className="mvp-sidebar-note">
              这里就是你的 skills 管理页。主表格只管已安装 skills，外部搜索只是补充入口。
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
              风险会综合脚本文件、安装钩子、包管理脚本和远端审计，不再只是粗糙分级。
            </p>
          </section>

          <section className="mvp-sidebar-card">
            <div className="mvp-sidebar-title">
              <Tags size={14} />
              标签
            </div>
            <div className="mvp-tag-cloud">
              {availableTags.length === 0 ? (
                <p>首次会自动生成一轮标签，后面你再自己整理。</p>
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
              标签先自动打一轮，后面按你的管理习惯继续维护，不把来源和风险混进标签里。
            </p>
          </section>
        </aside>

        <section className="mvp-main">
          {notice ? (
            <div className={`mvp-notice mvp-notice-${notice.kind}`}>{notice.text}</div>
          ) : null}

          <section className="mvp-hero compact">
            <div>
              <span>MY SKILLS</span>
              <h1>一个面板管好自己的 skills，需要时再顺手搜索外部 skill</h1>
              <p>
                主表格始终只展示你本机已经安装的 skills，并且按技能实体聚合，不再把 Claude 和 Codex 拆成两套重复列表。
                搜索框会同时帮你筛本地管理表，并补充上方的外部 skill 搜索结果。
              </p>
            </div>
            <div className="mvp-hero-metrics">
              <article>
                <strong>{libraryTab === "all" ? totalManagedCount : activeSummary?.enabledCount ?? 0}</strong>
                <span>{libraryTab === "all" ? "已管理 skills" : "已安装"}</span>
              </article>
              <article>
                <strong>{filteredLibrary.length}</strong>
                <span>当前结果</span>
              </article>
              <article>
                <strong>{libraryScriptedCount}</strong>
                <span>含脚本</span>
              </article>
              <article>
                <strong>{libraryRiskCount}</strong>
                <span>高风险</span>
              </article>
            </div>
          </section>

          {deferredSearch.length >= 2 ? (
            <section className="mvp-section">
              <div className="mvp-section-head">
                <div>
                  <span>EXTERNAL SEARCH</span>
                  <h2>外部技能搜索</h2>
                  <p className="mvp-section-copy">
                    这里是 `skills.sh` 的补充搜索结果，只负责帮你找新 skill；下面的表格始终是你的本地已安装 skills。
                  </p>
                </div>
              </div>

              {remoteDiscoverLoading ? (
                <div className="mvp-loading">
                  <LoaderCircle size={22} className="spin" />
                  正在从 skills.sh 搜索…
                </div>
              ) : remoteDiscoverError ? (
                <EmptyState title="外部搜索暂时不可用" copy={remoteDiscoverError} />
              ) : filteredRemoteResults.length === 0 ? (
                <EmptyState
                  title="没有找到匹配的外部 skill"
                  copy="换个关键词继续搜，或者放宽左侧的风险和标签筛选。"
                />
              ) : (
                <div className="mvp-discover-grid">
                  {filteredRemoteResults.map((item) => (
                    <article key={item.id} className="mvp-discover-card">
                      <div className="mvp-card-head">
                        <div className="mvp-card-copy">
                          <strong>/{item.name}</strong>
                          <p className="mvp-line-clamp-2">{item.description}</p>
                        </div>
                        <a
                          className="mvp-card-link"
                          href={item.skillsUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          查看
                        </a>
                      </div>

                      <div className="mvp-card-badges">
                        <Badge tone="plain">skills.sh</Badge>
                        <Badge tone={sourceTrustTone(item.trust.sourceTrust)}>
                          {sourceTrustLabel(item.trust.sourceTrust)}
                        </Badge>
                        {item.compatibility.includes("claude") ? (
                          <Badge tone="claude">Claude Code</Badge>
                        ) : null}
                        {item.compatibility.includes("codex") ? (
                          <Badge tone="codex">Codex</Badge>
                        ) : null}
                        <Badge tone={riskTone(item.trust)}>{riskLabel(item.trust)}</Badge>
                        <Badge tone="plain">{formatInstalls(item.installs)} 安装</Badge>
                      </div>

                      <div className="mvp-card-tags">
                        {item.tags.length > 0 ? (
                          item.tags.map((tag) => <span key={tag}>{tag}</span>)
                        ) : (
                          <span className="muted">暂无标签</span>
                        )}
                      </div>

                      <div className="mvp-install-row">
                        <button
                          type="button"
                          className={`tone-${isRemoteInstalled(item.skillId, "claude") ? "good" : "plain"}`}
                          disabled={
                            !item.compatibility.includes("claude") ||
                            isRemoteInstalled(item.skillId, "claude")
                          }
                          onClick={() => void installRemoteToLibrary(item, "claude")}
                        >
                          {remoteInstallButtonText(
                            item,
                            "claude",
                            isRemoteInstalled(item.skillId, "claude"),
                          )}
                        </button>
                        <button
                          type="button"
                          className={`tone-${isRemoteInstalled(item.skillId, "codex") ? "good" : "plain"}`}
                          disabled={
                            !item.compatibility.includes("codex") ||
                            isRemoteInstalled(item.skillId, "codex")
                          }
                          onClick={() => void installRemoteToLibrary(item, "codex")}
                        >
                          {remoteInstallButtonText(
                            item,
                            "codex",
                            isRemoteInstalled(item.skillId, "codex"),
                          )}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <div className="mvp-library-tabs">
            <button
              type="button"
              className={libraryTab === "all" ? "active" : ""}
              onClick={() => setLibraryTab("all")}
            >
              全部
            </button>
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

          {selectedIds.length > 0 ? (
            <div className="mvp-batch-bar">
              <span>已选中 {selectedIds.length} 个 skills</span>
              <div className="mvp-inline-actions">
                <button type="button" onClick={() => void batchLibraryAction("uninstall")}>
                  批量删除
                </button>
                <button type="button" onClick={() => void batchLibraryAction("ai-tags")}>
                  生成标签
                </button>
              </div>
            </div>
          ) : null}

          <section ref={librarySectionRef} className="mvp-section">
            <div className="mvp-section-head">
              <div>
                <span>LIBRARY</span>
                <h2>{libraryTab === "all" ? "我的全部 Skills" : `${getLibraryLabel(libraryTab)} 已安装`}</h2>
                <p className="mvp-section-copy">
                  {filteredLibrary.length} 个结果，每页 {LIBRARY_PAGE_SIZE} 个。表格是你的主管理区，
                  搜索时上方只额外补充外部 skill，不会再和本地数量混在一起。
                </p>
              </div>
              <Pagination
                page={Math.min(libraryPage, libraryTotalPages)}
                totalPages={libraryTotalPages}
                onChange={changeLibraryPage}
              />
            </div>

            {filteredLibrary.length === 0 ? (
              <EmptyState
                title="当前筛选下没有匹配的已安装 skills"
                copy="换个关键词、标签或风险筛选试试；如果要找新 skill，直接用上面的搜索结果安装。"
              />
            ) : (
              <div className="mvp-table-wrap">
                <table className="mvp-table">
                  <thead>
                    <tr>
                      <th />
                      <th>Skill</th>
                      <th>用途</th>
                      <th>已安装到</th>
                      <th>标签</th>
                      <th>Trust</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLibrary.map((item) => (
                      <tr key={item.id}>
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
                            <span>已管理 {item.installedIn.length} 个安装位置</span>
                          </div>
                        </td>
                        <td>
                          <p className="mvp-table-description mvp-line-clamp-2">
                            {item.description}
                          </p>
                        </td>
                        <td>
                          <div className="mvp-inline-badges">
                            {item.installedIn.includes("claude") ? (
                              <Badge tone="claude">Claude Code</Badge>
                            ) : null}
                            {item.installedIn.includes("codex") ? (
                              <Badge tone="codex">Codex</Badge>
                            ) : null}
                          </div>
                        </td>
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
                          <div className="mvp-inline-actions">
                            <button
                              type="button"
                              onClick={() =>
                                setDrawerTarget({
                                  kind: "library",
                                  skillId: item.id,
                                })
                              }
                            >
                              查看
                            </button>
                            <button type="button" onClick={() => void generateTags([item.id])}>
                              标签
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => void uninstallLibraryItem(item)}
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
            )}

            <Pagination
              page={Math.min(libraryPage, libraryTotalPages)}
              totalPages={libraryTotalPages}
              onChange={changeLibraryPage}
            />
          </section>
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
                  <Badge tone={sourceTrustTone(activeDetail.skill.trust.sourceTrust)}>
                    {sourceTrustLabel(activeDetail.skill.trust.sourceTrust)}
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
                    <span>可安装到</span>
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

                <div className="mvp-inline-tags mvp-risk-reasons">
                  {activeDetail.skill.trust.riskReasons.map((reason) => (
                    <span key={reason}>{reason}</span>
                  ))}
                </div>

                {activeDetail.skill.trust.audit ? (
                  <div className="mvp-inline-badges mvp-audit-strip">
                    {activeDetail.skill.trust.audit.athRisk ? (
                      <Badge tone="plain">ATH {activeDetail.skill.trust.audit.athRisk}</Badge>
                    ) : null}
                    {activeDetail.skill.trust.audit.socketRisk ? (
                      <Badge tone="plain">
                        Socket {activeDetail.skill.trust.audit.socketRisk}
                        {typeof activeDetail.skill.trust.audit.socketAlerts === "number"
                          ? ` · ${activeDetail.skill.trust.audit.socketAlerts} alerts`
                          : ""}
                      </Badge>
                    ) : null}
                    {activeDetail.skill.trust.audit.snykRisk ? (
                      <Badge tone="plain">Snyk {activeDetail.skill.trust.audit.snykRisk}</Badge>
                    ) : null}
                    {activeDetail.skill.trust.audit.zeroleaksRisk ? (
                      <Badge tone="plain">
                        ZeroLeaks {activeDetail.skill.trust.audit.zeroleaksRisk}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}

                <div className="mvp-card-tags drawer">
                  {getMetaTags(data, activeDetail.skill.id).length > 0 ? (
                    getMetaTags(data, activeDetail.skill.id).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))
                  ) : (
                    <span className="muted">还没有标签</span>
                  )}
                </div>

                <div className="mvp-drawer-actions">
                  {activeDrawerLibraryItem
                    ? activeDrawerLibraryItem.installedIn.map((libraryId) => (
                        <button
                          key={libraryId}
                          type="button"
                          onClick={() =>
                            void uninstallLibraryItem(activeDrawerLibraryItem, [libraryId])
                          }
                        >
                          {activeDrawerLibraryItem.installedIn.length > 1
                            ? `删除 ${getLibraryLabel(libraryId)}`
                            : "删除"}
                        </button>
                      ))
                    : null}

                  <button
                    type="button"
                    onClick={() => void generateTags([activeDetail.skill.id])}
                  >
                    <Sparkles size={14} />
                    生成标签
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
