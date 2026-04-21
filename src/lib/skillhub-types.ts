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
  compatibility: string[];
  trust: TrustProfile;
  locationType: "library" | "catalog" | "discover";
};

export type TrustProfile = {
  sourceType: "discover" | "installed" | "mirror";
  riskLevel: "low" | "medium" | "high";
  hasScripts: boolean;
  hasPackageJson: boolean;
  hasAgents: boolean;
  hasHomepage: boolean;
};

export type SkillMetaRecord = {
  note?: string;
  tags: string[];
  generatedTags?: string[];
  trashed?: boolean;
  preferredSources?: string[];
  updatedAt: string;
};

export type SkillMetaState = {
  records: Record<string, SkillMetaRecord>;
  tagCatalog: string[];
  trashedCount: number;
};

export type LibrarySummary = {
  id: string;
  label: string;
  path: string;
  description?: string;
  skillCount: number;
  enabledCount: number;
  disabledCount: number;
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
  libraryState: "enabled" | "disabled";
  catalogStatus: "missing" | "synced" | "changed";
  catalogPath?: string;
  catalogImportedFrom?: string;
};

export type DiscoverSkill = SkillRecord & {
  locationType: "discover";
  discoverSourceId: string;
  discoverSourceLabel: string;
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
  meta: SkillMetaState;
  librarySummaries: LibrarySummary[];
  summary: {
    libraries: number;
    discoverSkills: number;
    workspaceSkills: number;
    catalogSkills: number;
    pendingImports: number;
    pendingInstalls: number;
  };
  discoverSkills: DiscoverSkill[];
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
