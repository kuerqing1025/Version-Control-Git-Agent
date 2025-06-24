import { GitFileChange, CommitMessageStyle } from '../types/git';

export class CommitMessageService {
  generateMessage(changes: GitFileChange[], style: CommitMessageStyle): string {
    const scope = this.determineScope(changes);
    const type = this.determineChangeType(changes);
    const description = this.generateDescription(changes);

    switch (style.type) {
      case 'conventional':
        return this.generateConventionalMessage(type, scope, description, style);
      case 'gitmoji':
        return this.generateGitmojiMessage(type, scope, description, style);
      case 'detailed':
        return this.generateDetailedMessage(type, scope, description, changes, style);
      case 'simple':
      default:
        return this.generateSimpleMessage(type, description, style);
    }
  }

  private determineScope(changes: GitFileChange[]): string {
    const uniqueDirs = new Set(changes.map(change => {
      const parts = change.path.split('/');
      return parts.length > 1 ? parts[0] : 'root';
    }));

    return uniqueDirs.size === 1 ? Array.from(uniqueDirs)[0] : 'multiple';
  }

  private determineChangeType(changes: GitFileChange[]): string {
    const hasNewFeature = changes.some(c => c.status === 'added');
    const hasFix = changes.some(c => c.status === 'modified' && c.path.match(/test|spec|fix/i));
    const hasRefactor = changes.some(c => c.status === 'modified' && !c.path.match(/test|spec|fix/i));
    
    if (hasNewFeature) return 'feat';
    if (hasFix) return 'fix';
    if (hasRefactor) return 'refactor';
    return 'chore';
  }

  private generateDescription(changes: GitFileChange[]): string {
    const mainChange = changes[0];
    const actionWord = this.getActionWord(mainChange.status);
    const component = this.getComponent(mainChange.path);
    
    return `${actionWord} ${component}${changes.length > 1 ? ' and related files' : ''}`;
  }

  private generateConventionalMessage(type: string, scope: string, description: string, style: CommitMessageStyle): string {
    let message = `${type}${style.includeScope ? `(${scope})` : ''}: ${description}`;
    
    if (style.includeFooter && style.maxLength > message.length + 20) {
      message += '\n\nRelated components: ' + scope;
    }
    
    return this.truncateMessage(message, style.maxLength);
  }

  private generateGitmojiMessage(type: string, scope: string, description: string, style: CommitMessageStyle): string {
    const emoji = this.getEmojiForType(type);
    let message = `${emoji} ${description}`;
    
    if (style.includeScope) {
      message = `[${scope}] ${message}`;
    }
    
    if (style.includeFooter && style.maxLength > message.length + 20) {
      message += `\n\nType: ${type}`;
    }
    
    return this.truncateMessage(message, style.maxLength);
  }

  private generateDetailedMessage(type: string, scope: string, description: string, changes: GitFileChange[], style: CommitMessageStyle): string {
    let message = `${type}(${scope}): ${description}\n\nChanges:`;
    
    for (const change of changes) {
      const line = `\n- ${change.status}: ${change.path}`;
      if (message.length + line.length > style.maxLength) {
        message += '\n- ... and more changes';
        break;
      }
      message += line;
    }
    
    if (style.includeFooter) {
      message += '\n\nScope: ' + scope;
    }
    
    return this.truncateMessage(message, style.maxLength);
  }

  private generateSimpleMessage(type: string, description: string, style: CommitMessageStyle): string {
    return this.truncateMessage(description, style.maxLength);
  }

  private getActionWord(status: string): string {
    switch (status) {
      case 'added': return 'Add';
      case 'modified': return 'Update';
      case 'deleted': return 'Remove';
      case 'renamed': return 'Rename';
      default: return 'Update';
    }
  }

  private getComponent(path: string): string {
    const parts = path.split('/');
    const filename = parts[parts.length - 1];
    return filename.replace(/\.[^/.]+$/, '');
  }

  private getEmojiForType(type: string): string {
    switch (type) {
      case 'feat': return '✨';
      case 'fix': return '🐛';
      case 'refactor': return '♻️';
      case 'chore': return '🔧';
      default: return '📝';
    }
  }

  private truncateMessage(message: string, maxLength: number): string {
    if (message.length <= maxLength) return message;
    
    const lines = message.split('\n');
    if (lines[0].length > maxLength) {
      return lines[0].substring(0, maxLength - 3) + '...';
    }
    
    let result = lines[0];
    for (let i = 1; i < lines.length; i++) {
      if (result.length + lines[i].length + 1 > maxLength - 3) {
        return result + '\n...';
      }
      result += '\n' + lines[i];
    }
    
    return result;
  }
} 