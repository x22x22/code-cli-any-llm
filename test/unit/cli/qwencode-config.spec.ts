import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { prepareQwencodeConfig } from '../../../src/cli/cal-code';

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const result: Record<string, string> = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const [key, ...rest] = trimmed.split('=');
    if (!key) {
      continue;
    }
    const value = rest.join('=').replace(/^"([\s\S]*)"$/, '$1');
    result[key] = value;
  }
  return result;
}

describe('prepareQwencodeConfig', () => {
  let tempRoot: string;
  let configDir: string;
  let originalQwencodeHome: string | undefined;

  const settingsPath = () => path.join(configDir, 'settings.json');
  const envPath = () => path.join(configDir, '.env');

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cal-qwencode-'));
    configDir = path.join(tempRoot, 'qwen');
    originalQwencodeHome = process.env.CAL_QWEN_HOME;
    process.env.CAL_QWEN_HOME = configDir;
    jest.restoreAllMocks();
  });

  afterEach(() => {
    process.env.CAL_QWEN_HOME = originalQwencodeHome;
    fs.rmSync(tempRoot, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('writes settings and env files using provided gateway credentials', () => {
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    const result = prepareQwencodeConfig(
      '127.0.0.1',
      3456,
      'openai',
      'gateway-secret',
      'custom-model',
    );

    const settings = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    const env = readEnvFile(envPath());

    expect(result).toEqual({
      baseUrl: 'http://127.0.0.1:3456/api/v1/openai/v1',
      apiKey: 'gateway-secret',
      model: 'custom-model',
    });
    expect(settings.security.auth.selectedType).toBe('openai');
    expect(env.OPENAI_BASE_URL).toBe('http://127.0.0.1:3456/api/v1/openai/v1');
    expect(env.OPENAI_API_KEY).toBe('gateway-secret');
    expect(env.OPENAI_MODEL).toBe('custom-model');
    expect(env.QWEN_DEFAULT_AUTH_TYPE).toBe('openai');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('reuses existing env values when gateway key and model are absent', () => {
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      envPath(),
      [
        'OPENAI_API_KEY=existing-key',
        'OPENAI_MODEL=existing-model',
        'EXTRA=1',
      ].join('\n'),
    );

    const result = prepareQwencodeConfig(
      'localhost',
      8080,
      'openai',
      undefined,
      undefined,
    );

    const env = readEnvFile(envPath());

    expect(result).toEqual({
      baseUrl: 'http://localhost:8080/api/v1/openai/v1',
      apiKey: 'existing-key',
      model: 'existing-model',
    });
    expect(env.OPENAI_API_KEY).toBe('existing-key');
    expect(env.OPENAI_MODEL).toBe('existing-model');
    expect(env.EXTRA).toBe('1');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('writes placeholder and warns when api key is missing everywhere', () => {
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    const result = prepareQwencodeConfig(
      'localhost',
      9000,
      'openai',
      undefined,
      undefined,
    );

    const env = readEnvFile(envPath());

    expect(result).toEqual({
      baseUrl: 'http://localhost:9000/api/v1/openai/v1',
      apiKey: 'REPLACE_WITH_GATEWAY_API_KEY',
      model: 'codex-proxy',
    });
    expect(env.OPENAI_API_KEY).toBe('REPLACE_WITH_GATEWAY_API_KEY');
    expect(env.OPENAI_MODEL).toBe('codex-proxy');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('returns undefined and skips file writes when api mode is not openai', () => {
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    const result = prepareQwencodeConfig(
      '127.0.0.1',
      3000,
      'gemini',
      'key',
      'model',
    );

    expect(result).toBeUndefined();
    expect(fs.existsSync(settingsPath())).toBe(false);
    expect(fs.existsSync(envPath())).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
