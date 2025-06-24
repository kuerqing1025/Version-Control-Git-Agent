import { GitService } from '../services/GitService';
import { CommitMessageStyle, RollbackOptions } from '../types/git';

export class GitContextProviders {
  private gitService: GitService;

  constructor(repoPath: string) {
    this.gitService = new GitService(repoPath);
  }

  async getGitStatus() {
    const [status, lastCommit] = await Promise.all([
      this.gitService.getGitStatus(),
      this.gitService.getCommitHistory(1)
    ]);

    return {
      branch: await this.getCurrentBranch(),
      changes: status,
      lastCommit: lastCommit[0]
    };
  }

  async getRepositoryAnalysis() {
    const [stats, changes] = await Promise.all([
      this.gitService.getRepositoryStats(),
      this.gitService.getGitStatus()
    ]);

    const codeQuality = await this.gitService.analyzeCode(
      changes.map(c => c.path)
    );

    return {
      codeQuality,
      stats,
      recommendations: this.generateRecommendations(codeQuality, stats, changes)
    };
  }

  private async getCurrentBranch(): Promise<string> {
    const { stdout } = await this.gitService.execGit('rev-parse --abbrev-ref HEAD');
    return stdout.trim();
  }

  private generateRecommendations(codeQuality: any, stats: any, changes: any[]) {
    const recommendations = [];

    // 基于代码质量推荐
    if (codeQuality.complexityScore > 70) {
      recommendations.push({
        type: 'refactor',
        description: 'High code complexity detected, consider refactoring',
        priority: 1
      });
    }

    // 基于安全问题推荐
    if (codeQuality.securityIssues.length > 0) {
      recommendations.push({
        type: 'review',
        description: 'Security issues found, review required',
        priority: 0
      });
    }

    // 基于变更推荐
    if (changes.length > 10) {
      recommendations.push({
        type: 'commit',
        description: 'Large number of changes, consider breaking into smaller commits',
        priority: 2
      });
    }

    return recommendations;
  }
}

export class GitToolHandlers {
  private gitService: GitService;

  constructor(repoPath: string) {
    this.gitService = new GitService(repoPath);
  }

  async commitChanges({ files, style }: { files: string[], style: CommitMessageStyle }) {
    const changes = await this.gitService.getGitStatus();
    const relevantChanges = changes.filter(c => files.includes(c.path));
    
    const analysis = await this.gitService.analyzeCode(files);
    const message = await this.gitService.generateCommitMessage(relevantChanges, style);

    try {
      await this.gitService.execGit(`add ${files.join(' ')}`);
      await this.gitService.execGit(`commit -m "${message}"`);
      const { stdout } = await this.gitService.execGit('rev-parse HEAD');
      
      return {
        success: true,
        commitHash: stdout.trim(),
        message,
        analysis
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to commit changes',
        analysis
      };
    }
  }

  async suggestImprovements({ files }: { files: string[] }) {
    const analysis = await this.gitService.analyzeCode(files);
    const suggestions = [];

    // 代码质量建议
    if (analysis.complexityScore > 50) {
      suggestions.push({
        type: 'quality',
        description: 'Consider breaking down complex functions',
        location: files.join(', '),
        priority: analysis.complexityScore / 10
      });
    }

    // 安全建议
    analysis.securityIssues.forEach(issue => {
      suggestions.push({
        type: 'security',
        description: issue.description,
        location: issue.location,
        priority: issue.severity === 'high' ? 9 : issue.severity === 'medium' ? 6 : 3
      });
    });

    // 性能建议
    if (analysis.performanceImpact.score > 30) {
      analysis.performanceImpact.details.forEach(detail => {
        suggestions.push({
          type: 'performance',
          description: detail,
          location: files.join(', '),
          priority: analysis.performanceImpact.score / 10
        });
      });
    }

    return { suggestions };
  }

  async reviewChanges({ files }: { files: string[] }) {
    const analysis = await this.gitService.analyzeCode(files);
    const feedback = [];

    // 代码质量反馈
    if (analysis.complexityScore > 70) {
      feedback.push({
        type: 'issue',
        message: 'Code is too complex, needs simplification',
        location: files.join(', '),
        severity: 'high'
      });
    } else if (analysis.complexityScore < 30) {
      feedback.push({
        type: 'praise',
        message: 'Good code structure and complexity',
        location: files.join(', '),
        severity: 'low'
      });
    }

    // 安全问题反馈
    analysis.securityIssues.forEach(issue => {
      feedback.push({
        type: 'issue',
        message: issue.description,
        location: issue.location,
        severity: issue.severity
      });
    });

    // 性能问题反馈
    analysis.performanceImpact.details.forEach(detail => {
      feedback.push({
        type: 'suggestion',
        message: detail,
        location: files.join(', '),
        severity: 'medium'
      });
    });

    return { feedback };
  }

  async rollbackChanges({ options }: { options: RollbackOptions }) {
    const affectedFiles = options.type === 'file' 
      ? [options.target]
      : await this.getAffectedFiles(options.target);

    const analysis = {
      impact: this.calculateImpact(affectedFiles),
      affectedComponents: this.identifyComponents(affectedFiles)
    };

    const result = await this.gitService.rollback(options);

    return { analysis, result };
  }

  private async getAffectedFiles(commitHash: string) {
    const changes = await this.gitService.getFileChanges(commitHash);
    return changes.map(c => c.path);
  }

  private calculateImpact(files: string[]): string {
    if (files.length > 10) return 'high';
    if (files.length > 5) return 'medium';
    return 'low';
  }

  private identifyComponents(files: string[]): string[] {
    return Array.from(new Set(
      files.map(f => f.split('/')[0])
    ));
  }
} 