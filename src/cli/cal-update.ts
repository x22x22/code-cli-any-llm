import {
  buildUpgradeCommand,
  isNewerVersion,
  refreshVersionInfoImmediate,
} from './update-checker';
import { loadCliVersion, runUpgradeCommand } from './upgrade-utils';

export async function runGalUpdate(): Promise<void> {
  const currentVersion = loadCliVersion();
  console.log('Checking for available updates...');

  const info = await refreshVersionInfoImmediate();

  if (!info) {
    console.error('Unable to retrieve the latest version information. Please try again later.');
    process.exitCode = 1;
    return;
  }

  if (!isNewerVersion(info.latestVersion, currentVersion)) {
    console.log('You already have the latest version; no update needed.');
    return;
  }

  const command = buildUpgradeCommand();
  console.log(
    `New version detected: ${info.latestVersion} (current ${currentVersion}). Preparing to update...`,
  );
  console.log(`Using command: ${command}`);

  const succeeded = await runUpgradeCommand(command);
  if (succeeded) {
    console.log('Upgrade completed. Re-run the command to load the latest version.');
  } else {
    console.error('Upgrade command failed. Please rerun the command manually.');
    process.exitCode = 1;
  }
}
