import { promises as fsPromises } from 'node:fs';

import {
  isNewerVersion,
  refreshVersionInfoImmediate,
} from '@/cli/update-checker';

describe('isNewerVersion', () => {
  it('忽略预发布版本比较', () => {
    expect(isNewerVersion('0.11.0-beta.1', '0.11.0')).toBe(false);
    expect(isNewerVersion('1.0.0-rc.1', '1.0.0')).toBe(false);
  });

  it('正确比较主版本、次版本和补丁版本', () => {
    expect(isNewerVersion('0.11.1', '0.11.0')).toBe(true);
    expect(isNewerVersion('0.11.0', '0.11.1')).toBe(false);
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.9.9', '1.0.0')).toBe(false);
  });

  it('忽略前后空白字符', () => {
    expect(isNewerVersion(' 1.2.3 ', '1.2.2')).toBe(true);
    expect(isNewerVersion('1.2.2', ' 1.2.3 ')).toBe(false);
  });
});

describe('refreshVersionInfoImmediate', () => {
  const originalFetch = globalThis.fetch;
  const originalRegistry = process.env.npm_config_registry;

  afterEach(() => {
    jest.restoreAllMocks();
    globalThis.fetch = originalFetch;
    if (originalRegistry === undefined) {
      delete process.env.npm_config_registry;
    } else {
      process.env.npm_config_registry = originalRegistry;
    }
  });

  it('请求最新版本时使用当前包名', async () => {
    const enoent = Object.assign(new Error('not found'), {
      code: 'ENOENT',
    });

    jest.spyOn(fsPromises, 'readFile').mockRejectedValue(enoent);
    jest.spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined as never);
    const writeFileSpy = jest
      .spyOn(fsPromises, 'writeFile')
      .mockResolvedValue(undefined as never);

    process.env.npm_config_registry = 'https://registry.example.com/';

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '9.9.9' }),
    } as Response);

    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const info = await refreshVersionInfoImmediate();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://registry.example.com/@kdump%2fcode-cli-any-llm/latest',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'code-cli-any-llm-cli',
        }),
      }),
    );
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('version.json'),
      expect.stringContaining('"latestVersion":"9.9.9"'),
      'utf8',
    );
    expect(info?.latestVersion).toBe('9.9.9');
  });
});
