import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GlobalConfigService } from '../../src/config/global-config.service';

// Mock os module
jest.mock('os');

describe('GlobalConfig Integration Tests', () => {
  const mockHomedir = '/tmp/test-home';
  const testConfigDir = path.join(mockHomedir, '.gemini-any-llm');
  const testConfigFile = path.join(testConfigDir, 'config.yaml');

  beforeAll(() => {
    // Setup os.homedir mock
    (os.homedir as jest.Mock).mockReturnValue(mockHomedir);
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
  timeout: 30000
gateway:
  port: 3002
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
  timeout: 30000
gateway:
  port: 3002
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
        '.gemini-any-llm/config.yaml',
      );
      expect(result.config!.isValid).toBe(true);
    });
  });

  describe('配置优先级覆盖', () => {
    it('should use project config exclusively when it exists (not merge)', async () => {
      // Arrange - 创建全局配置和项目配置
      fs.mkdirSync(testConfigDir, { recursive: true });
      const globalConfig = `openai:
  apiKey: "sk-global123"
  model: "glm-4.5"
  baseURL: "https://global.example.com"
gateway:
  port: 3002
  logLevel: "info"
`;
      fs.writeFileSync(testConfigFile, globalConfig);

      // 创建项目配置目录和文件（只包含部分字段）
      const projectConfigDir = path.join(process.cwd(), 'config');
      const projectConfigFile = path.join(projectConfigDir, 'config.yaml');
      fs.mkdirSync(projectConfigDir, { recursive: true });
      const projectConfig = `openai:
  apiKey: "sk-project456"
  model: "gpt-4"
gateway:
  port: 3003
`;
      fs.writeFileSync(projectConfigFile, projectConfig);

      try {
        // Act - 应该只使用项目配置，不读取全局配置
        // Use direct import instead of dynamic import
        const configService = new GlobalConfigService();
        const result = configService.loadGlobalConfig();

        // Assert - 验证完全使用项目配置，未设置的字段使用默认值
        expect(result.config!.openai.apiKey).toBe('sk-project456'); // 项目配置值
        expect(result.config!.openai.model).toBe('gpt-4'); // 项目配置值
        expect(result.config!.openai.baseURL).toBe(
          'https://open.bigmodel.cn/api/paas/v4',
        ); // 默认值（不是全局配置值）
        expect(result.config!.gateway.port).toBe(3003); // 项目配置值
        expect(result.config!.configSource).toContain('config/config.yaml'); // 项目配置路径
      } finally {
        // Clean up project config
        if (fs.existsSync(projectConfigFile)) {
          fs.rmSync(projectConfigFile);
        }
        if (fs.existsSync(projectConfigDir)) {
          fs.rmSync(projectConfigDir, { recursive: true });
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
  port: 3002
`;
      fs.writeFileSync(testConfigFile, globalConfig);

      // Act - 应该使用全局配置
      const configService = new GlobalConfigService();
      const result = configService.loadGlobalConfig();

      // Assert - 验证使用全局配置
      expect(result.config!.openai.apiKey).toBe('sk-global123');
      expect(result.config!.openai.model).toBe('glm-4.5');
      expect(result.config!.gateway.port).toBe(3002);
      expect(result.config!.configSource).toContain(
        '.gemini-any-llm/config.yaml',
      );
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
    timeout: 30000  # 缩进错误
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
