# Quickstart: 全局配置文件功能验证

## 功能验证场景

### 场景1: 首次启动 - 自动创建配置文件
**目标**: 验证系统能够自动创建配置模板并提供用户指导

**前置条件**:
```bash
# 确保全局配置文件不存在
rm -rf ~/.code-cli-any-llm/
```

**执行步骤**:
```bash
1. cd /path/to/code-cli-any-llm
2. pnpm run start:dev
```

**预期结果**:
- 应用启动失败并显示友好提示信息
- 自动创建 `~/.code-cli-any-llm/config.yaml` 文件
- 提示信息包含:
  - 配置文件位置
  - 需要配置的字段(apiKey)
  - 配置示例和说明

**验证命令**:
```bash
# 检查配置文件是否创建
ls -la ~/.code-cli-any-llm/config.yaml

# 查看配置文件内容
cat ~/.code-cli-any-llm/config.yaml
```

**成功标准**:
- ✅ 配置目录和文件成功创建
- ✅ 配置文件包含所有必需字段
- ✅ apiKey字段为空值
- ✅ 其他字段有合理默认值
- ✅ 包含清晰的注释说明

### 场景2: API Key缺失 - 验证和指导
**目标**: 验证apiKey验证逻辑和用户指导功能

**前置条件**:
```bash
# 确保配置文件存在但apiKey为空
cat > ~/.code-cli-any-llm/config.yaml << EOF
openai:
  apiKey: ""
  baseURL: "https://open.bigmodel.cn/api/paas/v4"
  model: "glm-4.5"
  timeout: 1800000
gateway:
  port: 23062
  host: "0.0.0.0"
  logLevel: "info"
EOF
```

**执行步骤**:
```bash
pnpm run start:dev
```

**预期结果**:
- 应用启动失败
- 显示清晰的apiKey缺失错误信息
- 提供配置指导和解决方案
- 退出代码为非0

**成功标准**:
- ✅ 检测到apiKey为空
- ✅ 显示具体的错误信息
- ✅ 提供配置文件路径和编辑指导
- ✅ 应用优雅退出(非崩溃)

### 场景3: 有效配置 - 正常启动
**目标**: 验证有效配置下的正常启动流程

**前置条件**:
```bash
# 设置有效的配置文件
cat > ~/.code-cli-any-llm/config.yaml << EOF
openai:
  apiKey: "sk-test123456789"
  baseURL: "https://open.bigmodel.cn/api/paas/v4"
  model: "glm-4.5"
  timeout: 1800000
gateway:
  port: 23062
  host: "0.0.0.0"
  logLevel: "info"
EOF
```

**执行步骤**:
```bash
pnpm run start:dev
```

**预期结果**:
- 应用成功启动
- 启动日志显示配置来源信息
- 服务在指定端口监听

**验证命令**:
```bash
# 检查服务是否启动
curl http://localhost:23062/api/v1/health
```

**成功标准**:
- ✅ 应用成功启动无错误
- ✅ 配置被正确加载和使用
- ✅ 启动日志显示配置来源
- ✅ 健康检查接口可访问

### 场景4: 配置覆盖 - 项目配置优先
**目标**: 验证项目配置覆盖全局配置的逻辑

**前置条件**:
```bash
# 全局配置
cat > ~/.code-cli-any-llm/config.yaml << EOF
openai:
  apiKey: "sk-global123"
  model: "glm-4.5"
gateway:
  port: 23062
EOF

# 项目配置(部分覆盖)
cat > ./config/config.yaml << EOF
openai:
  apiKey: "sk-project456"
  model: "gpt-4"
gateway:
  port: 3003
EOF
```

**执行步骤**:
```bash
pnpm run start:dev
```

**预期结果**:
- 使用项目配置的值(apiKey: sk-project456, model: gpt-4, port: 3003)
- 未覆盖的字段使用全局配置默认值
- 启动日志显示配置合并信息

**成功标准**:
- ✅ 项目配置正确覆盖全局配置
- ✅ 未指定字段使用全局默认值
- ✅ 配置来源信息正确显示

### 场景5: 格式错误处理 - 友好错误提示
**目标**: 验证YAML格式错误的处理和提示

**前置条件**:
```bash
# 创建格式错误的配置文件
cat > ~/.code-cli-any-llm/config.yaml << EOF
openai:
  apiKey: "sk-test123"
  baseURL: "https://open.bigmodel.cn/api/paas/v4"
  model: glm-4.5    # 缺少引号，格式错误
    timeout: 1800000        # 缩进错误
EOF
```

**执行步骤**:
```bash
pnpm run start:dev
```

**预期结果**:
- 应用启动失败
- 显示具体的YAML语法错误信息
- 提供行号和错误位置
- 提供修复建议

**成功标准**:
- ✅ 检测到YAML格式错误
- ✅ 显示具体错误位置(行号)
- ✅ 提供清晰的修复指导
- ✅ 应用优雅退出

## 自动化测试验证

### 单元测试运行
```bash
# 运行全局配置相关的单元测试
pnpm test -- --testNamePattern="GlobalConfig"
```

**预期结果**:
- 所有测试用例通过
- 覆盖率 > 90%

### 集成测试运行
```bash
# 运行集成测试
pnpm test -- test/integration/global-config.spec.ts
```

**预期结果**:
- 所有集成测试场景通过
- 实际文件系统操作正常

### 端到端验证
```bash
# 完整的启动验证流程
./scripts/validate-global-config.sh
```

**预期结果**:
- 所有验证场景自动化通过
- 无手动干预需求

## 性能验证

### 启动时间测量
```bash
# 测量配置加载对启动时间的影响
time pnpm run start:dev --timeout 10s
```

**性能目标**:
- 配置加载增加的启动时间 < 50ms
- 内存使用增加 < 1MB

### 配置文件大小测试
```bash
# 测试较大配置文件的处理
dd if=/dev/zero bs=1024 count=10 >> ~/.code-cli-any-llm/config.yaml
pnpm run start:dev
```

**预期行为**:
- 优雅处理异常大小的配置文件
- 显示合理的错误信息

## 清理和重置

### 环境清理
```bash
# 清理测试环境
rm -rf ~/.code-cli-any-llm/
rm -f ./config/config.yaml
```

### 恢复原始状态
```bash
# 恢复原始配置
git checkout -- config/config.yaml
```

## 故障排查

### 常见问题检查清单
1. **权限问题**:
   ```bash
   ls -la ~/.code-cli-any-llm/
   whoami
   ```

2. **路径问题**:
   ```bash
   echo $HOME
   pwd
   ```

3. **YAML语法检查**:
   ```bash
   python -c "import yaml; yaml.safe_load(open('~/.code-cli-any-llm/config.yaml'))"
   ```

4. **进程检查**:
   ```bash
   ps aux | grep node
   netstat -tlnp | grep 23062
   ```

### 日志位置
- 应用日志: 控制台输出
- 配置加载日志: 启动时显示
- 错误日志: stderr输出

## 验收标准总结

### 功能验收:
- ✅ 自动创建配置文件功能正常
- ✅ 配置验证和错误提示清晰
- ✅ 有效配置下正常启动
- ✅ 配置优先级逻辑正确
- ✅ 错误处理用户友好

### 性能验收:
- ✅ 启动时间增加 < 50ms
- ✅ 内存使用合理
- ✅ 配置文件读取 < 10ms

### 可用性验收:
- ✅ 错误信息用户友好
- ✅ 配置指导清晰完整
- ✅ 无需专业知识即可配置
- ✅ 支持跨平台使用
