import { readFileSync } from 'fs';
import { join } from 'path';

const instructionsPath = join(__dirname, 'gpt5-codex-instructions.md');

export const GPT5_CODEX_BASE_INSTRUCTIONS = readFileSync(
  instructionsPath,
  'utf8',
);
