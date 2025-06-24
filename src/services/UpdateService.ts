import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import simpleGit from 'simple-git';

const execAsync = promisify(exec);

interface UpdateConfig {
  auto_update: boolean;
  update_check_interval: number;
  update_source: {
    type: string;
    repository: string;
    branch: string;
  };
  backup: {
    enabled: boolean;
    path: string;
  };
}

interface UpdateStatus {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  lastUpdateCheck: Date;
  lastUpdate: Date;
  pendingChanges: Array<{
    type: 'feature' | 'bugfix' | 'security';
    description: string;
  }>;
}

export class UpdateService {
  private config: UpdateConfig;
  private status: UpdateStatus;
  private git: ReturnType<typeof simpleGit>;
  private rootDir: string;

  constructor(rootDir: string, config: UpdateConfig) {
    this.rootDir = rootDir;
    this.config = config;
    this.git = simpleGit(rootDir);
    this.status = {
      currentVersion: '0.0.0',
      latestVersion: '0.0.0',
      updateAvailable: false,
      lastUpdateCheck: new Date(0),
      lastUpdate: new Date(0),
      pendingChanges: []
    };
  }

  async initialize() {
    // 读取当前版本
    const packageJson = JSON.parse(
      await fs.readFile(join(this.rootDir, 'package.json'), 'utf-8')
    );
    this.status.currentVersion = packageJson.version;

    // 设置远程仓库
    await this.git.addRemote('update-source', this.config.update_source.repository);

    // 如果启用了自动更新，开始定期检查
    if (this.config.auto_update) {
      this.startAutoUpdateCheck();
    }
  }

  private startAutoUpdateCheck() {
    setInterval(async () => {
      try {
        await this.checkForUpdates();
        if (this.status.updateAvailable) {
          await this.applyUpdate({ backup: this.config.backup.enabled });
        }
      } catch (error) {
        console.error('Auto update check failed:', error);
      }
    }, this.config.update_check_interval * 1000);
  }

  async getUpdateStatus(): Promise<UpdateStatus> {
    return this.status;
  }

  async checkForUpdates() {
    try {
      // 获取远程更新
      await this.git.fetch('update-source', this.config.update_source.branch);

      // 获取最新版本
      const { stdout: latestTag } = await execAsync(
        `git -C ${this.rootDir} describe --tags --abbrev=0 update-source/${this.config.update_source.branch}`
      );
      this.status.latestVersion = latestTag.trim();

      // 检查是否有更新
      this.status.updateAvailable = this.status.latestVersion !== this.status.currentVersion;
      this.status.lastUpdateCheck = new Date();

      if (this.status.updateAvailable) {
        // 获取变更日志
        const { stdout: changelog } = await execAsync(
          `git -C ${this.rootDir} log --pretty=format:"%s" ${this.status.currentVersion}..${this.status.latestVersion}`
        );

        this.status.pendingChanges = changelog
          .split('\n')
          .map(line => {
            const type = line.includes('fix:') ? 'bugfix' :
                        line.includes('security:') ? 'security' : 'feature';
            return {
              type,
              description: line.trim()
            };
          });
      }

      return {
        updateAvailable: this.status.updateAvailable,
        currentVersion: this.status.currentVersion,
        latestVersion: this.status.latestVersion,
        changes: this.status.pendingChanges
      };
    } catch (error) {
      console.error('Failed to check for updates:', error);
      throw error;
    }
  }

  async applyUpdate({ version, backup = true }: { version?: string; backup?: boolean }) {
    try {
      const targetVersion = version || this.status.latestVersion;

      // 创建备份
      let backupPath: string | undefined;
      if (backup) {
        backupPath = await this.createBackup();
      }

      // 切换到目标版本
      await this.git.checkout(targetVersion);

      // 安装依赖
      await execAsync('npm install', { cwd: this.rootDir });

      // 构建项目
      await execAsync('npm run build', { cwd: this.rootDir });

      // 更新状态
      const previousVersion = this.status.currentVersion;
      this.status.currentVersion = targetVersion;
      this.status.lastUpdate = new Date();
      this.status.updateAvailable = false;
      this.status.pendingChanges = [];

      return {
        success: true,
        previousVersion,
        newVersion: targetVersion,
        backupCreated: !!backupPath,
        backupPath
      };
    } catch (error) {
      console.error('Failed to apply update:', error);
      throw error;
    }
  }

  async rollbackUpdate({ version, useBackup = true }: { version: string; useBackup?: boolean }) {
    try {
      if (useBackup) {
        // 从备份恢复
        const backupPath = join(this.rootDir, this.config.backup.path, `backup-${version}`);
        if (await fs.access(backupPath).then(() => true, () => false)) {
          await this.restoreFromBackup(backupPath);
        } else {
          throw new Error(`No backup found for version ${version}`);
        }
      } else {
        // 直接切换到指定版本
        await this.git.checkout(version);
        await execAsync('npm install', { cwd: this.rootDir });
        await execAsync('npm run build', { cwd: this.rootDir });
      }

      this.status.currentVersion = version;
      return {
        success: true,
        currentVersion: version
      };
    } catch (error) {
      console.error('Failed to rollback update:', error);
      return {
        success: false,
        currentVersion: this.status.currentVersion,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async createBackup(): Promise<string> {
    const backupDir = join(this.rootDir, this.config.backup.path);
    const backupPath = join(backupDir, `backup-${this.status.currentVersion}`);

    // 创建备份目录
    await fs.mkdir(backupDir, { recursive: true });

    // 复制所有文件（除了 node_modules 和 .git）
    await execAsync(
      `rsync -av --exclude 'node_modules' --exclude '.git' . ${backupPath}`,
      { cwd: this.rootDir }
    );

    return backupPath;
  }

  private async restoreFromBackup(backupPath: string) {
    // 恢复文件
    await execAsync(
      `rsync -av --delete ${backupPath}/ .`,
      { cwd: this.rootDir }
    );

    // 重新安装依赖
    await execAsync('npm install', { cwd: this.rootDir });
  }
} 