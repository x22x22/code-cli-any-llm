# Tasks: 全局配置文件读取功能

**Feature**: 全局配置文件读取功能
**Branch**: `002-home-home-gemini`
**Generated**: 2025-01-16
**Approach**: TDD + 最小代码量实现

## 任务执行顺序

### Phase 1: 项目准备 (Setup)

**T001**: 创建配置服务接口和基础类型定义
- **Description**: 定义GlobalConfig、OpenAIConfig等接口和基础类型
- **Files**: `src/config/global-config.interface.ts`
- **Dependencies**: 无
- **Acceptance**: TypeScript编译通过，接口定义清晰
- **Duration**: 15min

**T002**: 创建全局配置测试目录结构
- **Description**: 创建测试文件结构，准备测试环境
- **Files**: `test/integration/global-config.spec.ts`, `test/unit/global-config.service.spec.ts`
- **Dependencies**: T001
- **Acceptance**: 测试目录和基础测试框架准备就绪
- **Duration**: 10min

### Phase 2: 核心TDD开发 (Core TDD)

**T003**: [RED] 配置文件不存在时自动创建的失败测试
- **Description**: 编写测试验证配置文件不存在时能够自动创建模板，测试必须失败
- **Test Scenario**: quickstart.md场景1
- **Files**: `test/integration/global-config.spec.ts`
- **Dependencies**: T002
- **Acceptance**: 测试运行失败（RED状态），错误信息清晰
- **Duration**: 20min

**T004**: [GREEN] 实现配置文件自动创建功能
- **Description**: 实现GlobalConfigService的文件创建逻辑，使T003测试通过
- **Files**: `src/config/global-config.service.ts`
- **Dependencies**: T003
- **Acceptance**: T003测试通过，配置文件创建功能正常
- **Duration**: 30min

**T005**: [RED] apiKey验证失败测试
- **Description**: 编写测试验证apiKey为空时应用启动失败，测试必须失败
- **Test Scenario**: quickstart.md场景2
- **Files**: `test/integration/global-config.spec.ts`
- **Dependencies**: T004
- **Acceptance**: 测试运行失败（RED状态），验证逻辑缺失
- **Duration**: 15min

**T006**: [GREEN] 实现apiKey验证和启动失败逻辑
- **Description**: 实现配置验证逻辑，apiKey为空时优雅退出
- **Files**: `src/config/global-config.service.ts`
- **Dependencies**: T005
- **Acceptance**: T005测试通过，验证逻辑正确
- **Duration**: 25min

**T007**: [RED] 有效配置正常启动测试
- **Description**: 编写测试验证有效配置下应用正常启动，测试必须失败
- **Test Scenario**: quickstart.md场景3
- **Files**: `test/integration/global-config.spec.ts`
- **Dependencies**: T006
- **Acceptance**: 测试运行失败（RED状态），集成逻辑缺失
- **Duration**: 20min

**T008**: [GREEN] 实现配置加载和应用启动集成
- **Description**: 在main.ts中集成全局配置加载，实现启动流程
- **Files**: `src/main.ts`, `src/config/global-config.service.ts`
- **Dependencies**: T007
- **Acceptance**: T007测试通过，启动流程正确
- **Duration**: 35min

**T009**: [RED] 配置优先级覆盖测试
- **Description**: 编写测试验证项目配置覆盖全局配置的逻辑，测试必须失败
- **Test Scenario**: quickstart.md场景4
- **Files**: `test/integration/global-config.spec.ts`
- **Dependencies**: T008
- **Acceptance**: 测试运行失败（RED状态），优先级逻辑缺失
- **Duration**: 25min

**T010**: [GREEN] 实现配置合并和优先级逻辑
- **Description**: 实现项目配置覆盖全局配置的合并逻辑
- **Files**: `src/config/global-config.service.ts`
- **Dependencies**: T009
- **Acceptance**: T009测试通过，配置优先级正确
- **Duration**: 30min

**T011**: [RED] YAML格式错误处理测试
- **Description**: 编写测试验证YAML格式错误时的友好提示，测试必须失败
- **Test Scenario**: quickstart.md场景5
- **Files**: `test/integration/global-config.spec.ts`
- **Dependencies**: T010
- **Acceptance**: 测试运行失败（RED状态），错误处理缺失
- **Duration**: 20min

**T012**: [GREEN] 实现YAML错误处理和用户指导
- **Description**: 实现YAML解析错误处理，提供清晰的错误信息和修复建议
- **Files**: `src/config/global-config.service.ts`
- **Dependencies**: T011
- **Acceptance**: T011测试通过，错误处理用户友好
- **Duration**: 25min

### Phase 3: 集成和优化 (Integration & Refinement)

**T013**: 添加配置加载性能测试
- **Description**: 验证配置加载性能符合<10ms要求
- **Files**: `test/integration/global-config.spec.ts`
- **Dependencies**: T012
- **Acceptance**: 性能测试通过，加载时间<10ms
- **Duration**: 15min

**T014**: 实现配置来源日志记录
- **Description**: 在启动时显示配置来源信息，使用NestJS Logger
- **Files**: `src/config/global-config.service.ts`, `src/main.ts`
- **Dependencies**: T013
- **Acceptance**: 启动日志显示配置文件路径和来源
- **Duration**: 20min

**T015**: 完善单元测试覆盖率
- **Description**: 补充单元测试，确保覆盖率>90%
- **Files**: `test/unit/global-config.service.spec.ts`
- **Dependencies**: T014
- **Acceptance**: 单元测试覆盖率>90%，所有边界条件测试
- **Duration**: 30min

### Phase 4: 验证和收尾 (Validation & Polish)

**T016**: 运行完整测试套件验证
- **Description**: 运行所有测试确保无回归，验证quickstart场景
- **Files**: All test files
- **Dependencies**: T015
- **Acceptance**: 所有测试通过，无ESLint错误
- **Duration**: 15min

**T017**: 更新CLAUDE.md文档
- **Description**: 更新项目文档，添加全局配置功能说明
- **Files**: `CLAUDE.md`
- **Dependencies**: T016
- **Acceptance**: 文档准确描述新功能和使用方法
- **Duration**: 10min

**T018**: 最终代码review和清理
- **Description**: 代码review，移除调试代码，确保代码质量
- **Files**: All source files
- **Dependencies**: T017
- **Acceptance**: 代码clean，符合项目编码规范
- **Duration**: 15min

## 并行执行策略

**可并行任务**:
- T001 和 T002 可并行执行 [P]
- T013 和 T014 可并行执行 [P]
- T015 可在T014完成后与T016准备工作并行 [P]

## 总预估时间

- **顺序执行**: 约5.5小时
- **并行优化**: 约4.5小时
- **核心开发**: T003-T012 (约4小时)

## 验证检查点

1. **Phase 1完成**: 基础结构和类型定义就绪
2. **Phase 2完成**: 所有核心功能测试通过，TDD周期完整
3. **Phase 3完成**: 集成测试通过，性能要求满足
4. **Phase 4完成**: 功能完整，文档更新，代码质量符合标准

## 风险缓解

- **依赖风险**: 每个Phase有明确的完成标准
- **质量风险**: 严格执行TDD，确保测试先行
- **性能风险**: T013专门验证性能要求
- **集成风险**: T008和T014关注主启动流程集成

## 最小代码量原则

- 直接使用Node.js内置模块（os, fs, path）
- 复用现有js-yaml依赖
- 最小化新增文件数量（2个核心文件 + 测试）
- 避免过度设计，专注核心功能实现

---
*此任务列表基于Constitution原则生成，确保TDD、最小代码量和健壮性要求*