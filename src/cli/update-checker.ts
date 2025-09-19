import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

interface VersionInfo {
  latestVersion: string;
  lastCheckedAt: string; // ISO-8601
}

const VERSION_FILENAME = 'version.json';
const VERSION_CHECK_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20 小时
const LATEST_VERSION_URL =
  'https://registry.npmjs.org/@kdump%2fgemini-any-llm/latest';
const USER_AGENT = 'gemini-any-llm-cli';

function getVersionFilePath(): string {
  return path.join(homedir(), '.gemini-any-llm', VERSION_FILENAME);
}

async function readVersionInfo(filePath: string): Promise<VersionInfo | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<VersionInfo>;
    if (
      typeof parsed.latestVersion === 'string' &&
      typeof parsed.lastCheckedAt === 'string'
    ) {
      return {
        latestVersion: parsed.latestVersion,
        lastCheckedAt: parsed.lastCheckedAt,
      };
    }
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return null;
    }
    return null;
  }
}

function shouldRefresh(info: VersionInfo | null): boolean {
  if (!info) {
    return true;
  }
  const lastChecked = Date.parse(info.lastCheckedAt);
  if (Number.isNaN(lastChecked)) {
    return true;
  }
  return Date.now() - lastChecked > VERSION_CHECK_INTERVAL_MS;
}

function detectPackageManager(): 'pnpm' | 'yarn' | 'npm' | null {
  const userAgent = process.env.npm_config_user_agent;
  if (!userAgent) {
    return null;
  }
  if (userAgent.startsWith('pnpm/')) {
    return 'pnpm';
  }
  if (userAgent.startsWith('yarn/')) {
    return 'yarn';
  }
  return 'npm';
}

function buildUpgradeCommand(): string {
  switch (detectPackageManager()) {
    case 'pnpm':
      return 'pnpm add -g @kdump/gemini-any-llm@latest';
    case 'yarn':
      return 'yarn global add @kdump/gemini-any-llm@latest';
    case 'npm':
    default:
      return 'npm install -g @kdump/gemini-any-llm@latest';
  }
}

function parseSemver(version: string): [number, number, number] | null {
  const parts = version.trim().split('.');
  if (parts.length < 3) {
    return null;
  }
  const [majorRaw, minorRaw, patchRaw] = parts;
  const major = Number(majorRaw);
  const minor = Number(minorRaw);
  const patchPart = patchRaw.split('-')[0];
  const patch = Number(patchPart);

  if ([major, minor, patch].some((value) => !Number.isFinite(value))) {
    return null;
  }

  return [major, minor, patch];
}

export function isNewerVersion(latest: string, current: string): boolean {
  const latestParsed = parseSemver(latest);
  const currentParsed = parseSemver(current);
  if (!latestParsed || !currentParsed) {
    return false;
  }
  for (let index = 0; index < latestParsed.length; index += 1) {
    if (latestParsed[index] !== currentParsed[index]) {
      return latestParsed[index] > currentParsed[index];
    }
  }
  return false;
}

async function refreshVersionInfo(filePath: string): Promise<void> {
  if (typeof fetch !== 'function') {
    return;
  }

  try {
    const response = await fetch(LATEST_VERSION_URL, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { version?: string };
    if (typeof payload.version !== 'string') {
      return;
    }

    const info: VersionInfo = {
      latestVersion: payload.version,
      lastCheckedAt: new Date().toISOString(),
    };

    const folder = path.dirname(filePath);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(info)}\n`, 'utf8');
  } catch {
    // 网络或文件系统错误不应影响 CLI 正常执行，忽略即可
  }
}

export async function showUpdateBanner(currentVersion: string): Promise<void> {
  if (process.env.GAL_DISABLE_UPDATE_CHECK === '1') {
    return;
  }
  if (!currentVersion || currentVersion === 'unknown') {
    return;
  }

  const versionFile = getVersionFilePath();
  const info = await readVersionInfo(versionFile);

  if (shouldRefresh(info)) {
    void refreshVersionInfo(versionFile);
  }

  if (!info) {
    return;
  }

  if (!isNewerVersion(info.latestVersion, currentVersion)) {
    return;
  }

  const command = buildUpgradeCommand();
  console.log('');
  console.log(
    `✨ 检测到新版本！当前 ${currentVersion} → 最新 ${info.latestVersion}`,
  );
  console.log(`👉 运行 ${command} 完成升级。`);
  console.log('');
}
