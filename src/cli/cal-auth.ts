import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import { GlobalConfigService } from '../config/global-config.service';
import { ensureGeminiSettings, runConfigWizard } from './cal-code';
import { runGalRestart } from './cal-gateway';

async function askRestartGateway(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(
    '\n⚠️  Warning: Restarting the gateway will interrupt all ongoing Gemini CLI conversations!',
  );
  console.log(
    '   Restarting the gateway will not stop active Gemini CLI processes.',
  );
  console.log(
    '   If you are using Gemini CLI right now, wait for sessions to finish before restarting.',
  );

  return new Promise((resolve) => {
    rl.question(
      '\nRestart the gateway to apply the configuration? (y/N): ',
      (answer) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();
        resolve(normalized === 'y' || normalized === 'yes');
      },
    );
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
    console.error(
      'Configuration validation failed. Check ~/.code-cli-any-llm/config.yaml.',
    );
    result.errors?.forEach((error) => {
      if (error?.message) {
        console.error(`- ${error.message}`);
      }
    });
    process.exitCode = 1;
    return;
  }

  console.log('Authentication configuration updated.');

  // Ask the user whether to restart the gateway
  try {
    const shouldRestart = await askRestartGateway();
    if (shouldRestart) {
      console.log('Restarting the gateway...');
      await runGalRestart();
    } else {
      console.log(
        '\nHeads-up: Restart the gateway for configuration changes to take effect.',
      );
      console.log('Please run: cal restart');
    }
  } catch (error) {
    console.error('An error occurred while restarting the gateway:', error);
    console.log(
      '\nHeads-up: Restart the gateway for configuration changes to take effect.',
    );
    console.log('Please run: cal restart');
  }
}
