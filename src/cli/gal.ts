#!/usr/bin/env node
import { runGalCode } from './gal-code';
import { runGalAuth } from './gal-auth';

const [, , command, ...restArgs] = process.argv;

const HELP_TEXT = `\nUsage: gal [command]\n\nCommands:\n  code          启动/连接网关并调用 gemini CLI\n  auth          配置 Gemini CLI 身份认证\n  -h, --help    查看帮助\n\n示例:\n  gal code "请用TypeScript写一个HTTP服务"\n`;

function showHelp() {
  console.log(HELP_TEXT);
}

async function main() {
  if (!command || command === '-h' || command === '--help') {
    showHelp();
    return;
  }

  switch (command) {
    case 'code':
      await runGalCode(restArgs);
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
