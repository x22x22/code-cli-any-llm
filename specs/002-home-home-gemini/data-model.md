# Data Model: 全局配置文件读取功能

## Core Entities

### GlobalConfig
全局配置对象，包含所有配置字段和元数据。

**Fields:**
- `openai: OpenAIConfig` - OpenAI API配置
- `gateway: GatewayConfig` - 网关服务配置
- `configSource: string` - 配置来源路径
- `isValid: boolean` - 配置是否有效

**Validation Rules:**
- openai字段必须存在且有效
- gateway字段可选，使用默认值
- configSource必须是有效文件路径

**State Transitions:**
```
未加载 → 读取文件 → 解析YAML → 验证字段 → 有效/无效
```

### OpenAIConfig
OpenAI API相关配置。

**Fields:**
- `apiKey: string` - API密钥 (必需，非空)
- `baseURL: string` - API端点URL (默认值)
- `model: string` - 默认模型名称 (默认值)
- `timeout: number` - 请求超时时间 (默认值)

**Validation Rules:**
- apiKey: 非空字符串，必须字段
- baseURL: 有效URL格式，默认 "https://open.bigmodel.cn/api/paas/v4"
- model: 非空字符串，默认 "glm-4.5"
- timeout: 正整数，范围1000-120000，默认30000

**Default Values:**
```typescript
{
  apiKey: "", // 必须用户填写
  baseURL: "https://open.bigmodel.cn/api/paas/v4",
  model: "glm-4.5",
  timeout: 30000
}
```

### GatewayConfig
网关服务配置，继承现有结构。

**Fields:**
- `port: number` - 服务端口 (默认3002)
- `host: string` - 绑定地址 (默认"0.0.0.0")
- `logLevel: string` - 日志级别 (默认"info")

**Validation Rules:**
- port: 正整数，范围1-65535
- host: 有效IP地址或主机名
- logLevel: 枚举值 ["debug", "info", "warn", "error"]

### ConfigValidationResult
配置验证结果对象。

**Fields:**
- `isValid: boolean` - 验证是否通过
- `errors: ConfigError[]` - 验证错误列表
- `warnings: string[]` - 警告信息列表
- `config?: GlobalConfig` - 验证通过的配置对象

**Business Logic:**
- isValid为true时，config字段必须存在
- isValid为false时，errors数组不为空
- warnings可以在验证通过时存在

### ConfigError
配置错误详情对象。

**Fields:**
- `field: string` - 错误字段路径 (如"openai.apiKey")
- `message: string` - 错误描述
- `suggestion: string` - 修复建议
- `required: boolean` - 是否为必需字段

**Error Types:**
- 必需字段缺失: `required: true`
- 格式验证失败: `required: false`
- 值范围错误: `required: false`

### DefaultConfigTemplate
默认配置模板，用于创建新配置文件。

**Fields:**
- `template: string` - YAML格式的配置模板
- `comments: boolean` - 是否包含注释说明

**Template Content:**
```yaml
# Global configuration for gemini-any-llm
openai:
  apiKey: ""
  baseURL: "https://open.bigmodel.cn/api/paas/v4"
  model: "glm-4.5"
  timeout: 30000

gateway:
  port: 3002
  host: "0.0.0.0"
  logLevel: "info"
```

## Configuration File Hierarchy

### Loading Priority:
1. **项目配置** (`./config/config.yaml`) - 最高优先级
2. **全局配置** (`~/.gemini-any-llm/config.yaml`) - 默认配置
3. **内置默认值** - 兜底配置

### Merge Strategy:
- 项目配置完全覆盖全局配置的对应字段
- 未在项目配置中指定的字段使用全局配置值
- 全局配置缺失的字段使用内置默认值
- apiKey字段必须在某个层级中提供非空值

## File System Structure

### Global Config Directory:
```
~/.gemini-any-llm/
├── config.yaml          # 主配置文件
└── .gitignore           # 忽略临时文件(可选)
```

### File Permissions:
- Directory: 755 (rwxr-xr-x) - 用户完全控制，其他用户可读
- Config file: 644 (rw-r--r--) - 用户读写，其他用户只读
- 包含敏感信息时自动设为600 (rw-------)

### File Location Resolution:
```typescript
// 全局配置路径解析
const homeDir = os.homedir();
const configDir = path.join(homeDir, '.gemini-any-llm');
const configFile = path.join(configDir, 'config.yaml');

// 项目配置路径解析
const projectConfig = path.join(process.cwd(), 'config', 'config.yaml');
```

## Error Handling Model

### Error Categories:
1. **FileSystemError**: 文件系统访问错误
   - 权限不足
   - 目录不存在
   - 磁盘空间不足

2. **ParseError**: YAML解析错误
   - 语法错误
   - 编码问题
   - 文件损坏

3. **ValidationError**: 配置验证错误
   - 必需字段缺失
   - 字段类型错误
   - 值范围错误

4. **NetworkError**: 网络相关错误
   - URL格式错误
   - 连接测试失败

### Recovery Actions:
- FileSystemError → 自动创建目录/文件模板
- ParseError → 显示具体错误位置和修复建议
- ValidationError → 显示字段要求和示例
- NetworkError → 提供网络诊断建议

## Relationships

### Service Dependencies:
```
GlobalConfigService → ConfigValidator → OpenAIConfig
                   → FileSystemHelper → os.homedir()
                   → YamlParser → js-yaml
```

### Data Flow:
```
启动 → GlobalConfigService.load()
     → 检查文件存在性
     → 读取文件内容
     → YAML解析
     → 配置验证
     → 合并默认值
     → 返回GlobalConfig
```

### Integration Points:
- **现有ConfigModule**: 全局配置作为默认值输入
- **应用启动**: main.ts中在NestJS启动前验证配置
- **Logger**: 使用NestJS Logger记录配置加载过程