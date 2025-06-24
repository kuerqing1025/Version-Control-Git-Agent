export interface GitCommit {
  hash: string;
  author: string;
  date: Date;
  message: string;
  stats: {
    additions: number;
    deletions: number;
    files: number;
  };
}

export interface GitFileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  oldPath?: string; // For renamed files
}

export interface GitAnalysis {
  impactScore: number;
  complexityScore: number;
  securityIssues: Array<{
    severity: 'low' | 'medium' | 'high';
    description: string;
    location: string;
  }>;
  performanceImpact: {
    score: number;
    details: string[];
  };
}

export interface CommitMessageStyle {
  type: 'conventional' | 'gitmoji' | 'detailed' | 'simple';
  includeScope: boolean;
  includeFooter: boolean;
  maxLength: number;
}

export interface GitBlame {
  hash: string;
  author: string;
  date: Date;
  line: number;
  content: string;
}

export interface GitDiff {
  path: string;
  additions: number;
  deletions: number;
  hunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    content: string;
  }>;
}

export interface GitStats {
  totalCommits: number;
  contributors: Array<{
    name: string;
    commits: number;
    additions: number;
    deletions: number;
  }>;
  mostChangedFiles: Array<{
    path: string;
    changes: number;
  }>;
}

export interface RollbackOptions {
  type: 'commit' | 'file';
  target: string; // commit hash or file path
  commitHash?: string; // specific commit for file rollback
  createBackup?: boolean;
}

export interface RollbackResult {
  success: boolean;
  backupCreated?: boolean;
  backupPath?: string;
  error?: string;
} 