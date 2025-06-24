import { readFile } from 'fs/promises';
import { GitAnalysis } from '../types/git';

export class CodeAnalysisService {
  async analyzeFiles(files: string[]): Promise<GitAnalysis> {
    const analysis: GitAnalysis = {
      impactScore: 0,
      complexityScore: 0,
      securityIssues: [],
      performanceImpact: {
        score: 0,
        details: [],
      },
    };

    for (const file of files) {
      try {
        const content = await readFile(file, 'utf-8');
        
        // Calculate impact score based on file size and changes
        analysis.impactScore += this.calculateImpactScore(content);
        
        // Calculate complexity score
        analysis.complexityScore += this.calculateComplexityScore(content);
        
        // Check for security issues
        const securityIssues = this.analyzeSecurityIssues(content, file);
        analysis.securityIssues.push(...securityIssues);
        
        // Analyze performance impact
        const performanceIssues = this.analyzePerformance(content);
        analysis.performanceImpact.details.push(...performanceIssues);
        analysis.performanceImpact.score += performanceIssues.length;
      } catch (error) {
        console.error(`Error analyzing file ${file}:`, error);
      }
    }

    // Normalize scores
    analysis.impactScore = Math.min(100, analysis.impactScore);
    analysis.complexityScore = Math.min(100, analysis.complexityScore);
    analysis.performanceImpact.score = Math.min(100, analysis.performanceImpact.score);

    return analysis;
  }

  private calculateImpactScore(content: string): number {
    const lines = content.split('\n').length;
    const changes = content.split(/[{}();]/).length;
    return Math.floor((lines * 0.3 + changes * 0.7) / 10);
  }

  private calculateComplexityScore(content: string): number {
    const cyclomaticComplexity = (content.match(/if|while|for|&&|\|\||case/g) || []).length;
    const nestingDepth = Math.max(...content.split('\n').map(line => (line.match(/\{/g) || []).length));
    return Math.floor((cyclomaticComplexity * 0.6 + nestingDepth * 0.4) * 5);
  }

  private analyzeSecurityIssues(content: string, file: string): Array<{ severity: 'low' | 'medium' | 'high'; description: string; location: string }> {
    const issues: Array<{ severity: 'low' | 'medium' | 'high'; description: string; location: string }> = [];

    // Check for common security issues
    if (content.includes('eval(')) {
      issues.push({
        severity: 'high',
        description: 'Use of eval() can lead to code injection vulnerabilities',
        location: file,
      });
    }

    if (content.match(/password|secret|key/i) && content.match(/"[^"]*"/)) {
      issues.push({
        severity: 'high',
        description: 'Possible hardcoded credentials detected',
        location: file,
      });
    }

    if (content.includes('innerHTML')) {
      issues.push({
        severity: 'medium',
        description: 'Use of innerHTML can lead to XSS vulnerabilities',
        location: file,
      });
    }

    return issues;
  }

  private analyzePerformance(content: string): string[] {
    const issues: string[] = [];

    // Check for performance anti-patterns
    if (content.match(/\.forEach.*\.map/)) {
      issues.push('Nested array operations detected - consider combining operations');
    }

    if (content.match(/document\.querySelector.*querySelector/)) {
      issues.push('Multiple DOM queries - consider caching selectors');
    }

    if (content.match(/console\.(log|debug|info)/)) {
      issues.push('Console statements found - remove in production');
    }

    const largeArrayOperations = content.match(/\[\s*\.\.\..*\]/g);
    if (largeArrayOperations && largeArrayOperations.length > 2) {
      issues.push('Multiple spread operations detected - may impact performance');
    }

    return issues;
  }
} 