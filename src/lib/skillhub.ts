import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import matter from "gray-matter";

import { getGitStatus } from "@/lib/git";
import type {
  CatalogManifest,
  CatalogSkill,
  DashboardData,
  DiscoverSkill,
  LibraryConfig,
  LibrarySummary,
  SkillMetaRecord,
  SkillMetaState,
  SkillDetail,
  SkillHubConfig,
  SkillRecord,
  TrustProfile,
  WorkspaceSkill,
} from "@/lib/skillhub-types";

const DEFAULT_CONFIG: SkillHubConfig = {
  catalog: {
    title: "Qianzhu Skill Manager",
    description:
      "Discover skills from curated sources and manage local Claude/Codex libraries with install, trust, and batch controls.",
    remoteRepoUrl: "https://github.com/qianzhu18/skills",
    defaultBranch: "main",
    directory: "catalog/skills",
    indexFile: "catalog/index.json",
  },
  libraries: [
    {
      id: "claude",
      label: "Claude",
      path: path.join(os.homedir(), ".claude/skills"),
      description: "Claude Code 本地技能目录",
    },
    {
      id: "codex",
      label: "Codex",
      path: path.join(os.homedir(), ".codex/skills"),
      description: "Codex 本地技能目录",
    },
    {
      id: "agents",
      label: "Agents",
      path: path.join(os.homedir(), ".agents/skills"),
      description: "共享 agent skills 目录",
    },
  ],
};

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  "dist",
  "build",
  "node_modules",
]);

const DETAIL_FILE_LIMIT = 120;
const META_FILE = "skillhub.meta.json";
const DISCOVER_SOURCES = [
  {
    id: "discover-claude",
    label: "Claude Code Source",
    path: "backups/claude-code",
    compatibility: ["claude"],
  },
  {
    id: "discover-codex",
    label: "Codex Source",
    path: "backups/codex",
    compatibility: ["codex"],
  },
] as const;

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function resolveFromRepo(relativePath: string) {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), relativePath);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function mergeConfig(input?: Partial<SkillHubConfig>): SkillHubConfig {
  if (!input) {
    return DEFAULT_CONFIG;
  }

  return {
    catalog: {
      ...DEFAULT_CONFIG.catalog,
      ...input.catalog,
    },
    libraries:
      input.libraries && input.libraries.length > 0
        ? input.libraries.map((library) => ({
            ...library,
          }))
        : DEFAULT_CONFIG.libraries,
  };
}

