import { readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

interface ServerConfig {
  port: number;
  env: {
    NODE_ENV: string;
  };
}

interface PlaygroundConfig {
  enabled: boolean;
  title: string;
  description: string;
  examples: Array<{
    name: string;
    description: string;
    code: string;
  }>;
  demo_repository: {
    url: string;
    branch: string;
    read_only: boolean;
  };
}

interface Config {
  server: ServerConfig;
  playground: PlaygroundConfig;
}

const configPath = join(__dirname, '../smithery.yaml');
const configFile = readFileSync(configPath, 'utf8');
export const config = yaml.load(configFile) as Config; 