# Research: 全局配置文件读取功能

## Task 1: Node.js跨平台home目录获取最佳实践

### Decision: 使用 `os.homedir()`
Node.js内置的 `os.homedir()` 方法是获取用户home目录的标准方式。

### Rationale:
- **跨平台兼容**: 自动处理Windows (%USERPROFILE%), Linux/macOS ($HOME)
- **官方标准**: Node.js官方推荐的API
- **健壮性**: 内置错误处理，比环境变量更可靠
- **性能**: 原生实现，性能最佳

### Alternatives considered:
- `process.env.HOME || process.env.USERPROFILE` - 需要手动处理跨平台差异，容错性差
- `process.env.USERPROFILE || process.env.HOME` - Windows优先，但在某些环境下可能不存在

## Task 2: YAML配置文件的错误处理和用户友好提示模式

### Decision: 结构化错误处理 + 用户指导
使用try-catch包装js-yaml操作，提供详细的错误分类和解决指导。

### Rationale:
- **用户友好**: 将技术错误转换为可操作的提示
- **错误分类**: 区分文件不存在、权限问题、格式错误等不同场景
- **自动修复**: 对于某些错误(如文件不存在)提供自动修复选项
- **渐进式提示**: 从简单到详细的错误信息层次

### Error Handling Strategy:
```
文件不存在 → 自动创建 + 配置指导
权限错误 → 权限检查指导 + 替代方案
YAML格式错误 → 具体行号 + 修复建议
字段缺失 → 默认值填充 + 用户提醒
值无效 → 验证规则说明 + 正确示例
```

### Alternatives considered:
- 简单错误抛出 - 用户体验差，难以定位问题
- 忽略错误继续运行 - 可能导致运行时问题

## Task 3: NestJS应用启动时的配置加载和验证最佳实践

### Decision: Bootstrap阶段配置验证 + 优雅失败
在应用bootstrap之前进行配置加载和验证，验证失败时优雅退出并提供清晰指导。

### Rationale:
- **早期验证**: 在应用启动前发现配置问题，避免运行时错误
- **优雅退出**: 配置问题时显示用户友好信息后退出，而非崩溃
- **快速反馈**: 用户立即了解配置问题，缩短问题解决周期
- **最小依赖**: 在NestJS容器初始化前完成，避免循环依赖

### Implementation Pattern:
```typescript
async function bootstrap() {
  // 1. 全局配置加载和验证
  const globalConfig = await loadAndValidateGlobalConfig();

  // 2. 配置验证失败 - 优雅退出
  if (!globalConfig.isValid) {
    console.error(globalConfig.errorMessage);
    process.exit(1);
  }

  // 3. 配置有效 - 继续启动NestJS应用
  const app = await NestFactory.create(AppModule);
  // ...
}
```

### Alternatives considered:
- ConfigModule中加载 - 启动后才发现问题，用户体验差
- 忽略验证 - 可能导致运行时崩溃
- 运行时动态加载 - 增加复杂性，性能影响

## Implementation Architecture

### Core Components:
1. **GlobalConfigService**: 配置文件的读取、创建、验证核心逻辑
2. **ConfigValidator**: 配置字段验证和默认值处理
3. **UserGuidance**: 错误提示和用户指导信息生成

### Data Flow:
```
启动 → 检查配置文件 → 不存在?创建模板 → 读取配置 → 验证字段 →
成功?继续启动 : 显示指导+退出
```

### File Structure:
```
~/.gemini-any-llm/
└── config.yaml          # 用户全局配置文件

项目/config/
└── config.yaml          # 项目本地配置(优先级更高)
```

### Error Recovery Strategy:
- **文件不存在**: 自动创建目录和模板文件
- **权限问题**: 提供sudo/管理员权限指导
- **格式错误**: 显示YAML语法检查结果
- **字段验证失败**: 显示具体字段要求和示例

## Performance Considerations

### 加载性能优化:
- **同步操作**: 配置文件小(< 1KB)，使用同步IO避免复杂性
- **缓存策略**: 启动时加载一次，运行期间不重复读取
- **最小依赖**: 只依赖Node.js内置模块和现有js-yaml

### 预期性能指标:
- 配置文件读取: < 5ms
- 配置验证: < 2ms
- 错误处理: < 1ms
- 总启动开销: < 10ms

## Security Considerations

### 文件权限:
- 创建的配置目录权限: 700 (仅用户可访问)
- 配置文件权限: 600 (仅用户可读写)
- apiKey敏感信息保护

### 路径安全:
- 使用path.join()防止路径注入
- 验证配置目录在用户home目录内
- 不执行配置文件内容作为代码

## Configuration Schema

### 默认配置模板:
```yaml
# Global configuration for gemini-any-llm
# Edit this file to configure your default API settings

# API Configuration (REQUIRED)
openai:
  # Your API key - REQUIRED, get it from your provider
  apiKey: ""

  # API endpoint - can customize for different providers
  baseURL: "https://open.bigmodel.cn/api/paas/v4"

  # Default model to use
  model: "glm-4.5"

  # Request timeout in milliseconds
  timeout: 30000

# Gateway Configuration
gateway:
  port: 23062
  host: "0.0.0.0"
  logLevel: "info"
```

### 验证规则:
- `openai.apiKey`: 非空字符串，必须字段
- `openai.baseURL`: 有效URL格式
- `openai.model`: 非空字符串
- `openai.timeout`: 正整数，范围1000-120000
- `gateway.*`: 使用现有验证逻辑