function slugifyLibraryId(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function normalizeLibrary(library: LibraryConfig, index: number): LibraryConfig {
  const label = library.label.trim() || `Library ${index + 1}`;
  const pathValue = library.path.trim();
  const id =
    slugifyLibraryId(library.id || label || path.basename(pathValue || "library")) ||
    `library-${index + 1}`;

  return {
    id,
    label,
    path: pathValue,
    description: library.description?.trim() || undefined,
  };
}

function normalizeConfig(input: SkillHubConfig): SkillHubConfig {
  const libraries = input.libraries
    .map((library, index) => normalizeLibrary(library, index))
    .filter((library) => library.path.length > 0);
  const seenIds = new Set<string>();

  const uniqueLibraries = libraries.map((library, index) => {
    let nextId = library.id;

    while (seenIds.has(nextId)) {
      nextId = `${library.id}-${index + 1}`;
    }

    seenIds.add(nextId);

    return {
      ...library,
      id: nextId,
    };
  });

  return {
    catalog: {
      title: input.catalog.title.trim() || DEFAULT_CONFIG.catalog.title,
      description:
        input.catalog.description.trim() || DEFAULT_CONFIG.catalog.description,
      remoteRepoUrl:
        input.catalog.remoteRepoUrl.trim() || DEFAULT_CONFIG.catalog.remoteRepoUrl,
      defaultBranch:
        input.catalog.defaultBranch.trim() || DEFAULT_CONFIG.catalog.defaultBranch,
      directory: input.catalog.directory.trim() || DEFAULT_CONFIG.catalog.directory,
      indexFile: input.catalog.indexFile.trim() || DEFAULT_CONFIG.catalog.indexFile,
    },
    libraries: uniqueLibraries,
  };
}

export async function loadSkillHubConfig() {
  const configPath = resolveFromRepo("skillhub.config.json");

  if (!(await pathExists(configPath))) {
    return DEFAULT_CONFIG;
  }

  const raw = await fs.readFile(configPath, "utf8");
  return normalizeConfig(mergeConfig(JSON.parse(raw) as Partial<SkillHubConfig>));
}

export async function saveSkillHubConfig(input: SkillHubConfig) {
  const config = normalizeConfig(input);
  const configPath = resolveFromRepo("skillhub.config.json");

  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  await ensureCatalogDirectories(config);

  return getDashboardData();
}

async function ensureCatalogDirectories(config: SkillHubConfig) {
  await fs.mkdir(resolveFromRepo(config.catalog.directory), { recursive: true });
  await fs.mkdir(path.dirname(resolveFromRepo(config.catalog.indexFile)), {
    recursive: true,
  });
}

async function loadSkillMetaState(): Promise<SkillMetaState> {
  const metaPath = resolveFromRepo(META_FILE);

  if (!(await pathExists(metaPath))) {
    return {
      records: {},
      tagCatalog: [],
      trashedCount: 0,
    };
  }

  const raw = await fs.readFile(metaPath, "utf8");
  const parsed = JSON.parse(raw) as {
    records?: Record<string, Partial<SkillMetaRecord>>;
  };
  const entries = Object.entries(parsed.records ?? {}).map(([skillId, value]) => {
    const tags = Array.isArray(value.tags)
      ? value.tags
          .map((tag) => String(tag).trim())
          .filter(Boolean)
      : [];
    const generatedTags = Array.isArray(value.generatedTags)
      ? value.generatedTags
          .map((tag) => String(tag).trim())
          .filter(Boolean)
      : [];

    return [
      skillId,
      {
        note: typeof value.note === "string" ? value.note.trim() || undefined : undefined,
        tags,
        generatedTags,
        trashed: Boolean(value.trashed),
        preferredSources: Array.isArray(value.preferredSources)
          ? value.preferredSources.map((entry) => String(entry).trim()).filter(Boolean)
          : [],
        updatedAt:
          typeof value.updatedAt === "string" && value.updatedAt
            ? value.updatedAt
            : new Date().toISOString(),
      } satisfies SkillMetaRecord,
    ] as const;
  });

  const records = Object.fromEntries(entries);
  const tagCatalog = Array.from(
    new Set(
      Object.values(records)
        .flatMap((record) => [...record.tags, ...(record.generatedTags ?? [])])
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const trashedCount = Object.values(records).filter((record) => record.trashed).length;

  return {
    records,
    tagCatalog,
    trashedCount,
  };
}

async function writeSkillMetaState(records: Record<string, SkillMetaRecord>) {
  const metaPath = resolveFromRepo(META_FILE);
  const normalizedEntries = Object.entries(records)
    .map(([skillId, record]) => {
      const nextRecord: SkillMetaRecord = {
        note: record.note?.trim() || undefined,
        tags: Array.from(new Set(record.tags.map((tag) => tag.trim()).filter(Boolean))).sort(
          (left, right) => left.localeCompare(right),
        ),
        generatedTags: Array.from(
          new Set((record.generatedTags ?? []).map((tag) => tag.trim()).filter(Boolean)),
        ).sort((left, right) => left.localeCompare(right)),
        trashed: Boolean(record.trashed),
        preferredSources: Array.from(
          new Set((record.preferredSources ?? []).map((value) => value.trim()).filter(Boolean)),
        ),
        updatedAt: record.updatedAt || new Date().toISOString(),
      };

      return [skillId, nextRecord] as const;
    })
    .filter(
      ([, record]) =>
        Boolean(record.note) ||
        record.tags.length > 0 ||
        (record.generatedTags?.length ?? 0) > 0 ||
        Boolean(record.trashed) ||
        (record.preferredSources?.length ?? 0) > 0,
    );
  const normalized = Object.fromEntries(normalizedEntries);

  await fs.writeFile(
    metaPath,
    `${JSON.stringify({ updatedAt: new Date().toISOString(), records: normalized }, null, 2)}\n`,
  );
}

function toText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const nextValue = value.trim();
    return nextValue.length > 0 ? nextValue : undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const nextValue = value.map(toText).filter(Boolean).join(", ");
    return nextValue || undefined;
  }

  if (value && typeof value === "object") {
    const nextValue = Object.values(value as Record<string, unknown>)
      .map(toText)
      .filter(Boolean)
      .join(" ");

    return nextValue || undefined;
  }

  return undefined;
}

function getNestedText(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  let current: unknown = record;

  for (const key of keys) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return toText(current);
}

function stripMarkdown(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_>~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createSnippet(text: string, maxLength = 180) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function createOptionalSnippet(text?: string, maxLength = 180) {
  if (!text) {
    return undefined;
  }

  return createSnippet(text, maxLength);
}

function extractTriggers(...texts: string[]) {
  const triggerSet = new Set<string>();

  for (const text of texts) {
    const match = text.match(/Triggers?:\s*([^\n]+)/i);

    if (!match) {
      continue;
    }

    for (const part of match[1].split(",")) {
      const cleanValue = part
        .replace(/^["'\s]+|["'\s]+$/g, "")
        .trim();

      if (cleanValue) {
        triggerSet.add(cleanValue);
      }
    }
  }

  return Array.from(triggerSet).slice(0, 16);
}

function extractCommands(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }

      if (entry && typeof entry === "object" && "name" in entry) {
        return toText((entry as Record<string, unknown>).name);
      }

      return undefined;
    })
    .filter((entry): entry is string => Boolean(entry));
}

function extractExplicitTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

async function buildTrustProfile(options: {
  skillPath: string;
  sourceType: TrustProfile["sourceType"];
  commands: string[];
  packageJson?: Record<string, unknown>;
  homepage?: string;
}) {
  const hasPackageJson = Boolean(options.packageJson);
  const hasScripts =
    options.commands.length > 0 ||
    Boolean(
      options.packageJson &&
        typeof options.packageJson === "object" &&
        "scripts" in options.packageJson,
    ) ||
    (await pathExists(path.join(options.skillPath, "scripts")));
  const hasAgents = await pathExists(path.join(options.skillPath, "agents"));
  const hasHomepage = Boolean(options.homepage);
  const riskLevel: TrustProfile["riskLevel"] = hasScripts
    ? "high"
    : hasPackageJson || hasHomepage
      ? "medium"
      : "low";

  return {
    sourceType: options.sourceType,
    riskLevel,
    hasScripts,
    hasPackageJson,
    hasAgents,
    hasHomepage,
  } satisfies TrustProfile;
}

async function collectFilesRecursive(targetPath: string, bucket: string[] = []) {
  const entries = await fs.readdir(targetPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".DS_Store") {
      continue;
    }

    const fullPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      await collectFilesRecursive(fullPath, bucket);
      continue;
    }

    bucket.push(fullPath);
  }

  return bucket;
}

