import { spawn } from 'child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let cachedVersion: string | null = null;

export function loadCliVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  const packageJsonPath = resolve(__dirname, '../../package.json');
  try {
    const content = readFileSync(packageJsonPath, 'utf8');
    const parsed = JSON.parse(content) as { version?: string };
    cachedVersion = parsed.version ?? 'unknown';
  } catch {
    cachedVersion = 'unknown';
  }

  return cachedVersion;
}

export async function runUpgradeCommand(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio: 'inherit',
    });

    child.on('exit', (code) => {
      resolve(code === 0);
    });

    child.on('error', () => {
      resolve(false);
    });
  });
}
