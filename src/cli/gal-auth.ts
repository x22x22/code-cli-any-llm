import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import { GlobalConfigService } from '../config/global-config.service';
import { ensureGeminiSettings, runConfigWizard } from './gal-code';
import { runGalRestart } from './gal-gateway';

/**
 * 询问用户是否重启网关
 */
async function askRestartGateway(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n⚠️  警告：重启网关会导致所有正在进行的 Gemini CLI 对话中断！');
  console.log('   重启网关不会停止正在运行的 Gemini CLI 进程。');
  console.log(
    '   如果当前正在使用 Gemini CLI，请等待对话完全结束后再进行重启。',
  );

  return new Promise((resolve) => {
    rl.question('\n是否重启网关以使配置生效？(y/N): ', (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

export async function runGalAuth(): Promise<void> {
  const configDir = path.join(os.homedir(), '.code-cli-any-llm');
  const configFile = path.join(configDir, 'config.yaml');

  ensureGeminiSettings();
  await runConfigWizard(configFile);

  const configService = new GlobalConfigService();
  const result = configService.loadGlobalConfig();
  if (!result.isValid) {
    console.error('配置校验失败，请检查 ~/.code-cli-any-llm/config.yaml。');
    result.errors?.forEach((error) => {
      if (error?.message) {
        console.error(`- ${error.message}`);
      }
    });
    process.exitCode = 1;
    return;
  }

  console.log('认证配置已更新。');

  // 询问用户是否重启网关
  try {
    const shouldRestart = await askRestartGateway();
    if (shouldRestart) {
      console.log('正在重启网关...');
      await runGalRestart();
    } else {
      console.log('\n提示：配置修改后需要重启网关才会生效。');
      console.log('请手动执行：gal restart');
    }
  } catch (error) {
    console.error('重启网关时发生错误:', error);
    console.log('\n提示：配置修改后需要重启网关才会生效。');
    console.log('请手动执行：gal restart');
  }
}
