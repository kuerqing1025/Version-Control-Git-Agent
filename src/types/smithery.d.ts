declare module '@smithery/sdk' {
  export interface ServerConfig {
    contextProviders: Record<string, Function>;
    tools: Record<string, Function>;
  }

  export interface Server {
    listen(port: number, callback?: () => void): void;
  }

  export function createServer(config: ServerConfig): Promise<Server>;
} 