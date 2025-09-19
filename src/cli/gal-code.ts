import { Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import * as yaml from 'js-yaml';
import { GlobalConfigService } from '../config/global-config.service';
import type {
  ConfigValidationResult,
  GlobalConfig,
  OpenAIConfig,
  CodexConfig,
  CodexReasoningConfig,
} from '../config/global-config.interface';
import { ChatGPTAuthManager } from '../providers/codex/chatgpt-auth.manager';

const GEMINI_AUTH_TYPE = 'gemini-api-key';

const GATEWAY_HEALTH_PATH = '/api/v1/health';
const DEFAULT_TIMEOUT = 20000;
const POLL_INTERVAL = 800;
const GATEWAY_PID_FILE = 'gateway.pid.json';

interface GatewayContext {
  projectRoot: string;
  configDir: string;
  configFile: string;
  gatewayHost: string;
  gatewayPort: number;
  geminiApiKey?: string;
}

interface GatewayContextOptions {
  allowWizard?: boolean;
  requireApiKey?: boolean;
  ensureGeminiSettings?: boolean;
}

interface GatewayPidInfo {
  pid: number;
  startedAt?: number;
  entry?: string;
}

async function prepareGatewayContext(
  options: GatewayContextOptions = {},
): Promise<GatewayContext> {
  const {
    allowWizard = true,
    requireApiKey = true,
    ensureGeminiSettings: ensureGemini = true,
  } = options;

  const projectRoot = locateProjectRoot(__dirname);
  const configDir = path.join(os.homedir(), '.gemini-any-llm');
  const configFile = path.join(configDir, 'config.yaml');

  const configService = new GlobalConfigService();
  const configExists = fs.existsSync(configFile);
  let configResult = configService.loadGlobalConfig();

  if (allowWizard && shouldRunWizard(configExists, configResult)) {
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

  const config = configResult.config;
  const gatewayHost = normalizeGatewayHost(config.gateway.host);
  const gatewayPort = config.gateway.port;

  const isChatGPTMode = isCodexChatGPTMode(config);

  let geminiApiKey: string | undefined;
  if (requireApiKey) {
    if (isChatGPTMode) {
      try {
        await ensureChatGPTAuth('GalCodeChatGPT');
        geminiApiKey = 'chatgpt-mode';
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`初始化 ChatGPT 凭据失败: ${reason}`);
        console.error('请重新运行 `pnpm run gal auth` 并完成浏览器登录。');
        process.exit(1);
      }
    } else {
      geminiApiKey = readGlobalApiKey(configFile);
      if (!geminiApiKey) {
        console.error(
          '未能在 ~/.gemini-any-llm/config.yaml 中找到有效的 apikey',
        );
        process.exit(1);
      }
    }
  }

  if (ensureGemini) {
    ensureGeminiSettings();
  }

  return {
    projectRoot,
    configDir,
    configFile,
    gatewayHost,
    gatewayPort,
    geminiApiKey,
  };
}

export async function runGalCode(args: string[]): Promise<void> {
  const context = await prepareGatewayContext();
  const { gatewayHost, gatewayPort, geminiApiKey } = context;

  if (!(await isGatewayHealthy(gatewayHost, gatewayPort))) {
    console.log('检测到网关未运行，正在后台启动服务...');
    startGatewayProcess(context);

    const { ready, lastStatus } = await waitForGatewayHealthy(
      gatewayHost,
      gatewayPort,
    );
    if (!ready) {
      logGatewayFailure(lastStatus);
      console.error('网关未在预期时间内就绪，请检查部署状态后重试。');
      process.exit(1);
    }
  }

  await launchGeminiCLI(args, gatewayHost, gatewayPort, geminiApiKey ?? '');
}

function shouldRunWizard(
  configExists: boolean,
  result: ConfigValidationResult,
): boolean {
  if (!configExists) {
    return true;
  }

  if (!result.isValid || !result.config) {
    return true;
  }

  const provider = result.config.aiProvider ?? 'openai';
  if (provider === 'codex') {
    const codexConfig = result.config.codex;
    if (!codexConfig) {
      return true;
    }

    if ((codexConfig.authMode ?? 'ApiKey') === 'ChatGPT') {
      return false;
    }

    if (!codexConfig.apiKey) {
      return true;
    }
  } else {
    const openaiConfig = result.config.openai;
    if (!openaiConfig || !openaiConfig.apiKey) {
      return true;
    }
  }

  const providerConfig =
    provider === 'codex' ? result.config.codex : result.config.openai;

  if (!providerConfig || !(providerConfig as { apiKey?: string }).apiKey) {
    return true;
  }

  return false;
}

export async function runConfigWizard(configFile: string): Promise<void> {
  ensureDir(path.dirname(configFile));

  let existingConfig: Partial<GlobalConfig> = {};
  if (fs.existsSync(configFile)) {
    try {
      const content = fs.readFileSync(configFile, 'utf8');
      const parsed = yaml.load(content);
      if (parsed && typeof parsed === 'object') {
        existingConfig = parsed as Partial<GlobalConfig>;
      }
    } catch {
      console.warn('读取现有配置失败，将写入新配置。');
      existingConfig = {};
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const aiProviderDefault = existingConfig.aiProvider || 'openai';
  console.log('请选择要配置的 AI Provider：');
  const aiProvider = await askChoice(
    rl,
    'AI Provider',
    ['openai', 'codex'] as const,
    aiProviderDefault,
  );

  existingConfig.aiProvider = aiProvider;

  if (aiProvider === 'openai') {
    console.log('\n请填写 OpenAI 配置：');
    existingConfig.openai = await configureOpenAI(
      rl,
      existingConfig.openai ?? {},
    );
  } else {
    console.log('\n请填写 Codex 配置：');
    existingConfig.codex = await configureCodex(rl, existingConfig.codex ?? {});
  }

  rl.close();

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

async function configureOpenAI(
  rl: readline.Interface,
  existing: Partial<OpenAIConfig>,
): Promise<OpenAIConfig> {
  const baseURL = await ask(
    rl,
    'OpenAI Base URL (默认 https://open.bigmodel.cn/api/paas/v4)',
    existing.baseURL ?? 'https://open.bigmodel.cn/api/paas/v4',
  );

  const model = await ask(
    rl,
    '默认模型 (默认 glm-4.5)',
    existing.model ?? 'glm-4.5',
  );

  const apiKey = await askRequired(rl, 'OpenAI API Key', existing.apiKey);

  const timeout = await askNumber(
    rl,
    '请求超时时间 (ms, 默认 30000)',
    existing.timeout ?? 30000,
  );

  return {
    apiKey,
    baseURL,
    model,
    timeout,
    extraBody: existing.extraBody,
  };
}

async function configureCodex(
  rl: readline.Interface,
  existing: Partial<CodexConfig>,
): Promise<CodexConfig> {
  const authModeChoice = await askChoice(
    rl,
    '认证模式 (ApiKey / ChatGPT)',
    ['apikey', 'chatgpt'] as const,
    existing.authMode === 'ChatGPT' ? 'chatgpt' : 'apikey',
  );
  const authMode = authModeChoice === 'chatgpt' ? 'ChatGPT' : 'ApiKey';

  const baseURL = await ask(
    rl,
    'Codex Base URL (默认 https://chatgpt.com/backend-api/codex)',
    existing.baseURL ?? 'https://chatgpt.com/backend-api/codex',
  );

  const model = await ask(
    rl,
    '默认模型 (默认 gpt-5-codex)',
    existing.model ?? 'gpt-5-codex',
  );

  let apiKey: string | undefined = existing.apiKey;
  if (authMode === 'ApiKey') {
    apiKey = await askRequired(rl, 'Codex API Key', existing.apiKey);
  } else {
    console.log('已选择 ChatGPT 模式，将在首次请求时提示登录。');
    apiKey = undefined;
  }

  const timeout = await askNumber(
    rl,
    '请求超时时间 (ms, 默认 60000)',
    existing.timeout ?? 60000,
  );

  const textVerbosity = await askChoice(
    rl,
    '输出详略程度 (verbosity)',
    ['low', 'medium', 'high'] as const,
    existing.textVerbosity ?? 'low',
  );

  const reasoningEffort = await askChoice(
    rl,
    '推理模式 (reasoning.effort)',
    ['minimal', 'low', 'medium', 'high'] as const,
    typeof existing.reasoning?.effort === 'string'
      ? (existing.reasoning?.effort.toLowerCase() as
          | 'minimal'
          | 'low'
          | 'medium'
          | 'high')
      : 'minimal',
  );

  const reasoningSummary = await askChoice(
    rl,
    '推理总结模式 (reasoning.summary)',
    ['concise', 'detailed', 'auto'] as const,
    typeof existing.reasoning?.summary === 'string'
      ? (existing.reasoning?.summary.toLowerCase() as
          | 'concise'
          | 'detailed'
          | 'auto')
      : 'auto',
  );

  const reasoning: CodexReasoningConfig = {
    effort: reasoningEffort,
    summary: reasoningSummary,
  };

  return {
    apiKey,
    baseURL,
    model,
    timeout,
    reasoning,
    textVerbosity,
    authMode,
  };
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

async function askChoice<T extends string>(
  rl: readline.Interface,
  prompt: string,
  options: readonly T[],
  defaultValue: T,
): Promise<T> {
  const displayPrompt = `${prompt} [${options.join('/')}]`;
  while (true) {
    const answer = await ask(rl, displayPrompt, defaultValue);
    const normalized = answer.trim().toLowerCase();
    const match = options.find((option) => option === normalized);
    if (match) {
      return match;
    }
    console.log(`无效选项，请输入 ${options.join('/')}`);
  }
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

async function askNumber(
  rl: readline.Interface,
  prompt: string,
  defaultValue: number,
): Promise<number> {
  while (true) {
    const answer = await ask(rl, prompt, defaultValue.toString());
    const trimmed = answer.trim();
    const parsed = Number(trimmed);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
    if (trimmed === defaultValue.toString()) {
      return defaultValue;
    }
    console.log('请输入有效的正整数。');
  }
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }
}

function startGatewayProcess(context: GatewayContext): number | undefined {
  const entry = path.join(context.projectRoot, 'dist', 'main.js');

  if (!fs.existsSync(entry)) {
    console.error('未找到 dist/main.js，请确认服务端已完成部署构建后再试。');
    process.exit(1);
  }

  ensureDir(context.configDir);

  const child = spawn(process.execPath, [entry], {
    cwd: context.projectRoot,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'production',
    },
  });

  const pid = child.pid;
  if (pid && pid > 0) {
    writeGatewayPidInfo(context.configDir, {
      pid,
      startedAt: Date.now(),
      entry,
    });
  }

  child.unref();
  return pid;
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

interface GatewayHealthStatus {
  healthy: boolean;
  statusCode?: number;
  message?: string;
  providerError?: string;
  rawBody?: string;
  payload?: HealthPayload;
}

interface HealthPayload {
  status?: unknown;
  message?: unknown;
  provider?: Record<string, unknown>;
  error?: unknown;
  errors?: unknown;
  [key: string]: unknown;
}

interface WaitForGatewayResult {
  ready: boolean;
  lastStatus?: GatewayHealthStatus;
}

function getPidFilePath(configDir: string): string {
  return path.join(configDir, GATEWAY_PID_FILE);
}

function writeGatewayPidInfo(configDir: string, info: GatewayPidInfo): void {
  const pidFile = getPidFilePath(configDir);
  ensureDir(configDir);
  const content = `${JSON.stringify(info, null, 2)}\n`;
  fs.writeFileSync(pidFile, content, { mode: 0o600 });
}

async function waitForGatewayHealthy(
  host: string,
  port: number,
  timeout = DEFAULT_TIMEOUT,
): Promise<WaitForGatewayResult> {
  const start = Date.now();
  let lastStatus: GatewayHealthStatus | undefined;

  while (Date.now() - start < timeout) {
    const status = await fetchGatewayHealth(host, port);
    lastStatus = status;
    if (status.healthy) {
      return { ready: true, lastStatus: status };
    }
    await delay(POLL_INTERVAL);
  }

  return { ready: false, lastStatus };
}

async function isGatewayHealthy(host: string, port: number): Promise<boolean> {
  const status = await fetchGatewayHealth(host, port);
  return status.healthy;
}

function fetchGatewayHealth(
  host: string,
  port: number,
): Promise<GatewayHealthStatus> {
  return new Promise((resolve) => {
    const request = http.get(
      {
        host,
        port,
        path: GATEWAY_HEALTH_PATH,
        timeout: 1500,
      },
      (response) => {
        const { statusCode } = response;
        let rawData = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          rawData += chunk;
        });
        response.on('end', () => {
          const parsed = parseHealthPayload(rawData);
          const message = extractHealthMessage(parsed);
          const providerError = extractProviderError(parsed);
          const isHealthyPayload =
            statusCode === 200 &&
            parsed !== undefined &&
            isNonEmptyString(parsed.status) &&
            parsed.status.trim() === 'healthy';

          if (isHealthyPayload) {
            resolve({
              healthy: true,
              statusCode,
              message: message,
              providerError,
              payload: parsed,
            });
            return;
          }

          const trimmed = rawData.trim();

          resolve({
            healthy: false,
            statusCode,
            message,
            providerError,
            rawBody: trimmed || undefined,
            payload: parsed,
          });
        });
      },
    );

    request.on('error', (error: Error) => {
      resolve({ healthy: false, message: error.message });
    });
    request.on('timeout', () => {
      request.destroy();
      resolve({ healthy: false, message: '健康检查请求超时' });
    });
  });
}

function parseHealthPayload(raw: string): HealthPayload | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const value = JSON.parse(raw);
    if (isRecord(value)) {
      return value as HealthPayload;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function extractHealthMessage(payload?: HealthPayload): string | undefined {
  if (!payload) {
    return undefined;
  }

  if (isNonEmptyString(payload.message)) {
    return payload.message.trim();
  }

  if (isNonEmptyString(payload.status)) {
    const status = payload.status.trim();
    if (status && status !== 'healthy') {
      return status;
    }
  }

  return undefined;
}

function extractProviderError(payload?: HealthPayload): string | undefined {
  if (!payload) {
    return undefined;
  }

  const provider = payload.provider;
  if (isRecord(provider)) {
    const providerRecord = provider;
    const providerNameValue = providerRecord['provider'];
    const providerErrorValue = providerRecord['error'];
    if (isNonEmptyString(providerErrorValue)) {
      const providerName = isNonEmptyString(providerNameValue)
        ? providerNameValue.trim()
        : undefined;
      return providerName
        ? `${providerName}: ${providerErrorValue.trim()}`
        : providerErrorValue.trim();
    }
  }

  const errorCandidates = [payload.error, payload.errors];
  for (const candidate of errorCandidates) {
    const text = extractErrorText(candidate);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function collectErrorMessages(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (isNonEmptyString(item) ? item.trim() : undefined))
      .filter((item): item is string => Boolean(item));
  }

  if (isNonEmptyString(value)) {
    return [value.trim()];
  }

  return [];
}

function extractErrorText(value: unknown): string | undefined {
  if (isNonEmptyString(value)) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const messages = value
      .map((item) => (isNonEmptyString(item) ? item.trim() : undefined))
      .filter((item): item is string => Boolean(item));
    if (messages.length > 0) {
      return messages.join('; ');
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function logGatewayFailure(status?: GatewayHealthStatus): void {
  if (!status) {
    console.error('网关健康检查失败，未获取到返回信息。');
    return;
  }

  if (status.message) {
    console.error(`网关返回信息: ${status.message}`);
  } else if (status.statusCode) {
    console.error(`网关健康检查失败，HTTP 状态码 ${status.statusCode}`);
  } else {
    console.error('网关健康检查失败，但未收到额外信息。');
  }

  const providerError = status.providerError;
  if (providerError && providerError !== status.message) {
    console.error(`上游错误信息: ${providerError}`);
  }

  const extraErrors = collectErrorMessages(status.payload?.errors);
  if (extraErrors.length > 0) {
    console.error(`网关错误列表: ${extraErrors.join('; ')}`);
  }

  if (status.rawBody && !status.message && !providerError) {
    console.error(`网关响应内容: ${status.rawBody}`);
  }
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

export function ensureGeminiSettings(): void {
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
    const data = yaml.load(raw) as Partial<GlobalConfig> | undefined;
    const provider = data?.aiProvider ?? 'openai';
    if (
      provider === 'codex' &&
      (data?.codex?.authMode ?? 'ApiKey') === 'ChatGPT'
    ) {
      return 'chatgpt-mode';
    }

    const value =
      provider === 'codex' ? data?.codex?.apiKey : data?.openai?.apiKey;
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

function isCodexChatGPTMode(config: GlobalConfig): boolean {
  if ((config.aiProvider ?? 'openai') !== 'codex') {
    return false;
  }
  return (config.codex?.authMode ?? 'ApiKey') === 'ChatGPT';
}

async function ensureChatGPTAuth(loggerLabel: string): Promise<void> {
  const manager = new ChatGPTAuthManager(new Logger(loggerLabel));
  await manager.getAuthHeaders();
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
