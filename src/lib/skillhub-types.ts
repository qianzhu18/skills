export type LibraryConfig = {
  id: string;
  label: string;
  path: string;
  description?: string;
};

export type SkillHubConfig = {
  catalog: {
    title: string;
    description: string;
    remoteRepoUrl: string;
    defaultBranch: string;
    directory: string;
    indexFile: string;
  };
  libraries: LibraryConfig[];
};

export type SkillRecord = {
  key: string;
  id: string;
  name: string;
  description: string;
  shortDescription: string;
  version?: string;
  homepage?: string;
  commands: string[];
  triggers: string[];
  tags: string[];
  path: string;
  relativePath: string;
  skillFile?: string;
  readmeFile?: string;
  packageJsonFile?: string;
  updatedAt: string;
  fileCount: number;
  sizeBytes: number;
  hash: string;
  sourceId: string;
  sourceLabel: string;
  locationType: "library" | "catalog";
};

export type LibrarySummary = {
  id: string;
  label: string;
  path: string;
  description?: string;
  skillCount: number;
  syncedCount: number;
  changedCount: number;
  missingCount: number;
  updateAvailableCount: number;
};

export type CatalogManifest = {
  id: string;
  name: string;
  importedFrom?: {
    libraryId: string;
    libraryLabel: string;
    path: string;
    hash: string;
    importedAt: string;
  };
  notes?: string;
};

export type WorkspaceSkill = SkillRecord & {
  locationType: "library";
  catalogStatus: "missing" | "synced" | "changed";
  catalogPath?: string;
  catalogImportedFrom?: string;
};

export type InstallationState = "missing" | "installed" | "update-available";

export type InstallationStatus = {
  libraryId: string;
  libraryLabel: string;
  targetPath: string;
  status: InstallationState;
};

export type CatalogSkill = SkillRecord & {
  locationType: "catalog";
  manifest?: CatalogManifest;
  installations: InstallationStatus[];
};

export type GitStatus = {
  available: boolean;
  branch: string | null;
  remote: string | null;
  clean: boolean;
  dirtyFiles: string[];
  hasCommits: boolean;
};

export type DashboardData = {
  generatedAt: string;
  config: SkillHubConfig;
  git: GitStatus;
  librarySummaries: LibrarySummary[];
  summary: {
    libraries: number;
    workspaceSkills: number;
    catalogSkills: number;
    pendingImports: number;
    pendingInstalls: number;
  };
  workspaceSkills: WorkspaceSkill[];
  catalogSkills: CatalogSkill[];
};

export type SkillDetail = {
  skill: SkillRecord;
  manifest?: CatalogManifest;
  frontmatter: Record<string, unknown>;
  skillMarkdown: string;
  readmeMarkdown?: string;
  packageJson?: Record<string, unknown>;
  files: Array<{
    path: string;
    sizeBytes: number;
  }>;
  totalFiles: number;
};

export type ActionResponse = {
  ok: boolean;
  message: string;
  dashboard: DashboardData;
};
