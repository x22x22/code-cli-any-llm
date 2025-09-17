import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import * as yaml from 'js-yaml';
import { GlobalConfigService } from '../config/global-config.service';
import type { ConfigValidationResult } from '../config/global-config.interface';

const GEMINI_AUTH_TYPE = 'gemini-api-key';

const GATEWAY_HEALTH_PATH = '/api/v1/health';
const DEFAULT_TIMEOUT = 20000;
const POLL_INTERVAL = 800;

export async function runGalCode(args: string[]): Promise<void> {
  const projectRoot = locateProjectRoot(__dirname);
  const configDir = path.join(os.homedir(), '.gemini-any-llm');
  const configFile = path.join(configDir, 'config.yaml');

  const configService = new GlobalConfigService();
  const configExists = fs.existsSync(configFile);
  let configResult = configService.loadGlobalConfig();

  if (shouldRunWizard(configExists, configResult)) {
    await runConfigWizard(configFile);
    configResult = configService.loadGlobalConfig();

    if (!configResult.isValid) {
      console.error('配置仍然无效，请检查 ~/.gemini-any-llm/config.yaml');
      process.exit(1);
    }
  }

  if (!configResult.config) {
    console.error('无法加载全局配置，请检查是否具有读写权限。');
    process.exit(1);
  }

  const gatewayHost = normalizeGatewayHost(configResult.config.gateway.host);
  const gatewayPort = configResult.config.gateway.port;
  const geminiApiKey = readGlobalApiKey(configFile);

  if (!geminiApiKey) {
    console.error('未能在 ~/.gemini-any-llm/config.yaml 中找到有效的 apikey');
    process.exit(1);
  }

  ensureGeminiSettings();

  if (!(await isGatewayHealthy(gatewayHost, gatewayPort))) {
    console.log('检测到网关未运行，正在后台启动服务...');
    ensureGatewayStarted(projectRoot);

    const ready = await waitForGatewayHealthy(gatewayHost, gatewayPort);
    if (!ready) {
      console.error('网关启动超时，请手动执行 pnpm run start:prod 后重试。');
      process.exit(1);
    }
  }

  await launchGeminiCLI(args, gatewayHost, gatewayPort, geminiApiKey);
}

function shouldRunWizard(
  configExists: boolean,
  result: ConfigValidationResult,
): boolean {
  if (!configExists) {
    return true;
  }

  const hasCriticalError = result.errors?.some((error) => {
    if (!error.required) {
      return false;
    }

    return error.field === 'openai.apiKey' || error.field === 'openai';
  });

  return !result.isValid && Boolean(hasCriticalError);
}

async function runConfigWizard(configFile: string): Promise<void> {
  ensureDir(path.dirname(configFile));

  let existingConfig: any = {};
  if (fs.existsSync(configFile)) {
    try {
      const content = fs.readFileSync(configFile, 'utf8');
      existingConfig = yaml.load(content) ?? {};
    } catch {
      console.warn('读取现有配置失败，将写入新配置。');
      existingConfig = {};
    }
  }

  if (!existingConfig.openai) {
    existingConfig.openai = {};
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('首次使用，请填写必要的 OpenAI 配置：');

  let baseURL = await ask(
    rl,
    'OpenAI Base URL (为空将使用默认值 https://open.bigmodel.cn/api/paas/v4)',
    existingConfig.openai.baseURL,
  );
  if (!baseURL) {
    baseURL = 'https://open.bigmodel.cn/api/paas/v4';
  }

  let model = await ask(
    rl,
    '默认模型 (为空将使用默认值 glm-4.5)',
    existingConfig.openai.model,
  );
  if (!model) {
    model = 'glm-4.5';
  }

  const apiKey = await askRequired(
    rl,
    'OpenAI API Key',
    existingConfig.openai.apiKey,
  );

  rl.close();

  existingConfig.openai.apiKey = apiKey;
  existingConfig.openai.baseURL = baseURL;
  existingConfig.openai.model = model;

  try {
    const yamlContent = yaml.dump(existingConfig, {
      indent: 2,
      lineWidth: 120,
    });
    fs.writeFileSync(configFile, yamlContent, { mode: 0o600 });

    console.log(`配置已写入 ${configFile}`);
  } catch (error) {
    console.error('写入配置失败:', error);
    throw error;
  }
}

function ask(
  rl: readline.Interface,
  prompt: string,
  defaultValue?: string,
): Promise<string> {
  return new Promise((resolve) => {
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    rl.question(`${prompt}${suffix}: `, (answer) => {
      const value = answer.trim();
      if (value) {
        resolve(value);
      } else if (defaultValue) {
        resolve(defaultValue);
      } else {
        resolve('');
      }
    });
  });
}

async function askRequired(
  rl: readline.Interface,
  prompt: string,
  defaultValue?: string,
): Promise<string> {
  while (true) {
    const value = await ask(rl, prompt, defaultValue);
    if (value) {
      return value;
    }

    console.log('该字段不能为空，请重新输入。');
  }
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }
}

function ensureGatewayStarted(projectRoot: string): void {
  ensureBuilt(projectRoot);

  const entry = path.join(projectRoot, 'dist', 'src', 'main.js');

  if (!fs.existsSync(entry)) {
    throw new Error('无法找到 dist/src/main.js，请检查是否构建成功。');
  }

  const child = spawn(process.execPath, [entry], {
    cwd: projectRoot,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'production',
    },
  });

  child.unref();
}

