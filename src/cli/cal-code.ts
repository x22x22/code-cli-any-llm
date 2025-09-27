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
  ClaudeCodeConfig,
} from '../config/global-config.interface';
import { ChatGPTAuthManager } from '../providers/codex/chatgpt-auth.manager';
import { runGalRestart } from './cal-gateway';
import {
  buildUpgradeCommand,
  getVersionPromptContext,
  persistVersionInfo,
} from './update-checker';
import { loadCliVersion, runUpgradeCommand } from './upgrade-utils';

const GEMINI_AUTH_TYPE = 'gemini-api-key';

const GATEWAY_HEALTH_PATH = '/api/v1/health';
const DEFAULT_TIMEOUT = 20000;
const POLL_INTERVAL = 800;
const GATEWAY_PID_FILE = 'gateway.pid.json';

type CliMode = 'gemini' | 'opencode' | 'crush';
type ApiMode = 'gemini' | 'openai';

const CLI_MODE_VALUES: CliMode[] = ['gemini', 'opencode', 'crush'];

function parseCliModeValue(value?: string | null): CliMode | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if ((CLI_MODE_VALUES as string[]).includes(normalized)) {
    return normalized as CliMode;
  }
  return undefined;
}

function normalizeCliMode(value?: string | null): CliMode {
  return parseCliModeValue(value) ?? 'gemini';
}

function resolveClientHost(host: string): string {
  if (!host) {
    return '127.0.0.1';
  }
  const normalized = host.trim();
  if (
    normalized === '0.0.0.0' ||
    normalized === '::' ||
    normalized === '::0' ||
    normalized === '[::]'
  ) {
    return '127.0.0.1';
  }
  return normalized;
}

function stripJsonComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function readJsonConfigFile(filePath: string): Record<string, any> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
      return {};
    }
    const cleaned = stripJsonComments(raw);
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, any>;
    }
  } catch (error) {
    console.warn(
      `读取配置文件失败 (${filePath})：${(error as Error).message}，将使用默认模板。`,
    );
  }
  return {};
}

function writeJsonConfigFile(
  filePath: string,
  data: Record<string, unknown>,
): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
}

function resolveConfigDirectory(subdir: string): string {
  const base =
    process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME.trim()
      ? process.env.XDG_CONFIG_HOME.trim()
      : path.join(os.homedir(), '.config');
  return path.join(base, subdir);
}

function resolveOpencodeConfigPath(): string {
  const dir = resolveConfigDirectory('opencode');
  const jsonPath = path.join(dir, 'opencode.json');
  const jsoncPath = path.join(dir, 'opencode.jsonc');
  if (fs.existsSync(jsonPath)) {
    return jsonPath;
  }
  if (fs.existsSync(jsoncPath)) {
    return jsoncPath;
  }
  return jsonPath;
}

function resolveCrushConfigPath(): string {
  const dir = resolveConfigDirectory('crush');
  return path.join(dir, 'crush.json');
}

interface GatewayContext {
  projectRoot: string;
  configDir: string;
  configFile: string;
  gatewayHost: string;
  gatewayPort: number;
  geminiApiKey?: string;
  cliMode: CliMode;
  apiMode: ApiMode;
  gatewayApiKey?: string;
  configWasUpdated: boolean;
}

interface GatewayContextOptions {
  allowWizard?: boolean;
  requireApiKey?: boolean;
  ensureGeminiSettings?: boolean;
  cliModeOverride?: CliMode;
}

interface GatewayPidInfo {
  pid: number;
  startedAt?: number;
  entry?: string;
}