async function collectRelativeFiles(targetPath: string) {
  const files = await collectFilesRecursive(targetPath);

  return Promise.all(
    files
      .sort((left, right) => left.localeCompare(right))
      .slice(0, DETAIL_FILE_LIMIT)
      .map(async (filePath) => {
        const stat = await fs.stat(filePath);

        return {
          path: path.relative(targetPath, filePath),
          sizeBytes: stat.size,
        };
      }),
  );
}

async function collectDirectoryStats(targetPath: string) {
  const files = (await collectFilesRecursive(targetPath)).sort((left, right) =>
    left.localeCompare(right),
  );
  const hash = crypto.createHash("sha256");
  let fileCount = 0;
  let sizeBytes = 0;
  let latestMtime = 0;

  for (const file of files) {
    const stat = await fs.stat(file);
    const buffer = await fs.readFile(file);

    hash.update(path.relative(targetPath, file));
    hash.update(buffer);

    fileCount += 1;
    sizeBytes += stat.size;
    latestMtime = Math.max(latestMtime, stat.mtimeMs);
  }

  return {
    fileCount,
    sizeBytes,
    hash: hash.digest("hex"),
    updatedAt: new Date(latestMtime || Date.now()).toISOString(),
  };
}

async function findSkillDirectories(rootPath: string, depth = 0): Promise<string[]> {
  if (!(await pathExists(rootPath))) {
    return [];
  }

  const skillFilePath = path.join(rootPath, "SKILL.md");

  if (await pathExists(skillFilePath)) {
    return [rootPath];
  }

  if (depth >= 6) {
    return [];
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !IGNORED_DIRECTORIES.has(entry.name))
    .map((entry) => path.join(rootPath, entry.name));

  const nestedDirectories = await Promise.all(
    directories.map((directory) => findSkillDirectories(directory, depth + 1)),
  );

  return nestedDirectories.flat();
}

