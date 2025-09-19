import { isNewerVersion } from '@/cli/update-checker';

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