function ensureBuilt(projectRoot: string): void {
  const entry = path.join(projectRoot, 'dist', 'src', 'main.js');
  if (fs.existsSync(entry)) {
    return;
  }

  console.log('检测到 dist 目录缺失，正在执行 pnpm run build ...');
  const runners = buildCommandRunners(projectRoot);
  let lastError: Error | undefined;

  for (const runner of runners) {
    const result = spawnSync(runner.command, runner.args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: runner.env,
    });

    if (result.error) {
      const error = result.error as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        lastError = error;
        continue;
      }
      lastError = error;
      continue;
    }

    if (result.status === 0) {
      return;
    }

    lastError = new Error(
      `${runner.displayName} 以状态码 ${result.status ?? 'unknown'} 退出`,
    );
  }

  if (lastError) {
    throw new Error(
      `构建失败，已尝试: ${
        runners.map((runner) => runner.displayName).join(', ') || '无'
      }。详见上方输出。`,
    );
  }

  throw new Error('构建失败，未知原因。');
}

interface BuildRunner {
  command: string;
  args: string[];
  displayName: string;
  env?: NodeJS.ProcessEnv;
}

function buildCommandRunners(projectRoot: string): BuildRunner[] {
  const runners: BuildRunner[] = [];

  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    runners.push({
      command: process.execPath,
      args: [npmExecPath, 'run', 'build'],
      displayName: 'npm_execpath run build',
      env: {
        ...process.env,
        PNPM_SCRIPT_SRC_DIR: projectRoot,
      },
    });
  }

  runners.push(
    {
      command: 'pnpm',
      args: ['run', 'build'],
      displayName: 'pnpm run build',
    },
    {
      command: 'npm',
      args: ['run', 'build'],
      displayName: 'npm run build',
    },
    {
      command: 'yarn',
      args: ['build'],
      displayName: 'yarn build',
    },
  );

  return runners;
}

function locateProjectRoot(startDir: string): string {
  let current = startDir;
  const maxDepth = 6;

  for (let i = 0; i < maxDepth; i += 1) {
    const candidate = path.join(current, 'package.json');
    if (fs.existsSync(candidate)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return startDir;
}

async function waitForGatewayHealthy(
  host: string,
  port: number,
  timeout = DEFAULT_TIMEOUT,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isGatewayHealthy(host, port)) {
      return true;
    }
    await delay(POLL_INTERVAL);
  }
  return false;
}

function isGatewayHealthy(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(
      {
        host,
        port,
        path: GATEWAY_HEALTH_PATH,
        timeout: 1500,
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          resolve(false);
          return;
        }

        let rawData = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          rawData += chunk;
        });
        response.on('end', () => {
          try {
            const payload = JSON.parse(rawData);
            resolve(payload.status === 'healthy');
          } catch {
            resolve(false);
          }
        });
      },
    );

    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function launchGeminiCLI(
  args: string[],
  host: string,
  port: number,
  geminiApiKey: string,
): Promise<void> {
  const origin = `http://${host}:${port}`;
  const baseURL = new URL('/api', origin).toString();
  const child = spawn('gemini', args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      GOOGLE_GEMINI_BASE_URL: baseURL,
      GEMINI_API_KEY: geminiApiKey,
    },
  });

  await new Promise<void>((resolve, reject) => {
    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const error: NodeJS.ErrnoException & { exitCode?: number } = new Error(
          `gemini 命令以状态码 ${code ?? 'unknown'} 退出`,
        );
        error.exitCode = code ?? 1;
        reject(error);
      }
    });
  });
}

function ensureGeminiSettings(): void {
  const settingsDir = path.join(os.homedir(), '.gemini');
  const settingsFile = path.join(settingsDir, 'settings.json');

  ensureDir(settingsDir);

  if (!fs.existsSync(settingsFile)) {
    const content = `${JSON.stringify({ selectedAuthType: GEMINI_AUTH_TYPE }, null, 2)}\n`;
    fs.writeFileSync(settingsFile, content, { mode: 0o600 });
    return;
  }

  try {
    const raw = fs.readFileSync(settingsFile, 'utf8');
    const data = raw ? JSON.parse(raw) : {};

    if (data.selectedAuthType === GEMINI_AUTH_TYPE) {
      return;
    }

    data.selectedAuthType = GEMINI_AUTH_TYPE;
    const content = `${JSON.stringify(data, null, 2)}\n`;
    fs.writeFileSync(settingsFile, content);
  } catch {
    const content = `${JSON.stringify({ selectedAuthType: GEMINI_AUTH_TYPE }, null, 2)}\n`;
    fs.writeFileSync(settingsFile, content, { mode: 0o600 });
  }
}

function readGlobalApiKey(configFile: string): string {
  try {
    if (!fs.existsSync(configFile)) {
      return '';
    }

    const raw = fs.readFileSync(configFile, 'utf8');
    const data = yaml.load(raw) as { openai?: { apiKey?: string } } | undefined;
    const value = data?.openai?.apiKey;
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

function normalizeGatewayHost(host: string): string {
  if (!host) {
    return '127.0.0.1';
  }

  if (host === '0.0.0.0' || host === '::') {
    return '127.0.0.1';
  }

  return host;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