async function readJsonIfExists(filePath?: string) {
  if (!filePath || !(await pathExists(filePath))) {
    return undefined;
  }

  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function readTextIfExists(filePath?: string) {
  if (!filePath || !(await pathExists(filePath))) {
    return undefined;
  }

  return fs.readFile(filePath, "utf8");
}

async function scanSkillDirectory(
  skillPath: string,
  library: Pick<LibraryConfig, "id" | "label" | "path">,
  locationType: "library" | "catalog" | "discover",
  compatibilityOverride?: string[],
): Promise<SkillRecord> {
  const skillFile = path.join(skillPath, "SKILL.md");
  const readmeFile = (await pathExists(path.join(skillPath, "README.md")))
    ? path.join(skillPath, "README.md")
    : undefined;
  const packageJsonFile = (await pathExists(path.join(skillPath, "package.json")))
    ? path.join(skillPath, "package.json")
    : undefined;

  const [skillSource, readmeSource, packageJson] = await Promise.all([
    readTextIfExists(skillFile),
    readTextIfExists(readmeFile),
    readJsonIfExists(packageJsonFile),
  ]);

  const parsedSkill = matter(skillSource ?? "");
  const frontmatter =
    parsedSkill.data && typeof parsedSkill.data === "object"
      ? (parsedSkill.data as Record<string, unknown>)
      : {};
  const bodyText = stripMarkdown(parsedSkill.content);
  const readmeText = stripMarkdown(readmeSource ?? "");
  const description =
    toText(frontmatter.description) ??
    toText(packageJson?.description) ??
    createOptionalSnippet(readmeText, 280) ??
    createOptionalSnippet(bodyText, 280) ??
    "No description yet.";
  const skillId =
    toText(frontmatter.name) ??
    toText(packageJson?.name) ??
    path.basename(skillPath);
  const commands = extractCommands(frontmatter.commands);
  const triggers = extractTriggers(description, bodyText, readmeText);
  const stats = await collectDirectoryStats(skillPath);
  const compatibility = compatibilityOverride
    ? compatibilityOverride
    : library.id === "claude"
      ? ["claude"]
      : library.id === "codex"
        ? ["codex"]
        : library.id === "agents"
          ? ["claude", "codex"]
          : [];
  const homepage =
    toText(frontmatter.homepage) ??
    getNestedText(frontmatter, ["metadata", "homepage"]) ??
    getNestedText(frontmatter, ["metadata", "openclaw", "homepage"]) ??
    toText(packageJson?.homepage) ??
    getNestedText(packageJson ?? {}, ["repository", "url"]);
  const trust = await buildTrustProfile({
    skillPath,
    sourceType:
      locationType === "discover"
        ? "discover"
        : locationType === "catalog"
          ? "mirror"
          : "installed",
    commands,
    packageJson,
    homepage,
  });

  return {
    key: `${library.id}:${skillId}:${path.relative(library.path, skillPath)}`,
    id: skillId,
    name: skillId,
    description,
    shortDescription: createSnippet(description, 120),
    version: toText(frontmatter.version) ?? toText(packageJson?.version),
    homepage,
    commands,
    triggers,
    tags: extractExplicitTags(frontmatter.tags),
    path: skillPath,
    relativePath: path.relative(process.cwd(), skillPath),
    skillFile,
    readmeFile,
    packageJsonFile,
    updatedAt: stats.updatedAt,
    fileCount: stats.fileCount,
    sizeBytes: stats.sizeBytes,
    hash: stats.hash,
    sourceId: library.id,
    sourceLabel: library.label,
    compatibility,
    trust,
    locationType,
  };
}

function getDisabledLibraryPath(library: LibraryConfig) {
  return path.join(path.dirname(library.path), ".skillhub-disabled", library.id);
}

async function scanLibrarySkillsFromRoot(
  library: LibraryConfig,
  rootPath: string,
  libraryState: WorkspaceSkill["libraryState"],
) {
  if (!(await pathExists(rootPath))) {
    return [];
  }

  const directories = await findSkillDirectories(rootPath);
  const skills = await Promise.all(
    directories.map(async (directory) => {
      const record = await scanSkillDirectory(
        directory,
        {
          ...library,
          path: rootPath,
        },
        "library",
      );

      return {
        ...record,
        locationType: "library" as const,
        libraryState,
        catalogStatus: "missing" as const,
      } satisfies WorkspaceSkill;
    }),
  );

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

async function scanLibrarySkills(library: LibraryConfig) {
  const [enabledSkills, disabledSkills] = await Promise.all([
    scanLibrarySkillsFromRoot(library, library.path, "enabled"),
    scanLibrarySkillsFromRoot(library, getDisabledLibraryPath(library), "disabled"),
  ]);

  return [...enabledSkills, ...disabledSkills].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

async function scanDiscoverSkills(): Promise<DiscoverSkill[]> {
  const skills = await Promise.all(
    DISCOVER_SOURCES.map(async (source) => {
      const rootPath = resolveFromRepo(source.path);

      if (!(await pathExists(rootPath))) {
        return [] as DiscoverSkill[];
      }

      const directories = await findSkillDirectories(rootPath);

      return Promise.all(
        directories.map(async (directory) => {
          const record = await scanSkillDirectory(
            directory,
            {
              id: source.id,
              label: source.label,
              path: rootPath,
            },
            "discover",
            [...source.compatibility],
          );

          return {
            ...record,
            locationType: "discover" as const,
            discoverSourceId: source.id,
            discoverSourceLabel: source.label,
          } satisfies DiscoverSkill;
        }),
      );
    }),
  );

  return skills.flat().sort((left, right) => left.name.localeCompare(right.name));
}

async function readCatalogManifest(
  skillPath: string,
): Promise<CatalogManifest | undefined> {
  const manifestPath = path.join(skillPath, ".skillhub.json");

  if (!(await pathExists(manifestPath))) {
    return undefined;
  }

  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw) as CatalogManifest;
}

async function scanCatalogSkills(config: SkillHubConfig) {
  const catalogPath = resolveFromRepo(config.catalog.directory);

  if (!(await pathExists(catalogPath))) {
    return [];
  }

  const directories = await findSkillDirectories(catalogPath);
  const skills = await Promise.all(
    directories.map(async (directory) => {
      const record = await scanSkillDirectory(
        directory,
        {
          id: "catalog",
          label: config.catalog.title,
          path: catalogPath,
        },
        "catalog",
      );
      const manifest = await readCatalogManifest(directory);

      return {
        ...record,
        manifest,
      };
    }),
  );

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

function buildCatalogSkills(
  catalogSkills: Array<SkillRecord & { manifest?: CatalogManifest }>,
  libraries: LibraryConfig[],
  workspaceByLibrary: Map<string, Map<string, SkillRecord>>,
): CatalogSkill[] {
  const statusRank = {
    "update-available": 0,
    missing: 1,
    installed: 2,
  } as const;

  return catalogSkills
    .map((skill) => {
      const installations = libraries.map((library) => {
        const installedSkill = workspaceByLibrary.get(library.id)?.get(skill.id);
        const targetPath = path.join(library.path, skill.id);

        if (!installedSkill) {
          return {
            libraryId: library.id,
            libraryLabel: library.label,
            targetPath,
            status: "missing" as const,
          };
        }

        return {
          libraryId: library.id,
          libraryLabel: library.label,
          targetPath,
          status:
            installedSkill.hash === skill.hash
              ? ("installed" as const)
              : ("update-available" as const),
        };
      });

      return {
        ...skill,
        locationType: "catalog" as const,
        installations,
      };
    })
    .sort((left, right) => {
      const leftRank = Math.min(
        ...left.installations.map((installation) => statusRank[installation.status]),
      );
      const rightRank = Math.min(
        ...right.installations.map(
          (installation) => statusRank[installation.status],
        ),
      );

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return left.name.localeCompare(right.name);
    });
}

function buildLibrarySummaries(
  libraries: LibraryConfig[],
  workspaceSkills: WorkspaceSkill[],
  catalogSkills: CatalogSkill[],
): LibrarySummary[] {
  return libraries.map((library) => {
    const items = workspaceSkills.filter(
      (skill) => skill.sourceId === library.id && skill.libraryState === "enabled",
    );
    const disabledItems = workspaceSkills.filter(
      (skill) => skill.sourceId === library.id && skill.libraryState === "disabled",
    );
    const updateAvailableCount = catalogSkills.filter((skill) =>
      skill.installations.some(
        (installation) =>
          installation.libraryId === library.id &&
          installation.status === "update-available",
      ),
    ).length;

    return {
      id: library.id,
      label: library.label,
      path: library.path,
      description: library.description,
      skillCount: items.length,
      enabledCount: items.length,
      disabledCount: disabledItems.length,
      syncedCount: items.filter((skill) => skill.catalogStatus === "synced").length,
      changedCount: items.filter((skill) => skill.catalogStatus === "changed").length,
      missingCount: items.filter((skill) => skill.catalogStatus === "missing").length,
      updateAvailableCount,
    };
  });
}

async function writeCatalogIndex(
  config: SkillHubConfig,
  catalogSkills: Array<SkillRecord & { manifest?: CatalogManifest }>,
) {
  const indexPath = resolveFromRepo(config.catalog.indexFile);
  const payload = {
    generatedAt: new Date().toISOString(),
    title: config.catalog.title,
    description: config.catalog.description,
    remoteRepoUrl: config.catalog.remoteRepoUrl,
    skills: catalogSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      shortDescription: skill.shortDescription,
      version: skill.version,
      homepage: skill.homepage,
      commands: skill.commands,
      triggers: skill.triggers,
      tags: skill.tags,
      hash: skill.hash,
      repoPath: path.posix.join(config.catalog.directory, skill.id),
      importedAt: skill.manifest?.importedFrom?.importedAt ?? null,
      importedFrom: skill.manifest?.importedFrom
        ? {
            libraryId: skill.manifest.importedFrom.libraryId,
            libraryLabel: skill.manifest.importedFrom.libraryLabel,
          }
        : null,
    })),
  };

  await fs.writeFile(indexPath, `${JSON.stringify(payload, null, 2)}\n`);
}

