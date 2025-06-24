import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  GitCommit,
  GitFileChange,
  GitAnalysis,
  CommitMessageStyle,
  GitBlame,
  GitDiff,
  GitStats,
  RollbackOptions,
  RollbackResult
} from '../types/git';
import { parseGitLogEntry, parseFileStatus } from '../utils/gitParser';
import { CodeAnalysisService } from './CodeAnalysisService';
import { CommitMessageService } from './CommitMessageService';

const execAsync = promisify(exec);

export class GitService {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  async getCommitHistory(limit: number = 10): Promise<GitCommit[]> {
    const { stdout } = await execAsync(
      `git -C ${this.repoPath} log -n ${limit} --pretty=format:"%H|%an|%ad|%s" --stat`,
    );
    
    return this.parseGitLog(stdout);
  }

  async getFileChanges(commitHash: string): Promise<GitFileChange[]> {
    const { stdout } = await execAsync(
      `git -C ${this.repoPath} show --name-status --pretty=format:"" ${commitHash}`,
    );

    return this.parseFileChanges(stdout);
  }

  async analyzeCode(files: string[]): Promise<GitAnalysis> {
    const analysisService = new CodeAnalysisService();
    return analysisService.analyzeFiles(files);
  }

  async generateCommitMessage(
    changes: GitFileChange[],
    style: CommitMessageStyle,
  ): Promise<string> {
    const messageService = new CommitMessageService();
    return messageService.generateMessage(changes, style);
  }

