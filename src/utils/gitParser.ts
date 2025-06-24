import { GitCommit, GitFileChange } from '../types/git';

export function parseGitLogEntry(logEntry: string): GitCommit {
  const [commitInfo, statsInfo] = logEntry.split('\n\n');
  const [hash, author, dateStr, message] = commitInfo.split('|');

  const stats = parseGitStats(statsInfo);

  return {
    hash,
    author,
    date: new Date(dateStr),
    message,
    stats,
  };
}

export function parseGitStats(statsText: string): { additions: number; deletions: number; files: number } {
  const stats = { additions: 0, deletions: 0, files: 0 };
  
  if (!statsText) return stats;

  const summary = statsText.split('\n').pop() || '';
  const matches = summary.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
  
  if (matches) {
    stats.files = parseInt(matches[1] || '0', 10);
    stats.additions = parseInt(matches[2] || '0', 10);
    stats.deletions = parseInt(matches[3] || '0', 10);
  }

  return stats;
}

export function parseFileStatus(statusLine: string): GitFileChange | null {
  const [status, ...paths] = statusLine.trim().split(/\s+/);
  
  if (!status || !paths.length) return null;

  const change: GitFileChange = {
    path: paths[paths.length - 1],
    status: mapGitStatus(status),
    additions: 0,
    deletions: 0,
  };

  if (status === 'R' && paths.length > 1) {
    change.oldPath = paths[0];
  }

  return change;
}

function mapGitStatus(status: string): 'added' | 'modified' | 'deleted' | 'renamed' {
  const statusMap: { [key: string]: 'added' | 'modified' | 'deleted' | 'renamed' } = {
    A: 'added',
    M: 'modified',
    D: 'deleted',
    R: 'renamed',
  };

  return statusMap[status] || 'modified';
} 