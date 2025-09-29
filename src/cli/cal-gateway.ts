import { Logger } from '@nestjs/common';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import { createRequire } from 'node:module';
import * as yaml from 'js-yaml';
import { GlobalConfigService } from '../config/global-config.service';
import type {
  ConfigValidationResult,
  GlobalConfig,
} from '../config/global-config.interface';
import { ChatGPTAuthManager } from '../providers/codex/chatgpt-auth.manager';

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

interface ProcessInfo {
  pid: number;
  source: 'pidfile' | 'port' | 'process_search';
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
  const configDir = path.join(os.homedir(), '.code-cli-any-llm');
  const configFile = path.join(configDir, 'config.yaml');

  const configService = new GlobalConfigService();
  const configExists = fs.existsSync(configFile);
  let configResult = configService.loadGlobalConfig();

  if (allowWizard && shouldRunWizard(configExists, configResult)) {
    await runConfigWizard(configFile);
    configResult = configService.loadGlobalConfig();

    if (!configResult.isValid) {
      console.error(
        'Configuration is still invalid. Check ~/.code-cli-any-llm/config.yaml.',
      );
      process.exit(1);
    }
  }

  if (!configResult.config) {
    console.error(
      'Unable to load the global configuration. Verify read/write permissions.',
    );
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
        await ensureChatGPTAuth('GalGatewayChatGPT');
        geminiApiKey = 'chatgpt-mode';
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`Failed to initialize ChatGPT credentials: ${reason}`);
        console.error(
          'Run `pnpm run cal auth` again and complete the browser sign-in.',
        );
        process.exit(1);
      }
    } else {
      geminiApiKey = readGlobalApiKey(configFile);
      if (!geminiApiKey) {
        console.error(
          'No valid API key found in ~/.code-cli-any-llm/config.yaml.',
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

export async function runGalStart(): Promise<void> {
  const context = await prepareGatewayContext();
  const { gatewayHost, gatewayPort } = context;

  const currentStatus = await fetchGatewayHealth(gatewayHost, gatewayPort);
  if (currentStatus.healthy) {
    console.log('Gateway is already running.');
    outputGatewayStatus('Current status', context, currentStatus);
    return;
  }

  const recordedPid = readGatewayPidInfo(context.configDir);
  if (recordedPid && isPidRunning(recordedPid.pid)) {
    console.log(
      `Detected a previous gateway process (PID ${recordedPid.pid}) in an unhealthy state. Preparing to restart...`,
    );
    const stopResult = await stopGatewayProcess(context);
    if (stopResult.outcome === 'failed') {
      console.error(
        `Unable to terminate the existing gateway process: ${stopResult.error?.message ?? 'unknown error'}`,
      );
      process.exit(1);
    }
  }

  console.log('Starting gateway components...');
  const pid = startGatewayProcess(context);
  if (pid && pid > 0) {
    console.log(
      `Gateway process started (PID ${pid}); waiting for health check...`,
    );
  }

  const { ready, lastStatus } = await waitForGatewayHealthy(
    gatewayHost,
    gatewayPort,
  );

  if (!ready) {
    logGatewayFailure(lastStatus);
    console.error(
      'The gateway did not become ready in time. Verify the deployment status and try again.',
    );
    process.exit(1);
  }

  console.log(
    `Gateway is ready and listening at http://${gatewayHost}:${gatewayPort}`,
  );
  if (lastStatus) {
    outputGatewayStatus('Startup result', context, lastStatus);
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
      console.log(`Gateway process stopped (PID ${result.pid}).`);
      break;
    case 'already_stopped':
      console.log(
        `Recorded gateway process (PID ${result.pid}) has already exited.`,
      );
      break;
    case 'not_found':
      console.log('No gateway process record found; nothing to stop.');
      break;
    case 'failed':
    default:
      console.error(
        `Failed to stop the gateway process: ${result.error?.message ?? 'unknown error'}`,
      );
      process.exit(1);
  }
}

export async function runGalRestart(): Promise<void> {
  console.log('Restarting the gateway...');

  // Stop the gateway first
  const stopContext = await prepareGatewayContext({
    allowWizard: false,
    requireApiKey: false,
    ensureGeminiSettings: false,
  });

  const stopResult = await stopGatewayProcess(stopContext);

  switch (stopResult.outcome) {
    case 'stopped':
      console.log(`Gateway process stopped (PID ${stopResult.pid}).`);
      break;
    case 'already_stopped':
      console.log(
        `Recorded gateway process (PID ${stopResult.pid}) has already exited.`,
      );
      break;
    case 'not_found':
      console.log(
        'No gateway process record found; scanning ports to kill lingering processes...',
      );
      await forceKillProcesses({
        usePortFallback: true,
        silent: true,
      });
      break;
    case 'failed':
      console.error(
        `Failed to stop the gateway process: ${stopResult.error?.message ?? 'unknown error'}`,
      );
      console.log('Attempting to start a new gateway process regardless...');
      break;
  }

  // Brief pause to ensure the process fully stops
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Then start the gateway
  console.log('Starting gateway...');
  const startContext = await prepareGatewayContext();
  const { gatewayHost, gatewayPort } = startContext;

  // Check if the gateway is already running (stop may have failed)
  const currentStatus = await fetchGatewayHealth(gatewayHost, gatewayPort);
  if (currentStatus.healthy) {
    console.log('Gateway is already running.');
    outputGatewayStatus('Restart result', startContext, currentStatus);
    return;
  }

  // Start the gateway process
  console.log('Starting gateway components...');
  const pid = startGatewayProcess(startContext);
  if (pid && pid > 0) {
    console.log(
      `Gateway process started (PID ${pid}); waiting for health check...`,
    );
  }

  // Wait for the gateway to become healthy
  const { ready, lastStatus } = await waitForGatewayHealthy(
    gatewayHost,
    gatewayPort,
  );

  if (!ready) {
    console.error(
      'The gateway did not become ready in time. Verify the deployment status and try again.',
    );
    process.exit(1);
  }

  console.log(
    `Gateway is ready and listening at http://${gatewayHost}:${gatewayPort}`,
  );
  if (lastStatus) {
    outputGatewayStatus('Restart result', startContext, lastStatus);
  }

  console.log('Gateway restart complete.');
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

  outputGatewayStatus('Gateway status', context, status);
}

/**
 * Force kill utility for zombie processes
 * Migrated from cal-kill.ts
 */
export async function runGalKill(): Promise<void> {
  await forceKillProcesses();
}

async function forceKillProcesses(
  options: { usePortFallback?: boolean; silent?: boolean } = {},
): Promise<void> {
  const { usePortFallback = true, silent = false } = options;

  if (!silent) {
    console.log('Searching for and terminating zombie processes...');
  }

  const projectRoot = process.cwd();
  const configService = new GlobalConfigService();
  const configResult = configService.loadGlobalConfig();

  let gatewayPort = 23062;
  if (configResult.isValid && configResult.config) {
    gatewayPort = configResult.config.gateway.port;
    if (!silent) {
      console.log(`Gateway port read from configuration: ${gatewayPort}`);
    }
  } else if (!silent) {
    console.log(`Configuration invalid; using default port: ${gatewayPort}`);
  }

  const processesToKill: ProcessInfo[] = [];
  const pidFile = path.join(projectRoot, '.development.pid');

  try {
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (!Number.isNaN(pid) && pid > 0) {
        processesToKill.push({ pid, source: 'pidfile' });
        if (!silent) {
          console.log(`Process discovered from PID file: ${pid}`);
        }
      }
    }
  } catch (error) {
    if (!silent) {
      console.error(
        'Failed to read PID file:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (processesToKill.length === 0 && usePortFallback) {
    try {
      const lsofOutput = execSync(`lsof -ti:${gatewayPort}`, {
        encoding: 'utf8',
        timeout: 5000,
      })
        .trim()
        .split('\n')
        .filter(Boolean);
      if (lsofOutput.length > 0) {
        const pid = parseInt(lsofOutput[0], 10);
        if (!Number.isNaN(pid) && pid > 0) {
          processesToKill.push({ pid, source: 'port' });
          if (!silent) {
            console.log(`Process discovered on port ${gatewayPort}: ${pid}`);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (processesToKill.length === 0) {
    try {
      const psOutput = execSync(
        'ps aux | grep "node.*dist/main.js" | grep -v grep',
        {
          encoding: 'utf8',
          timeout: 5000,
        },
      )
        .trim()
        .split('\n')
        .filter(Boolean);

      for (const line of psOutput) {
        const match = line.match(/\s+(\d+)\s+/);
        if (match) {
          const pid = parseInt(match[1], 10);
          if (!Number.isNaN(pid) && pid > 0) {
            processesToKill.push({ pid, source: 'process_search' });
            if (!silent) {
              console.log(`Process discovered via search: ${pid}`);
            }
            break;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (processesToKill.length > 0) {
    for (const processInfo of processesToKill) {
      await killProcess(processInfo.pid);
    }

    if (fs.existsSync(pidFile)) {
      try {
        fs.unlinkSync(pidFile);
        if (!silent) {
          console.log('PID file removed');
        }
      } catch (error) {
        if (!silent) {
          console.error(
            'Failed to remove PID file:',
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }
  } else if (!silent) {
    console.log('No running development processes found.');
  }

  checkHangingProcesses();
}

/**
 * Kill a process with graceful shutdown attempt first
 */
async function killProcess(pid: number): Promise<void> {
  try {
    // Try graceful shutdown first
    console.log(`Attempting graceful shutdown of process ${pid}...`);
    process.kill(pid, 'SIGTERM');

    // Wait for graceful shutdown with timeout
    const gracefulTimeout = 5000; // 5 seconds

    return new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        try {
          // Check if process is still running
          process.kill(pid, 0); // This throws if process doesn't exist
          console.log(
            `Process ${pid} is still running; forcing termination...`,
          );
          process.kill(pid, 'SIGKILL');
          console.log(`Process ${pid} terminated forcibly.`);
        } catch {
          console.log(`Process ${pid} has already exited.`);
        }
        resolve();
      }, gracefulTimeout);

      // Set up a check to see if process terminates before timeout
      const checkInterval = setInterval(() => {
        try {
          process.kill(pid, 0);
        } catch {
          // Process no longer exists
          console.log(`Process ${pid} shut down gracefully.`);
          clearTimeout(timeoutId);
          clearInterval(checkInterval);
          resolve();
        }
      }, 200);
    });
  } catch (error) {
    console.error(
      `Failed to terminate process ${pid}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Check for hanging processes related to code-cli-any-llm
 */
function checkHangingProcesses(): void {
  try {
    const hangingProcesses = execSync(
      'ps aux | grep "node.*code-cli-any-llm" | grep -v grep',
      {
        encoding: 'utf8',
        timeout: 5000,
      },
    );

    if (hangingProcesses.trim()) {
      console.log('\nDetected hanging processes:');
      console.log(hangingProcesses);
      console.log('\nYou may need to terminate these processes manually:');
      console.log('  pkill -f "node.*code-cli-any-llm"');
    }
  } catch {
    // Ignore error if no process found
  }
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
      console.warn(
        'Failed to read the existing configuration; writing a fresh configuration.',
      );
      existingConfig = {};
    }
  }

  if (!existingConfig.openai) {
    existingConfig.openai = {};
  }

  if (!existingConfig.gateway) {
    existingConfig.gateway = {};
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(
    'First-time setup: provide the required OpenAI configuration values.',
  );

  let baseURL = await ask(
    rl,
    'OpenAI Base URL (leave blank for https://open.bigmodel.cn/api/paas/v4)',
    existingConfig.openai.baseURL,
  );
  if (!baseURL) {
    baseURL = 'https://open.bigmodel.cn/api/paas/v4';
  }

  let model = await ask(
    rl,
    'Default model (leave blank for glm-4.5)',
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

  const apiModeRaw = await ask(
    rl,
    'Gateway API mode (gemini/openai, default gemini)',
    existingConfig.gateway.apiMode,
  );

  const cliModeRaw = await ask(
    rl,
    'Default CLI mode (gemini/opencode/crush/qwencode, default gemini)',
    existingConfig.gateway.cliMode,
  );

  const gatewayApiKeyRaw = await ask(
    rl,
    'Gateway API key (optional, used for OpenAI compatibility shims)',
    existingConfig.gateway.apiKey,
  );

  rl.close();

  existingConfig.openai.apiKey = apiKey;
  existingConfig.openai.baseURL = baseURL;
  existingConfig.openai.model = model;
  existingConfig.gateway.apiMode = normalizeGatewayApiMode(apiModeRaw);
  existingConfig.gateway.cliMode = normalizeGatewayCliMode(cliModeRaw);
  if (gatewayApiKeyRaw && gatewayApiKeyRaw.trim()) {
    existingConfig.gateway.apiKey = gatewayApiKeyRaw.trim();
  } else {
    delete existingConfig.gateway.apiKey;
  }

  try {
    const yamlContent = yaml.dump(existingConfig, {
      indent: 2,
      lineWidth: 120,
    });
    fs.writeFileSync(configFile, yamlContent, { mode: 0o600 });

    console.log(`Configuration written to ${configFile}`);
  } catch (error) {
    console.error('Failed to write configuration:', error);
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

    console.log('This field cannot be empty. Please try again.');
  }
}

function normalizeGatewayApiMode(value?: string): 'gemini' | 'openai' {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'openai' ? 'openai' : 'gemini';
}

function normalizeGatewayCliMode(
  value?: string,
): 'gemini' | 'opencode' | 'crush' | 'qwencode' {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'opencode') {
    return 'opencode';
  }
  if (normalized === 'crush') {
    return 'crush';
  }
  if (normalized === 'qwencode') {
    return 'qwencode';
  }
  return 'gemini';
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }
}

function resolveModule(moduleId: string, basedir: string): string | null {
  try {
    const requireFromRoot = createRequire(
      path.join(basedir, 'package.json'),
    );
    return requireFromRoot.resolve(moduleId);
  } catch {
    return null;
  }
}

function selectGatewayEntry(projectRoot: string): {
  entry: string;
  useTypeScript: boolean;
} {
  const tsEntry = path.join(projectRoot, 'src', 'main.ts');
  const distEntry = path.join(projectRoot, 'dist', 'main.js');
  const runningFromTs = path.extname(__filename).toLowerCase() === '.ts';

  if (runningFromTs && fs.existsSync(tsEntry)) {
    return { entry: tsEntry, useTypeScript: true };
  }

  return { entry: distEntry, useTypeScript: false };
}

function startGatewayProcess(context: GatewayContext): number | undefined {
  const { entry, useTypeScript } = selectGatewayEntry(context.projectRoot);

  const args: string[] = [];

  if (useTypeScript) {
    const tsNodeRegister = resolveModule(
      'ts-node/register/transpile-only',
      context.projectRoot,
    );
    const tsconfigPathsRegister = resolveModule(
      'tsconfig-paths/register',
      context.projectRoot,
    );

    if (!tsNodeRegister) {
      console.error(
        '无法解析 ts-node/register/transpile-only。请执行 `pnpm install` 后重试。',
      );
      process.exit(1);
    }

    if (!tsconfigPathsRegister) {
      console.error(
        '无法解析 tsconfig-paths/register。请执行 `pnpm install` 后重试。',
      );
      process.exit(1);
    }

    args.push(
      '--require',
      tsNodeRegister,
      '--require',
      tsconfigPathsRegister,
      entry,
    );
  } else {
    if (!fs.existsSync(entry)) {
      console.error(
        'dist/main.js 不存在。请先执行 `pnpm run build` 生成产物后再试。',
      );
      process.exit(1);
    }

    args.push(entry);
  }

  ensureDir(context.configDir);

  const child = spawn(process.execPath, args, {
    cwd: context.projectRoot,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || (useTypeScript ? 'development' : 'production'),
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
      error: new Error('Gateway process did not exit before the timeout'),
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
  let pidInfo = readGatewayPidInfo(context.configDir);
  let runningPid =
    pidInfo && isPidRunning(pidInfo.pid) ? pidInfo.pid : undefined;

  if (!runningPid) {
    const detectedPid = detectGatewayPid(context.gatewayPort);
    if (detectedPid && isPidRunning(detectedPid)) {
      runningPid = detectedPid;
      pidInfo = {
        pid: detectedPid,
        startedAt: Date.now(),
      };
      writeGatewayPidInfo(context.configDir, pidInfo);
    }
  }

  console.log(`${title}: ${status.healthy ? 'healthy' : 'unhealthy'}`);
  console.log(`Health check: ${healthUrl}`);

  if (runningPid) {
    console.log(`Process PID: ${runningPid} (running)`);
  } else if (pidInfo?.pid) {
    console.log(`Process PID: ${pidInfo.pid} (exited)`);
  } else {
    console.log('Process PID: not recorded');
  }

  const details = formatStatusDetails(status);
  for (const line of details) {
    console.log(line);
  }
}

function formatStatusDetails(status: GatewayHealthStatus): string[] {
  const lines: string[] = [];

  if (status.message) {
    lines.push(`Status message: ${status.message}`);
  }

  if (status.providerError) {
    lines.push(`Upstream message: ${status.providerError}`);
  }

  if (status.statusCode && status.statusCode !== 200) {
    lines.push(`HTTP status code: ${status.statusCode}`);
  }

  const extraErrors = collectErrorMessages(status.payload?.errors);
  if (extraErrors.length > 0) {
    lines.push(`Error details: ${extraErrors.join('; ')}`);
  }

  const provider = status.payload?.provider;
  if (isRecord(provider)) {
    lines.push(`Provider response: ${JSON.stringify(provider)}`);
  }

  if (!status.healthy && status.rawBody) {
    lines.push(`Raw response: ${status.rawBody}`);
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

function detectGatewayPid(port: number): number | undefined {
  try {
    const lsofOutput = execSync(`lsof -ti:${port}`, {
      encoding: 'utf8',
      timeout: 3000,
    })
      .trim()
      .split('\n')
      .filter(Boolean);
    if (lsofOutput.length > 0) {
      const pid = parseInt(lsofOutput[0], 10);
      if (!Number.isNaN(pid) && pid > 0) {
        return pid;
      }
    }
  } catch {
    // ignore
  }

  try {
    const psOutput = execSync(
      'ps aux | grep "node.*dist/main.js" | grep -v grep',
      {
        encoding: 'utf8',
        timeout: 3000,
      },
    )
      .trim()
      .split('\n')
      .filter(Boolean);
    for (const line of psOutput) {
      const match = line.match(/\s+(\d+)\s+/);
      if (match) {
        const pid = parseInt(match[1], 10);
        if (!Number.isNaN(pid) && pid > 0) {
          return pid;
        }
      }
    }
  } catch {
    // ignore
  }

  return undefined;
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
      resolve({ healthy: false, message: 'Health check request timed out' });
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
    console.error('Gateway health check failed with no response.');
    return;
  }

  if (status.message) {
    console.error(`Gateway response: ${status.message}`);
  } else if (status.statusCode) {
    console.error(
      `Gateway health check failed with HTTP status ${status.statusCode}`,
    );
  } else {
    console.error('Gateway health check failed with no additional details.');
  }

  const providerError = status.providerError;
  if (providerError && providerError !== status.message) {
    console.error(`Upstream error: ${providerError}`);
  }

  const extraErrors = collectErrorMessages(status.payload?.errors);
  if (extraErrors.length > 0) {
    console.error(`Gateway error list: ${extraErrors.join('; ')}`);
  }

  if (status.rawBody && !status.message && !providerError) {
    console.error(`Gateway response body: ${status.rawBody}`);
  }
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
      provider === 'codex'
        ? data?.codex?.apiKey
        : provider === 'claudeCode'
          ? data?.claudeCode?.apiKey
          : data?.openai?.apiKey;
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
