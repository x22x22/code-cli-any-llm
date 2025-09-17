#!/usr/bin/env node
import {
  runGalCode,
  runGalKill,
  runGalStart,
  runGalStatus,
  runGalStop,
} from './gal-code';
import { runGalAuth } from './gal-auth';

const [, , command, ...restArgs] = process.argv;

const HELP_TEXT = `\nUsage: gal [command]\n\nCommands:\n  code          启动/连接网关并调用 gemini CLI\n  start         以守护进程方式启动网关组件\n  stop          停止网关组件\n  status        查看网关组件的运行状态\n  kill          强制终止本地网关进程\n  auth          配置 Gemini CLI 身份认证\n  -h, --help    查看帮助\n\n示例:\n  gal code "请用TypeScript写一个HTTP服务"\n  gal start\n  gal status\n  gal kill\n`;

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
    case 'start':
      await runGalStart();
      break;
    case 'stop':
      await runGalStop();
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