export async function getDashboardData(): Promise<DashboardData> {
  const config = await loadSkillHubConfig();
  await ensureCatalogDirectories(config);

  const [workspaceGroups, catalogGroup, discoverSkills, git, meta] = await Promise.all([
    Promise.all(config.libraries.map((library) => scanLibrarySkills(library))),
    scanCatalogSkills(config),
    scanDiscoverSkills(),
    getGitStatus(config.catalog.remoteRepoUrl),
    loadSkillMetaState(),
  ]);

  const workspaceSkills = workspaceGroups.flat();
  const workspaceByLibrary = new Map<string, Map<string, SkillRecord>>();

  config.libraries.forEach((library, index) => {
    workspaceByLibrary.set(
      library.id,
      new Map(
        workspaceGroups[index]
          .filter((skill) => skill.libraryState === "enabled")
          .map((skill) => [skill.id, skill]),
      ),
    );
  });

  const nextCatalogSkills = buildCatalogSkills(
    catalogGroup,
    config.libraries,
    workspaceByLibrary,
  );
  const librarySummaries = buildLibrarySummaries(
    config.libraries,
    workspaceSkills,
    nextCatalogSkills,
  );

  return {
    generatedAt: new Date().toISOString(),
    config,
    git,
    meta,
    librarySummaries,
    summary: {
      libraries: config.libraries.length,
      discoverSkills: discoverSkills.length,
      workspaceSkills: workspaceSkills.length,
      catalogSkills: catalogGroup.length,
      pendingImports: 0,
      pendingInstalls: 0,
    },
    discoverSkills,
    workspaceSkills,
    catalogSkills: nextCatalogSkills,
  };
}

