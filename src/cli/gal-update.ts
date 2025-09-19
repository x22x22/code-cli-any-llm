import {
  buildUpgradeCommand,
  isNewerVersion,
  refreshVersionInfoImmediate,
} from './update-checker';
import { loadCliVersion, runUpgradeCommand } from './upgrade-utils';

export async function runGalUpdate(): Promise<void> {
  const currentVersion = loadCliVersion();
  console.log('正在检查可用更新...');

  const info = await refreshVersionInfoImmediate();

  if (!info) {
    console.error('无法获取最新版本信息，请稍后重试。');
    process.exitCode = 1;
    return;
  }

  if (!isNewerVersion(info.latestVersion, currentVersion)) {
    console.log('当前已经是最新版本，无需更新。');
    return;
  }

  const command = buildUpgradeCommand();
  console.log(
    `检测到新版本 ${info.latestVersion}（当前 ${currentVersion}），即将执行更新...`,
  );
  console.log(`使用命令：${command}`);

  const succeeded = await runUpgradeCommand(command);
  if (succeeded) {
    console.log('升级已完成，请重新运行命令以加载最新版本。');
  } else {
    console.error('升级命令执行失败，请手动重试上述命令。');
    process.exitCode = 1;
  }
}
