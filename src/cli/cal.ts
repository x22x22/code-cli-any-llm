#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { runGalCode } from './cal-code';
import { runGalAuth } from './cal-auth';
import {
  runGalStart,
  runGalRestart,
  runGalStatus,
  runGalStop,
  runGalKill,
} from './cal-gateway';
import { showUpdateBanner } from './update-checker';
import { runGalUpdate } from './cal-update';
import { loadCliVersion } from './upgrade-utils';

type HelpLanguage = 'en' | 'zh';

function loadHelpText(language: HelpLanguage = 'en'): string {
  const filename = language === 'zh' ? 'help-text-cn.txt' : 'help-text.txt';
  const helpTextPath = resolve(__dirname, filename);
  try {
    const content = readFileSync(helpTextPath, 'utf8');
    return `\n${content}\n`;
  } catch {
    if (language === 'zh') {
      return '\nFailed to load help content\n';
    }
    return '\nFailed to load help content\n';
  }
}

const version = loadCliVersion();

const [, , command, ...restArgs] = process.argv;

function showHelp(language: HelpLanguage = 'en') {
  console.log(loadHelpText(language));
}

function showVersion() {
  console.log(version);
}

async function main() {
  const versionCommandAliases = new Set(['-v', '--version', 'version']);
  const bannerExcludedCommands = new Set(['code']);
  const shouldShowUpdateBanner =
    process.env.CAL_DISABLE_UPDATE_CHECK !== '1' &&
    process.stdout.isTTY &&
    !versionCommandAliases.has(command ?? '') &&
    !bannerExcludedCommands.has(command ?? '');

  if (shouldShowUpdateBanner) {
    await showUpdateBanner(version);
  }

  switch (command) {
    case undefined:
      showHelp('en');
      break;
    case '-h':
    case '--help':
    case 'help':
      showHelp('en');
      break;
    case 'help-cn':
    case '--help-cn':
      showHelp('zh');
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
    case 'update':
      await runGalUpdate();
      break;
    case 'auth':
      await runGalAuth();
      break;
    default:
      console.log(`Unknown command: ${command}`);
      showHelp('en');
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

  console.error('Failed to execute cal command:', message);
  process.exit(exitCode);
});
