#!/usr/bin/env node

import express from 'express';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import simpleGit, { SimpleGit } from "simple-git";
import { GitService } from './services/GitService.js';
import { CodeAnalysisService } from './services/CodeAnalysisService.js';
import { CommitMessageService } from './services/CommitMessageService.js';

class GitAgentServer {
  private server: Server;
  private git: SimpleGit;
  private gitService: GitService;
  private analysisService: CodeAnalysisService;
  private commitService: CommitMessageService;
  private config: any;

  constructor(config: any = {}) {
    this.config = config;
    this.server = new Server(
      {
        name: "mcp-git-agent",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
          resources: {},
        },
      }
    );
    
    this.git = simpleGit(config.gitPath || process.cwd());
    this.gitService = new GitService(config.gitPath || process.cwd());
    this.analysisService = new CodeAnalysisService();
    this.commitService = new CommitMessageService();
    
    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "get_git_status",
            description: "Get current Git repository status",
            inputSchema: {
              type: "object",
              properties: {
                repository_path: {
                  type: "string",
                  description: "Path to the Git repository",
                },
              },
            },
          },
          {
            name: "get_commit_history",
            description: "Retrieve Git commit history",
            inputSchema: {
              type: "object",
              properties: {
                limit: {
                  type: "number",
                  description: "Maximum number of commits",
                  default: 10,
                },
              },
            },
          },
          {
            name: "analyze_code_changes",
            description: "AI-powered analysis of code changes",
            inputSchema: {
              type: "object",
              properties: {
                file_path: {
                  type: "string",
                  description: "Path to the file to analyze",
                },
                analysis_type: {
                  type: "string",
                  enum: ["impact", "quality", "security", "performance"],
                  default: "impact",
                },
              },
            },
          },
          {
            name: "generate_commit_message",
            description: "Generate intelligent commit messages",
            inputSchema: {
              type: "object",
              properties: {
                style: {
                  type: "string",
                  enum: ["conventional", "detailed", "concise"],
                  default: "conventional",
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
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        throw new Error(`Tool execution failed: ${error}`);
      }
    });

    // Context providers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: "git://status",
            name: "Git Status",
            description: "Current repository status",
            mimeType: "application/json",
          },
          {
            uri: "git://analysis",
            name: "Repository Analysis",
            description: "Code quality and insights",
            mimeType: "application/json",
          },
        ],
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      
      switch (uri) {
        case "git://status":
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(await this.gitService.getGitStatus(), null, 2),
              },
            ],
          };
        case "git://analysis":
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(await this.gitService.getRepositoryStats(), null, 2),
              },
            ],
          };
        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    });
  }

  private async getGitStatus(args: any) {
    const status = await this.gitService.getGitStatus();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }

  private async getCommitHistory(args: any) {
    const history = await this.gitService.getCommitHistory(args.limit || 10);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(history, null, 2),
        },
      ],
    };
  }

  private async analyzeCodeChanges(args: any) {
    const files = args.file_path ? [args.file_path] : [];
    const analysis = await this.analysisService.analyzeFiles(files);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(analysis, null, 2),
        },
      ],
    };
  }

  private async generateCommitMessage(args: any) {
    const changes = await this.gitService.getGitStatus();
    const message = await this.commitService.generateMessage(
      changes,
      args.style || "conventional"
    );
    return {
      content: [
        {
          type: "text",
          text: message,
        },
      ],
    };
  }

  getServer() {
    return this.server;
  }
}

// Create Express app
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// MCP endpoints for Smithery
app.all('/mcp', async (req, res) => {
  try {
    // Extract config from request
    const config = req.body?.config || {};
    
    // Create MCP server instance
    const gitAgent = new GitAgentServer(config);
    const server = gitAgent.getServer();
    
    // Create SSE transport for this request
    const transport = new SSEServerTransport('/mcp', res);
    
    // Connect server to transport
    await server.connect(transport);
    
    // The transport handles the rest
  } catch (error) {
    console.error('MCP endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Git Agent MCP Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});

export default app; 