export async function updateSkillMetadata(
  skillIds: string[],
  changes: Partial<Omit<SkillMetaRecord, "updatedAt">>,
  options?: {
    mergeTags?: boolean;
  },
) {
  const meta = await loadSkillMetaState();
  const nextRecords = { ...meta.records };
  const updatedAt = new Date().toISOString();

  skillIds.forEach((skillId) => {
    const current = nextRecords[skillId] ?? {
      tags: [],
      generatedTags: [],
      preferredSources: [],
      updatedAt,
    };
    const nextTags =
      changes.tags === undefined
        ? current.tags
        : options?.mergeTags
          ? Array.from(new Set([...current.tags, ...changes.tags]))
          : changes.tags;
    const nextPreferredSources =
      changes.preferredSources === undefined
        ? current.preferredSources ?? []
        : changes.preferredSources;

    nextRecords[skillId] = {
      note:
        changes.note === undefined
          ? current.note
          : changes.note.trim()
            ? changes.note.trim()
            : undefined,
      tags: nextTags,
      generatedTags:
        changes.generatedTags === undefined
          ? current.generatedTags
          : changes.generatedTags,
      trashed: changes.trashed === undefined ? current.trashed : changes.trashed,
      preferredSources: nextPreferredSources,
      updatedAt,
    };
  });

  await writeSkillMetaState(nextRecords);

  return getDashboardData();
}

function isPathInside(rootPath: string, targetPath: string) {
  const relativePath = path.relative(rootPath, targetPath);

  return (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !path.isAbsolute(relativePath)
  );
}

