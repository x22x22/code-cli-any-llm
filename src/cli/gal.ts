#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { runGalCode } from './gal-code';
import { runGalAuth } from './gal-auth';
import {
  runGalStart,
  runGalRestart,
  runGalStatus,
  runGalStop,
  runGalKill,
} from './gal-gateway';
import { showUpdateBanner } from './update-checker';

function loadVersion(): string {
  const packageJsonPath = resolve(__dirname, '../../package.json');
  try {
    const content = readFileSync(packageJsonPath, 'utf8');
    const parsed = JSON.parse(content) as { version?: string };
    return parsed.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function loadHelpText(): string {
  const helpTextPath = resolve(__dirname, 'help-text.txt');
  try {
    const content = readFileSync(helpTextPath, 'utf8');
    return `\n${content}\n`;
  } catch {
    return '\n帮助文档加载失败\n';
  }
}

const version = loadVersion();

const [, , command, ...restArgs] = process.argv;

function showHelp() {
  console.log(loadHelpText());
}

function showVersion() {
  console.log(version);
}

async function main() {
  const versionCommandAliases = new Set(['-v', '--version', 'version']);
  const shouldShowUpdateBanner =
    process.env.GAL_DISABLE_UPDATE_CHECK !== '1' &&
    process.stdout.isTTY &&
    !versionCommandAliases.has(command ?? '');

  if (shouldShowUpdateBanner) {
    await showUpdateBanner(version);
  }

  switch (command) {
    case undefined:
      showHelp();
      break;
    case '-h':
    case '--help':
      showHelp();
      break;
    case '-v':
    case '--version':
    case 'version':
      showVersion();
      break;
    case 'code':
      await runGalCode(restArgs);
      break;
    case 'start':
      await runGalStart();
      break;
    case 'stop':
      await runGalStop();
      break;
    case 'restart':
      await runGalRestart();
      break;
    case 'status':
      await runGalStatus();
      break;
    case 'kill':
      await runGalKill();
      break;
    case 'auth':
      await runGalAuth();
      break;
    default:
      console.log(`未知命令: ${command}`);
      showHelp();
      process.exitCode = 1;
  }
}

main().catch((error) => {
  let exitCode = 1;
  if (error && typeof error === 'object' && 'exitCode' in error) {
    const maybeCode = (error as { exitCode?: number }).exitCode;
    if (typeof maybeCode === 'number') {
      exitCode = maybeCode;
    }
  }

  const message = error instanceof Error ? error.message : String(error);

  console.error('执行 gal 命令失败:', message);
  process.exit(exitCode);
});
