import * as os from 'os';
import * as path from 'path';
import { GlobalConfigService } from '../config/global-config.service';
import { ensureGeminiSettings, runConfigWizard } from './gal-code';

export async function runGalAuth(): Promise<void> {
  const configDir = path.join(os.homedir(), '.gemini-any-llm');
  const configFile = path.join(configDir, 'config.yaml');

  ensureGeminiSettings();
  await runConfigWizard(configFile);

  const configService = new GlobalConfigService();
  const result = configService.loadGlobalConfig();
  if (!result.isValid) {
    console.error('配置校验失败，请检查 ~/.gemini-any-llm/config.yaml。');
    result.errors?.forEach((error) => {
      if (error?.message) {
        console.error(`- ${error.message}`);
      }
    });
    process.exitCode = 1;
    return;
  }

  console.log('认证配置已更新。');
}