async function copyDirectory(
  sourcePath: string,
  destinationPath: string,
  excludedNames = new Set<string>(),
) {
  await fs.rm(destinationPath, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.cp(sourcePath, destinationPath, {
    recursive: true,
    force: true,
    filter: (source) => !excludedNames.has(path.basename(source)),
  });
}

async function removeDirectory(rootPath: string, targetPath: string) {
  if (!isPathInside(rootPath, targetPath)) {
    throw new Error("Unsafe delete target.");
  }

  await fs.rm(targetPath, { recursive: true, force: true });
}

function findLibrary(config: SkillHubConfig, libraryId: string) {
  const library = config.libraries.find((entry) => entry.id === libraryId);

  if (!library) {
    throw new Error(`Unknown library: ${libraryId}`);
  }

  return library;
}

function findDiscoverSource(sourceId: string) {
  const source = DISCOVER_SOURCES.find((entry) => entry.id === sourceId);

  if (!source) {
    throw new Error(`Unknown discover source: ${sourceId}`);
  }

  return source;
}

async function findSkillRecord(
  skillId: string,
  sourceId: string,
  locationType: "library" | "catalog" | "discover",
) {
  const config = await loadSkillHubConfig();

  if (locationType === "discover") {
    const discoverSkills = await scanDiscoverSkills();
    const record = discoverSkills.find(
      (skill) => skill.id === skillId && skill.discoverSourceId === sourceId,
    );

    if (!record) {
      throw new Error(`Discover skill ${skillId} was not found.`);
    }

    return {
      config,
      record,
      manifest: undefined,
    };
  }

  if (locationType === "catalog") {
    const catalogSkills = await scanCatalogSkills(config);
    const record = catalogSkills.find((skill) => skill.id === skillId);

    if (!record) {
      throw new Error(`Catalog skill ${skillId} was not found.`);
    }

    return {
      config,
      record,
      manifest: record.manifest,
    };
  }

  const library = findLibrary(config, sourceId);
  const workspaceSkills = await scanLibrarySkills(library);
  const record = workspaceSkills.find((skill) => skill.id === skillId);

  if (!record) {
    throw new Error(`Skill ${skillId} was not found in ${library.label}.`);
  }

  return {
    config,
    record,
    manifest: undefined,
  };
}

export async function getSkillDetail(
  skillId: string,
  sourceId: string,
  locationType: "library" | "catalog" | "discover",
): Promise<SkillDetail> {
  const { record, manifest } = await findSkillRecord(skillId, sourceId, locationType);
  const [skillMarkdown, readmeMarkdown, packageJson, files] = await Promise.all([
    readTextIfExists(record.skillFile),
    readTextIfExists(record.readmeFile),
    readJsonIfExists(record.packageJsonFile),
    collectRelativeFiles(record.path),
  ]);
  const parsedSkill = matter(skillMarkdown ?? "");

  return {
    skill: record,
    manifest,
    frontmatter:
      parsedSkill.data && typeof parsedSkill.data === "object"
        ? (parsedSkill.data as Record<string, unknown>)
        : {},
    skillMarkdown: skillMarkdown ?? "",
    readmeMarkdown,
    packageJson,
    files,
    totalFiles: record.fileCount,
  };
}

export async function rebuildCatalogIndex() {
  const config = await loadSkillHubConfig();
  await ensureCatalogDirectories(config);
  const catalogSkills = await scanCatalogSkills(config);
  await writeCatalogIndex(config, catalogSkills);
  return getDashboardData();
}

export async function importSkillToCatalog(skillId: string, libraryId: string) {
  const config = await loadSkillHubConfig();
  const library = findLibrary(config, libraryId);
  const workspaceSkills = await scanLibrarySkills(library);
  const sourceSkill = workspaceSkills.find((skill) => skill.id === skillId);

  if (!sourceSkill) {
    throw new Error(`Skill ${skillId} was not found in ${library.label}.`);
  }

  const targetPath = path.join(resolveFromRepo(config.catalog.directory), skillId);
  const manifest: CatalogManifest = {
    id: sourceSkill.id,
    name: sourceSkill.name,
    importedFrom: {
      libraryId: library.id,
      libraryLabel: library.label,
      path: sourceSkill.path,
      hash: sourceSkill.hash,
      importedAt: new Date().toISOString(),
    },
  };

  await copyDirectory(sourceSkill.path, targetPath, new Set([".skillhub.json"]));
  await fs.writeFile(
    path.join(targetPath, ".skillhub.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const catalogSkills = await scanCatalogSkills(config);
  await writeCatalogIndex(config, catalogSkills);

  return getDashboardData();
}

export async function installCatalogSkill(skillId: string, libraryId: string) {
  const config = await loadSkillHubConfig();
  const library = findLibrary(config, libraryId);
  const catalogSkills = await scanCatalogSkills(config);
  const catalogSkill = catalogSkills.find((skill) => skill.id === skillId);

  if (!catalogSkill) {
    throw new Error(`Catalog skill ${skillId} was not found.`);
  }

  const sourcePath = path.join(resolveFromRepo(config.catalog.directory), skillId);
  const targetPath = path.join(library.path, skillId);

  await fs.mkdir(library.path, { recursive: true });
  await copyDirectory(sourcePath, targetPath, new Set([".skillhub.json"]));

  return getDashboardData();
}

export async function installDiscoverSkill(
  skillId: string,
  discoverSourceId: string,
  libraryId: string,
) {
  const config = await loadSkillHubConfig();
  const library = findLibrary(config, libraryId);
  const discoverSource = findDiscoverSource(discoverSourceId);
  const discoverSkills = await scanDiscoverSkills();
  const sourceSkill = discoverSkills.find(
    (skill) => skill.id === skillId && skill.discoverSourceId === discoverSource.id,
  );

  if (!sourceSkill) {
    throw new Error(`Discover skill ${skillId} was not found in ${discoverSource.label}.`);
  }

  if (!sourceSkill.compatibility.includes(libraryId)) {
    throw new Error(`${skillId} does not currently support ${libraryId}.`);
  }

  const targetPath = path.join(library.path, skillId);
  const disabledPath = path.join(getDisabledLibraryPath(library), skillId);

  await fs.mkdir(library.path, { recursive: true });
  await fs.rm(disabledPath, { recursive: true, force: true });
  await copyDirectory(sourceSkill.path, targetPath, new Set([".skillhub.json"]));

  return getDashboardData();
}

export async function syncSkillBetweenLibraries(
  skillId: string,
  sourceLibraryId: string,
  targetLibraryId: string,
) {
  const config = await loadSkillHubConfig();
  const sourceLibrary = findLibrary(config, sourceLibraryId);
  const targetLibrary = findLibrary(config, targetLibraryId);

  if (sourceLibrary.id === targetLibrary.id) {
    throw new Error("Source and target libraries must be different.");
  }

  const workspaceSkills = await scanLibrarySkills(sourceLibrary);
  const sourceSkill = workspaceSkills.find((skill) => skill.id === skillId);

  if (!sourceSkill) {
    throw new Error(`Skill ${skillId} was not found in ${sourceLibrary.label}.`);
  }

  const targetPath = path.join(targetLibrary.path, skillId);
  await fs.mkdir(targetLibrary.path, { recursive: true });
  await copyDirectory(sourceSkill.path, targetPath, new Set([".skillhub.json"]));

  return getDashboardData();
}

export async function setLibrarySkillEnabled(
  skillId: string,
  libraryId: string,
  enabled: boolean,
) {
  const config = await loadSkillHubConfig();
  const library = findLibrary(config, libraryId);
  const activePath = path.join(library.path, skillId);
  const disabledRoot = getDisabledLibraryPath(library);
  const disabledPath = path.join(disabledRoot, skillId);

  if (enabled) {
    if (!(await pathExists(disabledPath))) {
      throw new Error(`Disabled skill ${skillId} was not found in ${library.label}.`);
    }

    await fs.mkdir(library.path, { recursive: true });
    await fs.rm(activePath, { recursive: true, force: true });
    await fs.rename(disabledPath, activePath);
  } else {
    if (!(await pathExists(activePath))) {
      throw new Error(`Enabled skill ${skillId} was not found in ${library.label}.`);
    }

    await fs.mkdir(disabledRoot, { recursive: true });
    await fs.rm(disabledPath, { recursive: true, force: true });
    await fs.rename(activePath, disabledPath);
  }

  return getDashboardData();
}

function inferSmartTags(record: SkillRecord) {
  return inferSmartTagsFromText(
    [
      record.id,
      record.name,
      record.description,
      ...record.commands,
      ...record.triggers,
      record.relativePath,
    ].join(" "),
  );
}

function inferSmartTagsFromText(input: string) {
  const text = input.toLowerCase();
  const rules = [
    {
      tag: "写作",
      keywords: [
        "write",
        "writing",
        "article",
        "markdown",
        "wechat",
        "copy",
        "draft",
        "公众号",
        "写稿",
        "文案",
      ],
    },
    {
      tag: "研究",
      keywords: [
        "research",
        "analysis",
        "analy",
        "report",
        "insight",
        "trend",
        "score",
        "调研",
        "研究",
        "洞察",
      ],
    },
    {
      tag: "网页",
      keywords: [
        "browser",
        "web",
        "search",
        "crawl",
        "url",
        "page",
        "scrape",
        "网页",
        "浏览器",
        "联网",
      ],
    },
    {
      tag: "配图",
      keywords: [
        "image",
        "illustrat",
        "cover",
        "comic",
        "thumbnail",
        "slide",
        "ppt",
        "配图",
        "封面",
        "插图",
      ],
    },
    {
      tag: "产品",
      keywords: [
        "prd",
        "persona",
        "journey",
        "opportunity",
        "value proposition",
        "jtbd",
        "用户",
        "产品",
        "需求",
      ],
    },
    {
      tag: "开发",
      keywords: [
        "code",
        "plugin",
        "debug",
        "review",
        "developer",
        "api",
        "skill",
        "agent",
        "开发",
        "工程",
      ],
    },
    {
      tag: "自动化",
      keywords: [
        "automation",
        "workflow",
        "install",
        "setup",
        "publish",
        "release",
        "pipeline",
        "自动",
        "工作流",
        "批量",
      ],
    },
    {
      tag: "社媒",
      keywords: [
        "tweet",
        "twitter",
        "xiaohongshu",
        "wechat",
        "douyin",
        "weibo",
        "bilibili",
        "小红书",
        "微博",
        "播客",
      ],
    },
  ];

  const scores = rules
    .map((rule) => ({
      tag: rule.tag,
      score: rule.keywords.reduce(
        (count, keyword) => count + (text.includes(keyword) ? 1 : 0),
        0,
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const tags = scores.map((entry) => entry.tag);

  if (tags.length === 0 && /prompt|instruction|system/.test(text)) {
    tags.push("提示词");
  }

  if (tags.length === 0 && /template|framework|workflow|process/.test(text)) {
    tags.push("工作流");
  }

  if (tags.length === 0) {
    tags.push("工具");
  }

  return unique(tags).slice(0, 4);
}

async function buildSmartTagText(record: SkillRecord) {
  const [skillMarkdown, readmeMarkdown] = await Promise.all([
    readTextIfExists(record.skillFile),
    readTextIfExists(record.readmeFile),
  ]);

  return [
    record.id,
    record.name,
    record.description,
    record.shortDescription,
    ...record.commands,
    ...record.triggers,
    stripMarkdown(skillMarkdown ?? ""),
    stripMarkdown(readmeMarkdown ?? ""),
  ].join(" ");
}

export async function generateSmartTags(skillIds: string[]) {
  const [discoverSkills, workspaceGroups] = await Promise.all([
    scanDiscoverSkills(),
    Promise.all((await loadSkillHubConfig()).libraries.map((library) => scanLibrarySkills(library))),
  ]);
  const workspaceSkills = workspaceGroups.flat();
  const recordsById = new Map<string, SkillRecord[]>();

  [...discoverSkills, ...workspaceSkills].forEach((record) => {
    recordsById.set(record.id, [...(recordsById.get(record.id) ?? []), record]);
  });

  const meta = await loadSkillMetaState();
  const nextRecords = { ...meta.records };
  const updatedAt = new Date().toISOString();

  skillIds.forEach((skillId) => {
    recordsById.set(skillId, recordsById.get(skillId) ?? []);
  });

  await Promise.all(
    skillIds.map(async (skillId) => {
      const records = recordsById.get(skillId) ?? [];
      const texts = await Promise.all(
        records.map(async (record) => buildSmartTagText(record)),
      );
      const generatedTags = unique(
        texts.flatMap((text, index) => {
          const record = records[index];

          if (!record) {
            return [];
          }

          return inferSmartTagsFromText(text.length > 0 ? text : inferSmartTags(record).join(" "));
        }),
      );
      const current = nextRecords[skillId] ?? {
        tags: [],
        generatedTags: [],
        preferredSources: [],
        updatedAt,
      };

      nextRecords[skillId] = {
        ...current,
        generatedTags,
        updatedAt,
      };
    }),
  );

  await writeSkillMetaState(nextRecords);

  return getDashboardData();
}

export async function removeCatalogSkill(skillId: string) {
  const config = await loadSkillHubConfig();
  const targetPath = path.join(resolveFromRepo(config.catalog.directory), skillId);

  await removeDirectory(resolveFromRepo(config.catalog.directory), targetPath);

  const catalogSkills = await scanCatalogSkills(config);
  await writeCatalogIndex(config, catalogSkills);

  return getDashboardData();
}

export async function removeLibrarySkill(skillId: string, libraryId: string) {
  const config = await loadSkillHubConfig();
  const library = findLibrary(config, libraryId);
  const targetPath = path.join(library.path, skillId);
  const disabledPath = path.join(getDisabledLibraryPath(library), skillId);

  if (await pathExists(targetPath)) {
    await removeDirectory(library.path, targetPath);
  }

  if (await pathExists(disabledPath)) {
    await removeDirectory(getDisabledLibraryPath(library), disabledPath);
  }

  return getDashboardData();
}