function promptUser(message: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function handleUpgradePrompt(): Promise<void> {
  const currentVersion = loadCliVersion();
  const context = await getVersionPromptContext(currentVersion);

  if (!context) {
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(
      `检测到新版本 ${context.info.latestVersion}，当前为非交互环境，默认暂不更新。`,
    );
    return;
  }

  console.log('');
  console.log(
    `✨ 检测到新版本！当前 ${currentVersion} → 最新 ${context.info.latestVersion}`,
  );
  console.log(
    '请选择操作：y(现在更新) / n(暂不更新) / skip(跳过本次版本) / off(关闭自动检查)',
  );

  while (true) {
    const answerRaw = await promptUser('[Y/n/skip/off] (默认Y): ');
    const normalized = (answerRaw || 'y').toLowerCase();

    switch (normalized) {
      case 'y':
      case 'yes': {
        const command = buildUpgradeCommand();
        console.log(`正在执行升级命令: ${command}`);
        const succeeded = await runUpgradeCommand(command);
        if (succeeded) {
          console.log('升级完成，请重新运行 `cal code` 以使用最新版本。');
          process.exit(0);
        } else {
          console.error('自动升级失败，可稍后手动执行以下命令完成升级:');
          console.error(`  ${command}`);
          console.log('将继续使用当前版本启动。');
        }
        return;
      }
      case 'n':
      case 'no':
        console.log('已选择暂不更新，将继续使用当前版本。');
        return;
      case 'skip':
      case 's': {
        const skipSet = new Set(context.info.skipVersions ?? []);
        skipSet.add(context.info.latestVersion);
        context.info.skipVersions = Array.from(skipSet);
        await persistVersionInfo(context);
        console.log(
          `已跳过版本 ${context.info.latestVersion}，后续检测到新版本时会再次提醒。`,
        );
        return;
      }
      case 'off': {
        context.info.disableCheck = true;
        await persistVersionInfo(context);
        process.env.CAL_DISABLE_UPDATE_CHECK = '1';
        console.log('已关闭自动更新检查，正在重启网关以应用配置...');
        try {
          await runGalRestart();
          console.log('网关重启完成，请重新运行 `cal code`。');
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(`重启网关失败: ${message}`);
        }
        process.exit(0);
        return;
      }
      default:
        console.log('无效选项，请输入 y/n/skip/off。');
    }
  }
}

async function prepareGatewayContext(
  options: GatewayContextOptions = {},
): Promise<GatewayContext> {
  const {
    allowWizard = true,
    requireApiKey = true,
    ensureGeminiSettings: ensureGeminiFlag,
    cliModeOverride,
  } = options;

  const projectRoot = locateProjectRoot(__dirname);
  const configDir = path.join(os.homedir(), '.code-cli-any-llm');
  const configFile = path.join(configDir, 'config.yaml');

  const configExists = fs.existsSync(configFile);
  const configService = new GlobalConfigService();
  let configResult = configService.loadGlobalConfig();
  let configWasUpdated = false;

  if (allowWizard && shouldRunWizard(configExists, configResult)) {
    await runConfigWizard(configFile);
    configResult = configService.loadGlobalConfig();
    configWasUpdated = true;

    if (!configResult.isValid) {
      console.error('配置仍然无效，请检查 ~/.code-cli-any-llm/config.yaml');
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
  const cliMode: CliMode =
    cliModeOverride ?? normalizeCliMode(config.gateway.cliMode);
  let apiModeValue = (config.gateway.apiMode ?? 'gemini')
    .toString()
    .trim()
    .toLowerCase();

  if (cliMode === 'opencode' || cliMode === 'crush') {
    apiModeValue = 'openai';
    if (
      config.gateway.apiMode !== 'openai' ||
      config.gateway.cliMode !== cliMode
    ) {
      config.gateway.apiMode = 'openai';
      config.gateway.cliMode = cliMode;
      configService.saveConfig(config);
      configWasUpdated = true;
    }
  } else if (config.gateway.cliMode !== cliMode) {
    config.gateway.cliMode = cliMode;
    configService.saveConfig(config);
    configWasUpdated = true;
  }

  const apiMode: ApiMode = apiModeValue === 'openai' ? 'openai' : 'gemini';
  const shouldEnsureGemini = ensureGeminiFlag ?? cliMode === 'gemini';
  const requireGeminiApiKey = cliMode === 'gemini' && requireApiKey;
  const gatewayApiKey = config.gateway.apiKey;

  const isChatGPTMode = isCodexChatGPTMode(config);

  let geminiApiKey: string | undefined;
  if (requireGeminiApiKey) {
    if (isChatGPTMode) {
      try {
        await ensureChatGPTAuth('GalCodeChatGPT');
        geminiApiKey = 'chatgpt-mode';
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`初始化 ChatGPT 凭据失败: ${reason}`);
        console.error('请重新运行 `pnpm run cal auth` 并完成浏览器登录。');
        process.exit(1);
      }
    } else {
      geminiApiKey = readGlobalApiKey(configFile);
      if (!geminiApiKey) {
        console.error(
          '未能在 ~/.code-cli-any-llm/config.yaml 中找到有效的 apikey',
        );
        process.exit(1);
      }
    }
  }

  if (shouldEnsureGemini && cliMode === 'gemini') {
    ensureGeminiSettings();
  }

  return {
    projectRoot,
    configDir,
    configFile,
    gatewayHost,
    gatewayPort,
    geminiApiKey,
    cliMode,
    apiMode,
    gatewayApiKey,
    configWasUpdated,
  };
}

interface CliModeParseResult {
  cliModeOverride?: CliMode;
  filteredArgs: string[];
}

function extractCliModeFromArgs(args: string[]): CliModeParseResult {
  const filtered: string[] = [];
  let override: CliMode | undefined;
  let skipNext = false;
  let stopParsing = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (stopParsing) {
      filtered.push(arg);
      continue;
    }

    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (arg === '--') {
      stopParsing = true;
      filtered.push(arg);
      continue;
    }

    if (arg === '--cli-mode') {
      const next = args[i + 1];
      const parsed = parseCliModeValue(next);
      if (!parsed) {
        console.error('无效的 --cli-mode 参数，需要 gemini / opencode / crush');
        process.exit(1);
      }
      override = parsed;
      skipNext = true;
      continue;
    }

    if (arg.startsWith('--cli-mode=')) {
      const value = arg.split('=')[1];
      const parsed = parseCliModeValue(value);
      if (!parsed) {
        console.error('无效的 --cli-mode 参数，需要 gemini / opencode / crush');
        process.exit(1);
      }
      override = parsed;
      continue;
    }

    filtered.push(arg);
  }

  return { cliModeOverride: override, filteredArgs: filtered };
}

export async function runGalCode(args: string[]): Promise<void> {
  await handleUpgradePrompt();
  const { cliModeOverride, filteredArgs } = extractCliModeFromArgs(args);
  const context = await prepareGatewayContext({ cliModeOverride });
  const {
    gatewayHost,
    gatewayPort,
    geminiApiKey,
    cliMode,
    apiMode,
    gatewayApiKey,
    configWasUpdated,
  } = context;

  const clientHost = resolveClientHost(gatewayHost);

  if (configWasUpdated) {
    console.log('检测到配置更新，正在重启网关...');
    try {
      await runGalRestart();
      console.log('网关已重新启动。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`重启网关失败: ${message}`);
      console.error('请手动运行 `pnpm run cal restart` 后重试。');
      process.exit(1);
    }
  }

  if ((cliMode === 'opencode' || cliMode === 'crush') && apiMode !== 'openai') {
    console.error(
      '当前网关处于 Gemini 模式，无法提供 OpenAI 兼容接口。请在配置中将 gateway.apiMode 调整为 openai 后重试。',
    );
    process.exit(1);
  }

  if (!(await isGatewayHealthy(clientHost, gatewayPort))) {
    console.log('检测到网关未运行，正在后台启动服务...');
    startGatewayProcess(context);

    const { ready, lastStatus } = await waitForGatewayHealthy(
      clientHost,
      gatewayPort,
    );
    if (!ready) {
      logGatewayFailure(lastStatus);
      console.error('网关未在预期时间内就绪，请检查部署状态后重试。');
      process.exit(1);
    }
  }

  if (cliMode === 'gemini') {
    await launchGeminiCLI(
      filteredArgs,
      clientHost,
      gatewayPort,
      geminiApiKey ?? '',
    );
    return;
  }

  if (cliMode === 'opencode') {
    prepareOpencodeConfig(clientHost, gatewayPort, apiMode, gatewayApiKey);
    await launchOpencodeCLI(
      filteredArgs,
      clientHost,
      gatewayPort,
      gatewayApiKey,
    );
    return;
  }

  prepareCrushConfig(clientHost, gatewayPort, apiMode, gatewayApiKey);
  await launchCrushCLI(filteredArgs, clientHost, gatewayPort, gatewayApiKey);
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
  } else if (provider === 'claudeCode') {
    const claudeConfig = result.config.claudeCode;
    if (!claudeConfig || !claudeConfig.apiKey) {
      return true;
    }
  } else {
    const openaiConfig = result.config.openai;
    if (!openaiConfig || !openaiConfig.apiKey) {
      return true;
    }
  }

  const providerConfig =
    provider === 'codex'
      ? result.config.codex
      : provider === 'claudeCode'
        ? result.config.claudeCode
        : result.config.openai;

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

  const providerOptions = ['claudeCode', 'codex', 'openai'] as const;
  const existingProvider = existingConfig.aiProvider;
  const aiProviderDefault = providerOptions.includes(
    existingProvider as (typeof providerOptions)[number],
  )
    ? (existingProvider as (typeof providerOptions)[number])
    : 'openai';
  console.log('请选择要配置的 AI Provider：');
  const aiProvider = await askChoice(
    rl,
    'AI Provider',
    providerOptions,
    aiProviderDefault,
  );

  existingConfig.aiProvider = aiProvider;

  if (aiProvider === 'openai') {
    console.log('\n请填写 OpenAI 配置：');
    existingConfig.openai = await configureOpenAI(
      rl,
      existingConfig.openai ?? {},
    );
  } else if (aiProvider === 'codex') {
    console.log('\n请填写 Codex 配置：');
    existingConfig.codex = await configureCodex(rl, existingConfig.codex ?? {});
  } else {
    console.log('\n请填写 Claude Code 配置：');
    existingConfig.claudeCode = await configureClaudeCode(
      rl,
      existingConfig.claudeCode ?? {},
    );
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
    '请求超时时间 (ms, 默认 1800000 ≈ 30 分钟)',
    existing.timeout ?? 1800000,
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
    '请求超时时间 (ms, 默认 1800000 ≈ 30 分钟)',
    existing.timeout ?? 1800000,
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

async function configureClaudeCode(
  rl: readline.Interface,
  existing: Partial<ClaudeCodeConfig>,
): Promise<ClaudeCodeConfig> {
  const baseURL = await ask(
    rl,
    'Claude Code Base URL (默认 https://open.bigmodel.cn/api/anthropic)',
    existing.baseURL ?? 'https://open.bigmodel.cn/api/anthropic',
  );

  const model = await ask(
    rl,
    '默认模型 (默认 claude-sonnet-4-20250514)',
    existing.model ?? 'claude-sonnet-4-20250514',
  );

  const apiKey = await askRequired(rl, 'Claude Code API Key', existing.apiKey);

  const anthropicVersion = await ask(
    rl,
    'Anthropic API 版本 (默认 2023-06-01)',
    existing.anthropicVersion ?? '2023-06-01',
  );

  const defaultBetaString = Array.isArray(existing.beta)
    ? existing.beta.join(',')
    : typeof existing.beta === 'string'
      ? existing.beta
      : 'claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14';
  const betaRaw = await ask(
    rl,
    'anthropic-beta 头 (逗号分隔，留空表示使用默认)',
    defaultBetaString,
  );
  const betaList = betaRaw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const timeout = await askNumber(
    rl,
    '请求超时时间 (ms, 默认 1800000 ≈ 30 分钟)',
    existing.timeout ?? 1800000,
  );

  const maxOutputTokens = await askNumber(
    rl,
    '最大输出 tokens (默认 128000)',
    existing.maxOutputTokens ?? 128000,
  );

  const userAgent = await ask(
    rl,
    'User-Agent (默认 claude-cli/1.0.119 (external, cli))',
    existing.userAgent ?? 'claude-cli/1.0.119 (external, cli)',
  );

  const xApp = await ask(rl, 'X-App 头 (默认 cli)', existing.xApp ?? 'cli');

  const dangerousChoice = await askChoice(
    rl,
    '是否启用 anthropic-dangerous-direct-browser-access',
    ['true', 'false'] as const,
    (existing.dangerousDirectBrowserAccess ?? true) ? 'true' : 'false',
  );

  return {
    apiKey,
    baseURL,
    model,
    timeout,
    anthropicVersion,
    beta: betaList.length > 0 ? betaList : undefined,
    userAgent,
    xApp,
    dangerousDirectBrowserAccess: dangerousChoice === 'true',
    maxOutputTokens,
    extraHeaders: existing.extraHeaders,
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
    const match = options.find((option) => option.toLowerCase() === normalized);
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
  const clientHost = resolveClientHost(host);
  return new Promise((resolve) => {
    const request = http.get(
      {
        host: clientHost,
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
  await runCliCommand('gemini', args, {
    GOOGLE_GEMINI_BASE_URL: baseURL,
    GEMINI_API_KEY: geminiApiKey,
  });
}

async function launchOpencodeCLI(
  args: string[],
  host: string,
  port: number,
  gatewayApiKey?: string,
): Promise<void> {
  const origin = `http://${host}:${port}`;
  const openaiBaseUrl = `${origin}/api/v1/openai/v1`;
  await runCliCommand('opencode', args, {
    OPENAI_BASE_URL: openaiBaseUrl,
    CODE_CLI_API_KEY: gatewayApiKey,
  });
}

async function launchCrushCLI(
  args: string[],
  host: string,
  port: number,
  gatewayApiKey?: string,
): Promise<void> {
  const origin = `http://${host}:${port}`;
  const openaiBaseUrl = `${origin}/api/v1/openai/v1`;
  await runCliCommand('crush', args, {
    CRUSH_DISABLE_PROVIDER_AUTO_UPDATE: '1',
    OPENAI_BASE_URL: openaiBaseUrl,
    CODE_CLI_API_KEY: gatewayApiKey,
  });
}

async function runCliCommand(
  command: string,
  args: string[],
  envOverrides: Record<string, string | undefined>,
): Promise<void> {
  const mergedEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value !== undefined) {
      mergedEnv[key] = value;
    }
  }

  const child = spawn(command, args, {
    stdio: 'inherit',
    env: mergedEnv,
  });

  await new Promise<void>((resolve, reject) => {
    child.on('error', (error) => reject(error));
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(createExitError(command, code));
      }
    });
  });
}

function createExitError(command: string, code: number | null): Error {
  const message = `${command} 命令以状态码 ${code ?? 'unknown'} 退出`;
  const error: NodeJS.ErrnoException & { exitCode?: number } = new Error(
    message,
  );
  error.exitCode = code ?? 1;
  return error;
}

function prepareOpencodeConfig(
  host: string,
  port: number,
  apiMode: ApiMode,
  gatewayApiKey?: string,
): void {
  if (apiMode !== 'openai') {
    return;
  }
  const baseUrl = `http://${host}:${port}/api/v1/openai/v1`;
  const configPath = resolveOpencodeConfigPath();
  const config = readJsonConfigFile(configPath);

  if (!config.$schema) {
    config.$schema = 'https://opencode.ai/config.json';
  }

  const providerContainer = (config.provider =
    (config.provider as Record<string, any>) ?? {});
  const providerEntry = (providerContainer['code-cli'] =
    (providerContainer['code-cli'] as Record<string, any>) ?? {});
  providerEntry.npm = providerEntry.npm || '@ai-sdk/openai-compatible';
  providerEntry.name = providerEntry.name || 'Code CLI Gateway';
  providerEntry.api = providerEntry.api || baseUrl;

  const existingOptions =
    typeof providerEntry.options === 'object' && providerEntry.options
      ? providerEntry.options
      : {};
  providerEntry.options = {
    ...existingOptions,
    baseURL: baseUrl,
    ...(gatewayApiKey ? { apiKey: gatewayApiKey } : {}),
  };

  const models: Record<string, any> =
    typeof providerEntry.models === 'object' && providerEntry.models
      ? (providerEntry.models as Record<string, any>)
      : {};

  const existingClaude =
    models['claude-code-proxy'] &&
    typeof models['claude-code-proxy'] === 'object'
      ? (models['claude-code-proxy'] as Record<string, any>)
      : {};
  const existingCodex =
    models['codex-proxy'] && typeof models['codex-proxy'] === 'object'
      ? (models['codex-proxy'] as Record<string, any>)
      : {};

  const existingClaudeOptions =
    existingClaude && typeof existingClaude.options === 'object'
      ? (existingClaude.options as Record<string, any>)
      : {};
  const existingThinking =
    existingClaudeOptions && typeof existingClaudeOptions.thinking === 'object'
      ? (existingClaudeOptions.thinking as Record<string, any>)
      : {};
  const existingBudgetTokens =
    typeof existingThinking.budgetTokens === 'number'
      ? existingThinking.budgetTokens
      : 12000;

  models['claude-code-proxy'] = {
    ...existingClaude,
    options: {
      ...existingClaudeOptions,
      thinking: {
        ...existingThinking,
        type: 'enabled',
        budgetTokens: existingBudgetTokens,
      },
    },
  };
  models['codex-proxy'] = {
    ...existingCodex,
  };

  providerEntry.models = models;

  if (!config.model || typeof config.model !== 'string') {
    config.model = 'code-cli/claude-code-proxy';
  }

  writeJsonConfigFile(configPath, config);
}

function prepareCrushConfig(
  host: string,
  port: number,
  apiMode: ApiMode,
  gatewayApiKey?: string,
): void {
  if (apiMode !== 'openai') {
    return;
  }

  const baseUrl = `http://${host}:${port}/api/v1/openai/v1`;
  const configPath = resolveCrushConfigPath();
  const config = readJsonConfigFile(configPath);

  if (!config.$schema) {
    config.$schema = 'https://charm.land/crush.json';
  }

  const providers = (config.providers =
    (config.providers as Record<string, any>) ?? {});
  const providerEntry = (providers['code-cli'] =
    (providers['code-cli'] as Record<string, any>) ?? {});

  providerEntry.name = providerEntry.name || 'Code CLI Gateway';
  providerEntry.type = 'openai';
  providerEntry.base_url = baseUrl;
  if (gatewayApiKey) {
    providerEntry.api_key = gatewayApiKey;
  }

  const desiredModels = [
    {
      id: 'claude-code-proxy',
      name: 'Claude Code (Gateway)',
      context_window: 200000,
      default_max_tokens: 16000,
    },
    {
      id: 'codex-proxy',
      name: 'Codex (Gateway)',
      context_window: 120000,
      default_max_tokens: 12000,
    },
  ];

  const existingModelsArray = Array.isArray(providerEntry.models)
    ? providerEntry.models
    : [];
  const modelsById = new Map<string, Record<string, any>>();
  for (const model of existingModelsArray) {
    if (model && typeof model.id === 'string') {
      modelsById.set(model.id, { ...model });
    }
  }
  for (const desired of desiredModels) {
    const existing = modelsById.get(desired.id) ?? {};
    modelsById.set(desired.id, { ...existing, ...desired });
  }
  providerEntry.models = Array.from(modelsById.values());

  if (!config.models || typeof config.models !== 'object') {
    config.models = {};
  }
  const modelsConfig = config.models as Record<string, any>;
  if (!modelsConfig.large) {
    modelsConfig.large = {
      provider: 'code-cli',
      model: 'claude-code-proxy',
    };
  }
  if (!modelsConfig.small) {
    modelsConfig.small = {
      provider: 'code-cli',
      model: 'codex-proxy',
    };
  }

  writeJsonConfigFile(configPath, config);
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
