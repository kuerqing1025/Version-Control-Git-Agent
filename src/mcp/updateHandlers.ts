import { UpdateService } from '../services/UpdateService';

export class UpdateHandlers {
  private updateService: UpdateService;

  constructor(rootDir: string, config: any) {
    this.updateService = new UpdateService(rootDir, config.update_config);
  }

  async initialize() {
    await this.updateService.initialize();
  }

  // Context Providers
  async getUpdateStatus() {
    return this.updateService.getUpdateStatus();
  }

  // Tools
  async checkForUpdates() {
    return this.updateService.checkForUpdates();
  }

  async applyUpdate({ version, backup }: { version?: string; backup?: boolean }) {
    return this.updateService.applyUpdate({ version, backup });
  }

  async rollbackUpdate({ version, useBackup }: { version: string; useBackup?: boolean }) {
    return this.updateService.rollbackUpdate({ version, useBackup });
  }
} 