  async getGitStatus(): Promise<GitFileChange[]> {
    const { stdout } = await execAsync(`git -C ${this.repoPath} status --porcelain`);
    return stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const status = line.substring(0, 2).trim();
        const path = line.substring(3);
        return {
          path,
          status: this.mapStatusCode(status),
          additions: 0,
          deletions: 0,
        };
      });
  }

  async getFileDiff(filePath: string, commitHash?: string): Promise<GitDiff> {
    const command = commitHash
      ? `git -C ${this.repoPath} show ${commitHash} -- ${filePath}`
      : `git -C ${this.repoPath} diff HEAD -- ${filePath}`;

    const { stdout } = await execAsync(command);
    return this.parseDiff(stdout, filePath);
  }

  async getFileBlame(filePath: string): Promise<GitBlame[]> {
    const { stdout } = await execAsync(
      `git -C ${this.repoPath} blame --line-porcelain ${filePath}`
    );
    return this.parseBlame(stdout);
  }

  async getRepositoryStats(): Promise<GitStats> {
    const [commitsOutput, contributorsOutput] = await Promise.all([
      execAsync(`git -C ${this.repoPath} rev-list --count HEAD`),
      execAsync(
        `git -C ${this.repoPath} shortlog -sn --all --no-merges`
      ),
    ]);

    const totalCommits = parseInt(commitsOutput.stdout, 10);
    const contributors = await this.getContributorStats();
    const mostChangedFiles = await this.getMostChangedFiles();

    return {
      totalCommits,
      contributors,
      mostChangedFiles,
    };
  }

  async rollback(options: RollbackOptions): Promise<RollbackResult> {
    try {
      if (options.createBackup) {
        await this.createBackup(options);
      }

      if (options.type === 'commit') {
        await execAsync(`git -C ${this.repoPath} revert --no-commit ${options.target}`);
        await execAsync(`git -C ${this.repoPath} commit -m "Revert commit ${options.target}"`);
      } else {
        const command = options.commitHash
          ? `git -C ${this.repoPath} checkout ${options.commitHash} -- ${options.target}`
          : `git -C ${this.repoPath} checkout HEAD -- ${options.target}`;
        await execAsync(command);
      }

      return {
        success: true,
        backupCreated: options.createBackup,
        backupPath: options.createBackup ? this.getBackupPath(options) : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private async createBackup(options: RollbackOptions): Promise<void> {
    const backupDir = join(this.repoPath, '.git', 'backups');
    await fs.mkdir(backupDir, { recursive: true });

    if (options.type === 'file') {
      const backupPath = this.getBackupPath(options);
      await fs.copyFile(join(this.repoPath, options.target), backupPath);
    } else {
      // For commit rollback, create a backup branch
      const backupBranch = `backup/${options.target}`;
      await execAsync(`git -C ${this.repoPath} branch ${backupBranch} ${options.target}`);
    }
  }

  private getBackupPath(options: RollbackOptions): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = join(this.repoPath, '.git', 'backups');
    return join(backupDir, `${options.target.replace(/\//g, '_')}_${timestamp}`);
  }

  private async getContributorStats(): Promise<GitStats['contributors']> {
    const { stdout } = await execAsync(
      `git -C ${this.repoPath} log --format='%aN' --no-merges | sort | uniq -c | sort -rn`
    );

    const contributors: GitStats['contributors'] = [];
    const lines = stdout.split('\n').filter(Boolean);

    for (const line of lines) {
      const [commits, name] = line.trim().split(/\s+(.+)/);
      const stats = await this.getAuthorStats(name);
      contributors.push({
        name,
        commits: parseInt(commits, 10),
        ...stats,
      });
    }

    return contributors;
  }

  private async getAuthorStats(author: string): Promise<{ additions: number; deletions: number }> {
    const { stdout } = await execAsync(
      `git -C ${this.repoPath} log --author="${author}" --no-merges --pretty=tformat: --numstat`
    );

    const stats = { additions: 0, deletions: 0 };
    stdout.split('\n').filter(Boolean).forEach(line => {
      const [add, del] = line.split('\t').map(n => parseInt(n, 10) || 0);
      stats.additions += add;
      stats.deletions += del;
    });

    return stats;
  }

  private async getMostChangedFiles(): Promise<GitStats['mostChangedFiles']> {
    const { stdout } = await execAsync(
      `git -C ${this.repoPath} log --all --numstat --format="%n" | sort -nr | grep -v "^$" | head -n 10`
    );

    return stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [additions, deletions, path] = line.split('\t');
        return {
          path,
          changes: parseInt(additions, 10) + parseInt(deletions, 10),
        };
      });
  }

  private mapStatusCode(code: string): GitFileChange['status'] {
    const statusMap: { [key: string]: GitFileChange['status'] } = {
      'A': 'added',
      'M': 'modified',
      'D': 'deleted',
      'R': 'renamed',
      '??': 'added',
    };
    return statusMap[code] || 'modified';
  }

  private parseGitLog(log: string): GitCommit[] {
    const entries = log.split('\ncommit ').filter(Boolean);
    return entries.map(entry => parseGitLogEntry(entry));
  }

  private parseFileChanges(changes: string): GitFileChange[] {
    return changes
      .split('\n')
      .map(line => parseFileStatus(line))
      .filter((change): change is GitFileChange => change !== null);
  }

  private parseDiff(diff: string, filePath: string): GitDiff {
    const hunks: Array<{
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
      content: string;
    }> = [];
    let additions = 0;
    let deletions = 0;

    const lines = diff.split('\n');
    let currentHunk: typeof hunks[0] | null = null;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }
        const match = line.match(/@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/);
        if (match) {
          currentHunk = {
            oldStart: parseInt(match[1], 10),
            oldLines: parseInt(match[2], 10) || 0,
            newStart: parseInt(match[3], 10),
            newLines: parseInt(match[4], 10) || 0,
            content: line + '\n',
          };
        }
      } else if (currentHunk) {
        currentHunk.content += line + '\n';
        if (line.startsWith('+')) additions++;
        if (line.startsWith('-')) deletions++;
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return {
      path: filePath,
      additions,
      deletions,
      hunks,
    };
  }

  private parseBlame(blame: string): GitBlame[] {
    const lines = blame.split('\n');
    const results: GitBlame[] = [];
    let current: Partial<GitBlame> = {};

    for (const line of lines) {
      if (line.startsWith('author ')) {
        current.author = line.substring(7);
      } else if (line.startsWith('author-time ')) {
        current.date = new Date(parseInt(line.substring(12), 10) * 1000);
      } else if (line.startsWith('hash ')) {
        current.hash = line.substring(5);
      } else if (line.startsWith('\t')) {
        current.content = line.substring(1);
        if (current.hash && current.author && current.date) {
          results.push({
            ...current as GitBlame,
            line: results.length + 1,
          });
        }
        current = {};
      }
    }

    return results;
  }

  async execGit(command: string) {
    return execAsync(`git -C ${this.repoPath} ${command}`);
  }
} 