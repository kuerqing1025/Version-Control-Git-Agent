#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import simpleGit, { SimpleGit, StatusResult, LogResult } from "simple-git";
import { createServer } from '@smithery/sdk';
import { GitContextProviders, GitToolHandlers } from './mcp/handlers';
import { UpdateHandlers } from './mcp/updateHandlers';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import { createServer as httpCreateServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import { config } from './config';
import { GitService } from './services/GitService';
import { UpdateService } from './services/UpdateService';

// Git Agent MCP Server
class GitAgentServer {
  private server: Server;
  private git: SimpleGit;

  constructor() {
    this.server = new Server(
      {
        name: "mcp-git-agent",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.git = simpleGit();
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "get_git_status",
            description: "Get current Git repository status including staged, unstaged, and untracked files",
            inputSchema: {
              type: "object",
              properties: {
                repository_path: {
                  type: "string",
                  description: "Path to the Git repository (optional, defaults to current directory)",
                },
              },
            },
          },
          {
            name: "get_commit_history",
            description: "Retrieve Git commit history with detailed information",
            inputSchema: {
              type: "object",
              properties: {
                limit: {
                  type: "number",
                  description: "Maximum number of commits to retrieve (default: 10)",
                  default: 10,
                },
                repository_path: {
                  type: "string",
                  description: "Path to the Git repository (optional)",
                },
              },
            },
          },
          {
            name: "analyze_code_changes",
            description: "AI-powered analysis of code changes explaining impact and implications",
            inputSchema: {
              type: "object",
              properties: {
                file_path: {
                  type: "string",
                  description: "Path to the file to analyze (optional, analyzes all changes if not provided)",
                },
                analysis_type: {
                  type: "string",
                  enum: ["impact", "quality", "security", "performance"],
                  description: "Type of analysis to perform",
                  default: "impact",
                },
              },
            },
          },
          {
            name: "generate_commit_message",
            description: "Generate intelligent, conventional commit messages based on staged changes",
            inputSchema: {
              type: "object",
              properties: {
                style: {
                  type: "string",
                  enum: ["conventional", "detailed", "concise"],
                  description: "Style of commit message to generate",
                  default: "conventional",
                },
                include_files: {
                  type: "boolean",
                  description: "Whether to include file list in the message",
                  default: false,
                },
              },
            },
          },
          {
            name: "get_file_diff",
            description: "Get detailed diff information for specific files",
            inputSchema: {
              type: "object",
              properties: {
                file_path: {
                  type: "string",
                  description: "Path to the file to get diff for",
                },
                commit_hash: {
                  type: "string",
                  description: "Specific commit to compare against (optional)",
                },
              },
              required: ["file_path"],
            },
          },
          {
            name: "get_file_blame",
            description: "Get line-by-line authorship information for files",
            inputSchema: {
              type: "object",
              properties: {
                file_path: {
                  type: "string",
                  description: "Path to the file to get blame information for",
                },
              },
              required: ["file_path"],
            },
          },
          {
            name: "summarize_project_history",
            description: "Generate comprehensive project development summary from Git history",
            inputSchema: {
              type: "object",
              properties: {
                days: {
                  type: "number",
                  description: "Number of days to analyze (default: 30)",
                  default: 30,
                },
                include_stats: {
                  type: "boolean",
                  description: "Whether to include detailed statistics",
                  default: true,
                },
              },
            },
          },
          {
            name: "get_repository_stats",
            description: "Get detailed repository statistics including commits, contributors, and activity",
            inputSchema: {
              type: "object",
              properties: {
                detailed: {
                  type: "boolean",
                  description: "Whether to include detailed breakdown",
                  default: false,
                },
              },
            },
          },
        ] satisfies Tool[],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "get_git_status":
            return await this.getGitStatus(args);
          
          case "get_commit_history":
            return await this.getCommitHistory(args);
          
          case "analyze_code_changes":
            return await this.analyzeCodeChanges(args);
          
          case "generate_commit_message":
            return await this.generateCommitMessage(args);
          
          case "get_file_diff":
            return await this.getFileDiff(args);
          
          case "get_file_blame":
            return await this.getFileBlame(args);
          
          case "summarize_project_history":
            return await this.summarizeProjectHistory(args);
          
          case "get_repository_stats":
            return await this.getRepositoryStats(args);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error executing ${name}: ${errorMessage}`,
            },
          ],
        };
      }
    });
  }

  private async getGitStatus(args: any) {
    const repositoryPath = args?.repository_path || process.cwd();
    const git = simpleGit(repositoryPath);
    
    const status: StatusResult = await git.status();
    
    const result = {
      branch: status.current,
      ahead: status.ahead,
      behind: status.behind,
      staged: status.staged,
      unstaged: status.modified.concat(status.deleted),
      untracked: status.not_added,
      conflicted: status.conflicted,
      clean: status.isClean(),
    };

    return {
      content: [
        {
          type: "text",
          text: `🔍 **Git Status Report**

📊 **Repository State:**
- Current Branch: ${result.branch || 'detached HEAD'}
- Status: ${result.clean ? '✅ Clean' : '⚠️ Has Changes'}
- Ahead by: ${result.ahead} commits
- Behind by: ${result.behind} commits

📝 **File Changes:**
- Staged: ${result.staged.length} files
- Modified: ${result.unstaged.length} files  
- Untracked: ${result.untracked.length} files
- Conflicted: ${result.conflicted.length} files

${result.staged.length > 0 ? `\n🟢 **Staged Files:**\n${result.staged.map(f => `  • ${f}`).join('\n')}` : ''}
${result.unstaged.length > 0 ? `\n🟡 **Modified Files:**\n${result.unstaged.map(f => `  • ${f}`).join('\n')}` : ''}
${result.untracked.length > 0 ? `\n❓ **Untracked Files:**\n${result.untracked.map(f => `  • ${f}`).join('\n')}` : ''}
${result.conflicted.length > 0 ? `\n🔴 **Conflicted Files:**\n${result.conflicted.map(f => `  • ${f}`).join('\n')}` : ''}`,
        },
      ],
    };
  }

  private async getCommitHistory(args: any) {
    const limit = args?.limit || 10;
    const repositoryPath = args?.repository_path || process.cwd();
    const git = simpleGit(repositoryPath);
    
    const log: LogResult = await git.log({ maxCount: limit });
    
    const commits = log.all.map(commit => ({
      hash: commit.hash.substring(0, 8),
      message: commit.message,
      author: commit.author_name,
      email: commit.author_email,
      date: commit.date,
      filesChanged: commit.diff?.files.length || 0,
    }));

    return {
      content: [
        {
          type: "text",
          text: `📜 **Commit History (${commits.length} commits)**

${commits.map(commit => 
`🔹 **${commit.hash}** by ${commit.author} (${new Date(commit.date).toLocaleDateString()})
   📝 ${commit.message}
   📁 ${commit.filesChanged} files changed`
).join('\n\n')}`,
        },
      ],
    };
  }

  private async analyzeCodeChanges(args: any) {
    const filePath = args?.file_path;
    const analysisType = args?.analysis_type || 'impact';
    
    // Get current diff
    const diff = filePath 
      ? await this.git.diff(['HEAD', filePath])
      : await this.git.diff(['HEAD']);

    if (!diff) {
      return {
        content: [
          {
            type: "text",
            text: "ℹ️ No changes detected to analyze.",
          },
        ],
      };
    }

    // Analyze based on type
    let analysis = '';
    switch (analysisType) {
      case 'impact':
        analysis = this.analyzeImpact(diff);
        break;
      case 'quality':
        analysis = this.analyzeQuality(diff);
        break;
      case 'security':
        analysis = this.analyzeSecurity(diff);
        break;
      case 'performance':
        analysis = this.analyzePerformance(diff);
        break;
    }

    return {
      content: [
        {
          type: "text",
          text: `🔍 **Code Analysis (${analysisType.toUpperCase()})**

${analysis}

📊 **Change Summary:**
- Lines added: ${(diff.match(/^\+/gm) || []).length}
- Lines removed: ${(diff.match(/^-/gm) || []).length}
- Files affected: ${filePath ? '1' : 'Multiple'}`,
        },
      ],
    };
  }

  private analyzeImpact(diff: string): string {
    const addedLines = (diff.match(/^\+/gm) || []).length;
    const removedLines = (diff.match(/^-/gm) || []).length;
    
    let impact = '';
    
    if (addedLines > removedLines * 2) {
      impact = '📈 **Major Feature Addition** - Significant new functionality';
    } else if (removedLines > addedLines * 2) {
      impact = '🗑️ **Code Removal/Cleanup** - Reducing codebase complexity';
    } else if (addedLines + removedLines > 100) {
      impact = '🔄 **Large Refactoring** - Substantial changes to existing code';
    } else {
      impact = '✨ **Minor Enhancement** - Small improvements or fixes';
    }

    // Check for common patterns
    if (diff.includes('import') || diff.includes('require')) {
      impact += '\n• 📦 Dependencies: New imports/requirements added';
    }
    if (diff.includes('export') || diff.includes('module.exports')) {
      impact += '\n• 🔗 API Changes: Public interface modifications';
    }
    if (diff.includes('test') || diff.includes('spec')) {
      impact += '\n• 🧪 Testing: Test coverage changes';
    }

    return impact;
  }

  private analyzeQuality(diff: string): string {
    let quality = '📋 **Code Quality Assessment:**\n\n';
    
    // Check for good practices
    if (diff.includes('// ') || diff.includes('/* ') || diff.includes('"""')) {
      quality += '✅ Documentation: Comments and documentation added\n';
    }
    if (diff.includes('try') && diff.includes('catch')) {
      quality += '✅ Error Handling: Exception handling implemented\n';
    }
    if (diff.includes('const ') || diff.includes('readonly')) {
      quality += '✅ Immutability: Using immutable declarations\n';
    }
    
    // Check for potential issues
    if (diff.includes('console.log') || diff.includes('print(')) {
      quality += '⚠️ Debug Code: Remove debug statements before production\n';
    }
    if (diff.includes('TODO') || diff.includes('FIXME')) {
      quality += '⚠️ Tech Debt: TODO/FIXME comments need attention\n';
    }
    
    return quality;
  }

  private analyzeSecurity(diff: string): string {
    let security = '🔒 **Security Analysis:**\n\n';
    
    // Check for security concerns
    if (diff.includes('password') || diff.includes('secret') || diff.includes('key')) {
      security += '🚨 Credentials: Potential sensitive data exposure\n';
    }
    if (diff.includes('eval(') || diff.includes('exec(')) {
      security += '🚨 Code Injection: Dynamic code execution detected\n';
    }
    if (diff.includes('http://')) {
      security += '⚠️ Insecure Protocol: HTTP instead of HTTPS\n';
    }
    if (diff.includes('innerHTML') || diff.includes('dangerouslySetInnerHTML')) {
      security += '⚠️ XSS Risk: Direct HTML injection\n';
    } else {
      security += '✅ No obvious security issues detected\n';
    }
    
    return security;
  }

  private analyzePerformance(diff: string): string {
    let performance = '⚡ **Performance Analysis:**\n\n';
    
    // Check for performance patterns
    if (diff.includes('async') || diff.includes('await')) {
      performance += '✅ Async Operations: Non-blocking code patterns\n';
    }
    if (diff.includes('memo') || diff.includes('useMemo') || diff.includes('useCallback')) {
      performance += '✅ Optimization: Memoization patterns detected\n';
    }
    if (diff.includes('for') && diff.includes('for')) {
      performance += '⚠️ Nested Loops: Potential O(n²) complexity\n';
    }
    if (diff.includes('.map(') && diff.includes('.filter(')) {
      performance += '⚠️ Chained Operations: Consider combining operations\n';
    } else {
      performance += '✅ No obvious performance issues detected\n';
    }
    
    return performance;
  }

  private async generateCommitMessage(args: any) {
    const style = args?.style || 'conventional';
    const includeFiles = args?.include_files || false;
    
    const status = await this.git.status();
    const diff = await this.git.diff(['--cached']);
    
    if (status.staged.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "⚠️ No staged changes found. Please stage your changes first using `git add`.",
          },
        ],
      };
    }

    let message = '';
    let type = 'feat';
    
    // Determine commit type based on changes
    if (diff.includes('fix') || diff.includes('bug')) {
      type = 'fix';
    } else if (diff.includes('test')) {
      type = 'test';
    } else if (diff.includes('doc') || diff.includes('README')) {
      type = 'docs';
    } else if (diff.includes('refactor')) {
      type = 'refactor';
    }

    // Generate description
    const description = this.generateCommitDescription(status.staged, diff);

    switch (style) {
      case 'conventional':
        message = `${type}: ${description}`;
        if (includeFiles) {
          message += `\n\nFiles changed:\n${status.staged.map(f => `- ${f}`).join('\n')}`;
        }
        break;
      
      case 'detailed':
        message = `${type}: ${description}\n\n`;
        message += `Changes include:\n${status.staged.map(f => `- ${f}`).join('\n')}\n\n`;
        message += `Summary: ${this.generateDetailedSummary(diff)}`;
        break;
      
      case 'concise':
        message = description;
        break;
    }

    return {
      content: [
        {
          type: "text",
          text: `📝 **Generated Commit Message**

\`\`\`
${message}
\`\`\`

💡 **Commit Details:**
- Type: ${type}
- Files: ${status.staged.length}
- Style: ${style}

To use this message, run:
\`git commit -m "${message.split('\n')[0]}"\``,
        },
      ],
    };
  }

  private generateCommitDescription(files: string[], diff: string): string {
    // Simple heuristic-based description generation
    if (files.some(f => f.includes('component') || f.includes('Component'))) {
      return 'update component functionality';
    }
    if (files.some(f => f.includes('test') || f.includes('spec'))) {
      return 'add test coverage';
    }
    if (files.some(f => f.includes('README') || f.includes('doc'))) {
      return 'update documentation';
    }
    if (files.some(f => f.includes('config') || f.includes('json'))) {
      return 'update configuration';
    }
    if (diff.includes('function') || diff.includes('const ')) {
      return 'add new functionality';
    }
    return 'update codebase';
  }

  private generateDetailedSummary(diff: string): string {
    const addedLines = (diff.match(/^\+/gm) || []).length;
    const removedLines = (diff.match(/^-/gm) || []).length;
    
    return `Added ${addedLines} lines, removed ${removedLines} lines. ${
      addedLines > removedLines ? 'Net addition of functionality.' : 
      removedLines > addedLines ? 'Code cleanup and optimization.' : 
      'Balanced refactoring changes.'
    }`;
  }

  private async getFileDiff(args: any) {
    const filePath = args.file_path;
    const commitHash = args?.commit_hash;
    
    let diff: string;
    if (commitHash) {
      diff = await this.git.show([`${commitHash}:${filePath}`]);
    } else {
      diff = await this.git.diff([filePath]);
    }

    return {
      content: [
        {
          type: "text",
          text: `📄 **File Diff: ${filePath}**

\`\`\`diff
${diff || 'No changes found'}
\`\`\``,
        },
      ],
    };
  }

  private async getFileBlame(args: any) {
    const filePath = args.file_path;
    
    try {
      // Using raw git command since simple-git doesn't have blame
      const blame = await this.git.raw(['blame', '--line-porcelain', filePath]);
      
      return {
        content: [
          {
            type: "text",
            text: `👥 **File Blame: ${filePath}**

\`\`\`
${blame}
\`\`\``,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Could not get blame information for ${filePath}. File may not exist or may not be tracked by Git.`,
          },
        ],
      };
    }
  }

  private async summarizeProjectHistory(args: any) {
    const days = args?.days || 30;
    const includeStats = args?.include_stats !== false;
    
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    const log = await this.git.log({ since: since.toISOString() });
    const commits = log.all;
    
    // Analyze commits
    const authors = new Set(commits.map(c => c.author_name));
    const commitsByAuthor = Array.from(authors).map(author => ({
      author,
      count: commits.filter(c => c.author_name === author).length,
    }));
    
    let summary = `📊 **Project History Summary (${days} days)**\n\n`;
    summary += `📈 **Activity Overview:**\n`;
    summary += `- Total commits: ${commits.length}\n`;
    summary += `- Active contributors: ${authors.size}\n`;
    summary += `- Average commits/day: ${(commits.length / days).toFixed(1)}\n\n`;
    
    if (includeStats) {
      summary += `👥 **Top Contributors:**\n`;
      commitsByAuthor
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .forEach(({ author, count }) => {
          summary += `- ${author}: ${count} commits\n`;
        });
      
      summary += `\n📝 **Recent Activity:**\n`;
      commits.slice(0, 5).forEach(commit => {
        summary += `- ${commit.hash.substring(0, 8)}: ${commit.message} (${commit.author_name})\n`;
      });
    }

    return {
      content: [
        {
          type: "text",
          text: summary,
        },
      ],
    };
  }

  private async getRepositoryStats(args: any) {
    const detailed = args?.detailed || false;
    
    try {
      const log = await this.git.log();
      const status = await this.git.status();
      const branches = await this.git.branch(['-a']);
      
      const totalCommits = log.total;
      const authors = new Set(log.all.map(c => c.author_name));
      const recentCommit = log.latest;
      
      let stats = `📊 **Repository Statistics**\n\n`;
      stats += `📈 **Overall Stats:**\n`;
      stats += `- Total commits: ${totalCommits}\n`;
      stats += `- Contributors: ${authors.size}\n`;
      stats += `- Branches: ${branches.all.length}\n`;
      stats += `- Current branch: ${status.current}\n`;
      stats += `- Last commit: ${recentCommit?.date || 'N/A'}\n\n`;
      
      if (detailed) {
        stats += `🌿 **Branches:**\n`;
        branches.all.slice(0, 10).forEach(branch => {
          stats += `- ${branch}${branch === status.current ? ' (current)' : ''}\n`;
        });
        
        stats += `\n👥 **Contributors:**\n`;
        Array.from(authors).slice(0, 10).forEach(author => {
          stats += `- ${author}\n`;
        });
      }

      return {
        content: [
          {
            type: "text",
            text: stats,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error gathering repository statistics: ${error}`,
          },
        ],
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("MCP Git Agent Server running on stdio");
  }
}

async function main() {
  const rootDir = process.cwd();
  const config = JSON.parse(
    readFileSync(join(rootDir, 'smithery.yaml'), 'utf-8')
  );

  // Initialize handlers
  const contextProviders = new GitContextProviders(rootDir);
  const toolHandlers = new GitToolHandlers(rootDir);
  const updateHandlers = new UpdateHandlers(rootDir, config);

  // Initialize update service
  await updateHandlers.initialize();

  const server = await createServer({
    contextProviders: {
      git_status: contextProviders.getGitStatus.bind(contextProviders),
      repository_analysis: contextProviders.getRepositoryAnalysis.bind(contextProviders),
      update_status: updateHandlers.getUpdateStatus.bind(updateHandlers),
    },
    tools: {
      commit_changes: toolHandlers.commitChanges.bind(toolHandlers),
      suggest_improvements: toolHandlers.suggestImprovements.bind(toolHandlers),
      review_changes: toolHandlers.reviewChanges.bind(toolHandlers),
      rollback_changes: toolHandlers.rollbackChanges.bind(toolHandlers),
      check_for_updates: updateHandlers.checkForUpdates.bind(updateHandlers),
      apply_update: updateHandlers.applyUpdate.bind(updateHandlers),
      rollback_update: updateHandlers.rollbackUpdate.bind(updateHandlers),
    },
  });

  // Start the server with built-in playground
  const port = config.server?.port || 3000;
  server.listen(port, () => {
    console.log(`Git Agent MCP server is running on port ${port}`);
    console.log(`Playground available at http://localhost:${port}/playground`);
  });
}

main().catch(console.error); 