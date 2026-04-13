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
  LibraryConfig,
  LibrarySummary,
  SkillDetail,
  SkillHubConfig,
  SkillRecord,
  WorkspaceSkill,
} from "@/lib/skillhub-types";

const DEFAULT_CONFIG: SkillHubConfig = {
  catalog: {
    title: "Qianzhu Skill Manager",
    description:
      "Manage Claude and Codex skills with a cleaner library view, preview pane, and GitHub-backed catalog.",
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

function buildTags(skillId: string, sourceId: string, commands: string[]) {
  const values = [skillId, sourceId, ...commands]
    .flatMap((entry) => entry.split(/[\s/_-]+/))
    .map((entry) => entry.toLowerCase().trim())
    .filter((entry) => entry.length > 1);

  return Array.from(new Set(values)).slice(0, 12);
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
  locationType: "library" | "catalog",
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

  return {
    key: `${library.id}:${skillId}:${path.relative(library.path, skillPath)}`,
    id: skillId,
    name: skillId,
    description,
    shortDescription: createSnippet(description, 120),
    version: toText(frontmatter.version) ?? toText(packageJson?.version),
    homepage:
      toText(frontmatter.homepage) ??
      getNestedText(frontmatter, ["metadata", "homepage"]) ??
      getNestedText(frontmatter, ["metadata", "openclaw", "homepage"]) ??
      toText(packageJson?.homepage) ??
      getNestedText(packageJson ?? {}, ["repository", "url"]),
    commands,
    triggers,
    tags: buildTags(skillId, library.id, commands),
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
    locationType,
  };
}

async function scanLibrarySkills(library: LibraryConfig) {
  if (!(await pathExists(library.path))) {
    return [];
  }

  const directories = await findSkillDirectories(library.path);
  const skills = await Promise.all(
    directories.map((directory) =>
      scanSkillDirectory(directory, library, "library"),
    ),
  );

  return skills.sort((left, right) => left.name.localeCompare(right.name));
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

function buildWorkspaceSkills(
  workspaceSkills: SkillRecord[],
  catalogSkills: Array<SkillRecord & { manifest?: CatalogManifest }>,
): WorkspaceSkill[] {
  const catalogById = new Map(catalogSkills.map((skill) => [skill.id, skill]));
  const statusRank = {
    changed: 0,
    missing: 1,
    synced: 2,
  } as const;

  return workspaceSkills
    .map((skill) => {
      const catalogSkill = catalogById.get(skill.id);

      if (!catalogSkill) {
        return {
          ...skill,
          locationType: "library" as const,
          catalogStatus: "missing" as const,
        };
      }

      return {
        ...skill,
        locationType: "library" as const,
        catalogStatus:
          catalogSkill.manifest?.importedFrom?.hash === skill.hash
            ? ("synced" as const)
            : ("changed" as const),
        catalogPath: catalogSkill.path,
        catalogImportedFrom: catalogSkill.manifest?.importedFrom?.libraryLabel,
      };
    })
    .sort((left, right) => {
      const statusDifference =
        statusRank[left.catalogStatus] - statusRank[right.catalogStatus];

      if (statusDifference !== 0) {
        return statusDifference;
      }

      return left.name.localeCompare(right.name);
    });
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
    const items = workspaceSkills.filter((skill) => skill.sourceId === library.id);
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

  const [workspaceGroups, catalogGroup, git] = await Promise.all([
    Promise.all(config.libraries.map((library) => scanLibrarySkills(library))),
    scanCatalogSkills(config),
    getGitStatus(config.catalog.remoteRepoUrl),
  ]);

  const workspaceSkills = workspaceGroups.flat();
  const workspaceByLibrary = new Map<string, Map<string, SkillRecord>>();

  config.libraries.forEach((library, index) => {
    workspaceByLibrary.set(
      library.id,
      new Map(workspaceGroups[index].map((skill) => [skill.id, skill])),
    );
  });

  const nextWorkspaceSkills = buildWorkspaceSkills(workspaceSkills, catalogGroup);
  const nextCatalogSkills = buildCatalogSkills(
    catalogGroup,
    config.libraries,
    workspaceByLibrary,
  );
  const librarySummaries = buildLibrarySummaries(
    config.libraries,
    nextWorkspaceSkills,
    nextCatalogSkills,
  );

  return {
    generatedAt: new Date().toISOString(),
    config,
    git,
    librarySummaries,
    summary: {
      libraries: config.libraries.length,
      workspaceSkills: workspaceSkills.length,
      catalogSkills: catalogGroup.length,
      pendingImports: nextWorkspaceSkills.filter(
        (skill) => skill.catalogStatus !== "synced",
      ).length,
      pendingInstalls: nextCatalogSkills.reduce(
        (count, skill) =>
          count +
          skill.installations.filter(
            (installation) => installation.status !== "installed",
          ).length,
        0,
      ),
    },
    workspaceSkills: nextWorkspaceSkills,
    catalogSkills: nextCatalogSkills,
  };
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

async function findSkillRecord(
  skillId: string,
  sourceId: string,
  locationType: "library" | "catalog",
) {
  const config = await loadSkillHubConfig();

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
  locationType: "library" | "catalog",
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

  await removeDirectory(library.path, targetPath);

  return getDashboardData();
}
