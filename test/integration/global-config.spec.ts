import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GlobalConfigService } from '../../src/config/global-config.service';

// Mock os module
jest.mock('os');

describe('GlobalConfig Integration Tests', () => {
  const mockHomedir = '/tmp/test-home';
  const testConfigDir = path.join(mockHomedir, '.code-cli-any-llm');
  const testConfigFile = path.join(testConfigDir, 'config.yaml');
  let originalEnv: any;

  beforeAll(() => {
    // Setup os.homedir mock
    (os.homedir as jest.Mock).mockReturnValue(mockHomedir);
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  beforeEach(() => {
    // Clean up test directory before each test
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
    // Also clean up any project config
    const projectConfigDir = path.join(process.cwd(), 'config');
    const projectConfigFile = path.join(projectConfigDir, 'config.yaml');
    if (fs.existsSync(projectConfigFile)) {
      fs.rmSync(projectConfigFile, { force: true });
    }
    // Clear environment variables for each test to ensure isolation
    delete process.env.CAL_OPENAI_API_KEY;
    delete process.env.CAL_OPENAI_BASE_URL;
    delete process.env.CAL_OPENAI_MODEL;
    delete process.env.CAL_OPENAI_TIMEOUT;
    delete process.env.CAL_PORT;
    delete process.env.CAL_HOST;
    delete process.env.CAL_LOG_LEVEL;
    delete process.env.CAL_GATEWAY_LOG_DIR;
  });

  afterEach(() => {
    // Clean up test directory after each test
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
    // Also clean up any project config
    const projectConfigDir = path.join(process.cwd(), 'config');
    const projectConfigFile = path.join(projectConfigDir, 'config.yaml');
    if (fs.existsSync(projectConfigFile)) {
      fs.rmSync(projectConfigFile, { force: true });
    }
  });

  describe('配置文件不存在时自动创建', () => {
    it('should create config directory and template file when config does not exist', async () => {
      // Arrange - 确保配置文件不存在
      expect(fs.existsSync(testConfigFile)).toBe(false);

      // Act - 加载全局配置，应该自动创建文件
      // Use direct import instead of dynamic import
      const configService = new GlobalConfigService();
      const result = configService.loadGlobalConfig();

      // Assert - 验证配置文件自动创建
      expect(fs.existsSync(testConfigDir)).toBe(true);
      expect(fs.existsSync(testConfigFile)).toBe(true);

      // 验证配置文件内容包含默认模板
      const configContent = fs.readFileSync(testConfigFile, 'utf8');
      expect(configContent).toContain('apiKey: ""');
      expect(configContent).toContain(
        'baseURL: "https://open.bigmodel.cn/api/paas/v4"',
      );
      expect(configContent).toContain('model: "glm-4.5"');

      // 验证返回的验证结果指示apiKey为空
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('openai.apiKey');
      expect(result.errors[0].required).toBe(true);
    });
  });

  describe('apiKey验证', () => {
    it('should fail validation when apiKey is empty', async () => {
      // Arrange - 创建apiKey为空的配置文件
      fs.mkdirSync(testConfigDir, { recursive: true });
      const emptyApiKeyConfig = `openai:
  apiKey: ""
  baseURL: "https://open.bigmodel.cn/api/paas/v4"
  model: "glm-4.5"
  timeout: 1800000
gateway:
  port: 23062
  host: "0.0.0.0"
  logLevel: "info"
`;
      fs.writeFileSync(testConfigFile, emptyApiKeyConfig);

      // Act - 加载配置
      // Use direct import instead of dynamic import
      const configService = new GlobalConfigService();
      const result = configService.loadGlobalConfig();

      // Assert - 验证apiKey为空时验证失败
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('openai.apiKey');
      expect(result.errors[0].message).toContain('API密钥为空');
      expect(result.errors[0].required).toBe(true);
      expect(result.errors[0].suggestion).toContain(
        '请在配置文件中设置有效的API密钥',
      );
    });
  });

  describe('有效配置正常启动', () => {
    it('should load valid configuration successfully', async () => {
      // Arrange - 创建有效的配置文件
      fs.mkdirSync(testConfigDir, { recursive: true });
      const validConfig = `openai:
  apiKey: "sk-test123456789"
  baseURL: "https://open.bigmodel.cn/api/paas/v4"
  model: "glm-4.5"
  timeout: 1800000
gateway:
  port: 23062
  host: "0.0.0.0"
  logLevel: "info"
`;
      fs.writeFileSync(testConfigFile, validConfig);

      // Act - 加载配置
      // Use direct import instead of dynamic import
      const configService = new GlobalConfigService();
      const result = configService.loadGlobalConfig();

      // Assert - 验证配置加载成功
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.config).toBeDefined();
      expect(result.config!.openai.apiKey).toBe('sk-test123456789');
      expect(result.config!.openai.baseURL).toBe(
        'https://open.bigmodel.cn/api/paas/v4',
      );
      expect(result.config!.openai.model).toBe('glm-4.5');
      expect(result.config!.configSource).toContain(
        '.code-cli-any-llm/config.yaml',
      );
      expect(result.config!.isValid).toBe(true);
    });
  });

  describe('配置优先级覆盖', () => {
    it('should merge project config over global config with field-level priority', async () => {
      // Arrange - 创建全局配置和项目配置
      fs.mkdirSync(testConfigDir, { recursive: true });
      const globalConfig = `openai:
  apiKey: "sk-global123"
  model: "glm-4.5"
  baseURL: "https://global.example.com"
gateway:
  port: 23062
  logLevel: "info"
  host: "0.0.0.0"
`;
      fs.writeFileSync(testConfigFile, globalConfig);

      const projectConfigDir = path.join(process.cwd(), 'config');
      const projectConfigFile = path.join(projectConfigDir, 'config.yaml');

      // 备份现有配置文件（如果存在）
      const backupConfigFile = projectConfigFile + '.backup';
      let hadExistingConfig = false;
      let hadExistingDir = false;

      if (fs.existsSync(projectConfigFile)) {
        fs.copyFileSync(projectConfigFile, backupConfigFile);
        hadExistingConfig = true;
      }

      if (fs.existsSync(projectConfigDir)) {
        hadExistingDir = true;
      } else {
        fs.mkdirSync(projectConfigDir, { recursive: true });
      }

      const projectConfig = `openai:
  model: "gpt-4"  # 覆盖全局配置
  timeout: 1800000  # 新增字段
gateway:
  port: 3003  # 覆盖全局配置
`;
      fs.writeFileSync(projectConfigFile, projectConfig);

      try {
        // Act - 应该使用字段级合并：项目配置 > 全局配置 > 环境变量
        const configService = new GlobalConfigService();
        const result = configService.loadGlobalConfig();

        // Assert - 验证字段级合并
        expect(result.config!.openai.apiKey).toBe('sk-global123'); // 全局配置值（项目配置中未指定）
        expect(result.config!.openai.model).toBe('gpt-4'); // 项目配置值（覆盖全局配置）
        expect(result.config!.openai.baseURL).toBe(
          'https://global.example.com',
        ); // 全局配置值（项目配置中未指定）
        expect(result.config!.openai.timeout).toBe(1800000); // 项目配置值（新增字段）
        expect(result.config!.gateway.port).toBe(3003); // 项目配置值（覆盖全局配置）
        expect(result.config!.gateway.host).toBe('0.0.0.0'); // 全局配置值（项目配置中未指定）
        expect(result.config!.gateway.logLevel).toBe('info'); // 全局配置值（项目配置中未指定）
        expect(result.config!.configSource).toContain('config/config.yaml'); // 项目配置路径
      } finally {
        // 恢复原始状态
        if (hadExistingConfig) {
          fs.copyFileSync(backupConfigFile, projectConfigFile);
          fs.rmSync(backupConfigFile);
        } else {
          if (fs.existsSync(projectConfigFile)) {
            fs.rmSync(projectConfigFile);
          }
        }

        // 只在测试创建目录的情况下删除目录
        if (!hadExistingDir) {
          try {
            if (fs.existsSync(projectConfigDir)) {
              const dirContents = fs.readdirSync(projectConfigDir);
              if (dirContents.length === 0) {
                fs.rmSync(projectConfigDir);
              }
            }
          } catch (error) {
            // Directory not empty or other error, skip removal
          }
        }
      }
    });

    it('should use global config when project config does not exist', async () => {
      // Arrange - 只创建全局配置
      fs.mkdirSync(testConfigDir, { recursive: true });
      const globalConfig = `openai:
  apiKey: "sk-global123"
  model: "glm-4.5"
gateway:
  port: 23062
`;
      fs.writeFileSync(testConfigFile, globalConfig);

      // Act - 应该使用全局配置
      const configService = new GlobalConfigService();
      const result = configService.loadGlobalConfig();

      // Assert - 验证使用全局配置
      expect(result.config!.openai.apiKey).toBe('sk-global123');
      expect(result.config!.openai.model).toBe('glm-4.5');
      expect(result.config!.gateway.port).toBe(23062);
      expect(result.config!.configSource).toContain(
        '.code-cli-any-llm/config.yaml',
      );
    });

    it('should use environment variables as lowest priority fallback', async () => {
      // Arrange - 设置环境变量
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        OPENAI_API_KEY: 'sk-env-key',
        OPENAI_MODEL: 'gpt-3.5-turbo',
        PORT: '3001',
        LOG_LEVEL: 'debug',
      };

      // 创建全局配置（覆盖部分环境变量）
      fs.mkdirSync(testConfigDir, { recursive: true });
      const globalConfig = `openai:
  apiKey: "sk-global123"  # 覆盖环境变量
  model: "glm-4.5"        # 覆盖环境变量
gateway:
  port: 23062  # 覆盖环境变量
  # logLevel 未指定，应该使用环境变量的 'debug'
`;
      fs.writeFileSync(testConfigFile, globalConfig);

      try {
        // Act - 应该使用环境变量作为最低优先级
        const configService = new GlobalConfigService();
        const result = configService.loadGlobalConfig();

        // Assert - 验证环境变量作为fallback
        expect(result.config!.openai.apiKey).toBe('sk-global123'); // 全局配置覆盖环境变量
        expect(result.config!.openai.model).toBe('glm-4.5'); // 全局配置覆盖环境变量
        expect(result.config!.gateway.port).toBe(23062); // 全局配置覆盖环境变量
        expect(result.config!.gateway.logLevel).toBe('debug'); // 环境变量值（全局配置中未指定）
        expect(result.config!.configSource).toContain(
          '.code-cli-any-llm/config.yaml',
        );
      } finally {
        // 恢复环境变量
        process.env = originalEnv;
      }
    });
  });

  describe('YAML格式错误处理', () => {
    it('should provide friendly error messages for YAML syntax errors', async () => {
      // Arrange - 创建格式错误的配置文件
      fs.mkdirSync(testConfigDir, { recursive: true });
      const invalidYamlConfig = `openai:
  apiKey: "sk-test123"
  baseURL: "https://open.bigmodel.cn/api/paas/v4"
  model: glm-4.5    # 缺少引号，格式错误
    timeout: 1800000  # 缩进错误
`;
      fs.writeFileSync(testConfigFile, invalidYamlConfig);

      // Act - 加载配置
      // Use direct import instead of dynamic import
      const configService = new GlobalConfigService();
      const result = configService.loadGlobalConfig();

      // Assert - 验证YAML格式错误时的友好提示
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('config');
      expect(result.errors[0].message).toContain('配置文件加载失败');
      expect(result.errors[0].suggestion).toContain(
        '请检查配置文件格式是否正确',
      );
    });
  });
});
