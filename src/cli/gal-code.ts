import { spawn } from 'child_process';
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
const GATEWAY_PID_FILE = 'gateway.pid.json';
const STOP_TIMEOUT = 10000;
const STOP_POLL_INTERVAL = 250;

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

interface StopGatewayResult {
  outcome: 'stopped' | 'not_found' | 'already_stopped' | 'failed';
  pid?: number;
  error?: Error;
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

  const gatewayHost = normalizeGatewayHost(configResult.config.gateway.host);
  const gatewayPort = configResult.config.gateway.port;

  let geminiApiKey: string | undefined;
  if (requireApiKey) {
    geminiApiKey = readGlobalApiKey(configFile);
    if (!geminiApiKey) {
      console.error('未能在 ~/.gemini-any-llm/config.yaml 中找到有效的 apikey');
      process.exit(1);
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

export async function runGalStart(): Promise<void> {
  const context = await prepareGatewayContext();
  const { gatewayHost, gatewayPort } = context;

  const currentStatus = await fetchGatewayHealth(gatewayHost, gatewayPort);
  if (currentStatus.healthy) {
    console.log('网关已在运行。');
    outputGatewayStatus('当前状态', context, currentStatus);
    return;
  }

  const recordedPid = readGatewayPidInfo(context.configDir);
  if (recordedPid && isPidRunning(recordedPid.pid)) {
    console.log(
      `检测到历史网关进程 (PID ${recordedPid.pid}) 状态异常，准备重启...`,
    );
    const stopResult = await stopGatewayProcess(context);
    if (stopResult.outcome === 'failed') {
      console.error(
        `无法终止现有网关进程: ${stopResult.error?.message ?? '未知错误'}`,
      );
      process.exit(1);
    }
  }

  console.log('正在启动网关组件...');
  const pid = startGatewayProcess(context);
  if (pid && pid > 0) {
    console.log(`已启动网关进程 (PID ${pid})，等待健康检查...`);
  }

  const { ready, lastStatus } = await waitForGatewayHealthy(
    gatewayHost,
    gatewayPort,
  );

  if (!ready) {
    logGatewayFailure(lastStatus);
    console.error('网关未在预期时间内就绪，请检查部署状态后重试。');
    process.exit(1);
  }

  console.log(`网关已就绪，监听地址 http://${gatewayHost}:${gatewayPort}`);
  if (lastStatus) {
    outputGatewayStatus('启动结果', context, lastStatus);
  }
}

export async function runGalStop(): Promise<void> {
  const context = await prepareGatewayContext({
    allowWizard: false,
    requireApiKey: false,
    ensureGeminiSettings: false,
  });

  const result = await stopGatewayProcess(context);

  switch (result.outcome) {
    case 'stopped':
      console.log(`已停止网关进程 (PID ${result.pid}).`);
      break;
    case 'already_stopped':
      console.log(`记录的网关进程 (PID ${result.pid}) 已退出。`);
      break;
    case 'not_found':
      console.log('未找到网关进程记录，无需执行停止操作。');
      break;
    case 'failed':
    default:
      console.error(`停止网关进程失败: ${result.error?.message ?? '未知错误'}`);
      process.exit(1);
  }
}

export async function runGalStatus(): Promise<void> {
  const context = await prepareGatewayContext({
    allowWizard: false,
    requireApiKey: false,
    ensureGeminiSettings: false,
  });

  const status = await fetchGatewayHealth(
    context.gatewayHost,
    context.gatewayPort,
  );

  outputGatewayStatus('网关状态', context, status);
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

export async function runConfigWizard(configFile: string): Promise<void> {
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

async function stopGatewayProcess(
  context: GatewayContext,
  signal: NodeJS.Signals | number = 'SIGTERM',
): Promise<StopGatewayResult> {
  const pidInfo = readGatewayPidInfo(context.configDir);
  if (!pidInfo || !pidInfo.pid || pidInfo.pid <= 0) {
    return { outcome: 'not_found' };
  }

  const { pid } = pidInfo;

  if (!isPidRunning(pid)) {
    removePidFile(context.configDir);
    return { outcome: 'already_stopped', pid };
  }

  try {
    process.kill(pid, signal);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ESRCH') {
      removePidFile(context.configDir);
      return { outcome: 'already_stopped', pid };
    }
    return { outcome: 'failed', pid, error: err };
  }

  const exited = await waitForProcessExit(pid, STOP_TIMEOUT);
  if (!exited) {
    return {
      outcome: 'failed',
      pid,
      error: new Error('网关进程在超时时间内未退出'),
    };
  }

  removePidFile(context.configDir);
  return { outcome: 'stopped', pid };
}

function outputGatewayStatus(
  title: string,
  context: GatewayContext,
  status: GatewayHealthStatus,
): void {
  const healthUrl = `http://${context.gatewayHost}:${context.gatewayPort}${GATEWAY_HEALTH_PATH}`;
  const pidInfo = readGatewayPidInfo(context.configDir);
  const runningPid =
    pidInfo && isPidRunning(pidInfo.pid) ? pidInfo.pid : undefined;

  console.log(`${title}: ${status.healthy ? '健康' : '异常'}`);
  console.log(`健康检查: ${healthUrl}`);

  if (runningPid) {
    console.log(`进程 PID: ${runningPid} (运行中)`);
  } else if (pidInfo?.pid) {
    console.log(`进程 PID: ${pidInfo.pid} (已退出)`);
  } else {
    console.log('进程 PID: 未记录');
  }

  const details = formatStatusDetails(status);
  for (const line of details) {
    console.log(line);
  }
}

function formatStatusDetails(status: GatewayHealthStatus): string[] {
  const lines: string[] = [];

  if (status.message) {
    lines.push(`状态消息: ${status.message}`);
  }

  if (status.providerError) {
    lines.push(`上游信息: ${status.providerError}`);
  }

  if (status.statusCode && status.statusCode !== 200) {
    lines.push(`HTTP 状态码: ${status.statusCode}`);
  }

  const extraErrors = collectErrorMessages(status.payload?.errors);
  if (extraErrors.length > 0) {
    lines.push(`错误详情: ${extraErrors.join('; ')}`);
  }

  const provider = status.payload?.provider;
  if (isRecord(provider)) {
    lines.push(`提供方响应: ${JSON.stringify(provider)}`);
  }

  if (!status.healthy && status.rawBody) {
    lines.push(`原始响应: ${status.rawBody}`);
  }

  return lines;
}

function getPidFilePath(configDir: string): string {
  return path.join(configDir, GATEWAY_PID_FILE);
}

function readGatewayPidInfo(configDir: string): GatewayPidInfo | undefined {
  const pidFile = getPidFilePath(configDir);
  if (!fs.existsSync(pidFile)) {
    return undefined;
  }

  try {
    const raw = fs.readFileSync(pidFile, 'utf8');
    const parsed = raw ? (JSON.parse(raw) as GatewayPidInfo) : undefined;
    if (parsed && typeof parsed.pid === 'number' && parsed.pid > 0) {
      return parsed;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function writeGatewayPidInfo(configDir: string, info: GatewayPidInfo): void {
  const pidFile = getPidFilePath(configDir);
  ensureDir(configDir);
  const content = `${JSON.stringify(info, null, 2)}\n`;
  fs.writeFileSync(pidFile, content, { mode: 0o600 });
}

function removePidFile(configDir: string): void {
  const pidFile = getPidFilePath(configDir);
  if (fs.existsSync(pidFile)) {
    try {
      fs.unlinkSync(pidFile);
    } catch {
      // ignore unlink errors
    }
  }
}

function isPidRunning(pid: number): boolean {
  if (!pid || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EPERM') {
      return true;
    }
    return false;
  }
}

async function waitForProcessExit(
  pid: number,
  timeout: number,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (!isPidRunning(pid)) {
      return true;
    }
    await delay(STOP_POLL_INTERVAL);
  }

  return !isPidRunning(pid);
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
