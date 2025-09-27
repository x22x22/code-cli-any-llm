# Feature Specification: 全局配置文件读取功能

**Feature Branch**: `002-home-home-gemini`
**Created**: 2025-01-16
**Status**: Draft
**Input**: User description: "实现一个在home目录下读取全局配置的功能。即在本项目启动的时候会默认先去home目录下的.code-cli-any-llm/config.yaml 下读取全局配置。如果配置文件不存在，会自动创建一个带有key的空配置文件，并提醒用户需要对文件的apiKey、baseURL、model进行配置后才可以使用。baseURL和model、timeout可以填充默认值，但是apiKey保留为空，检测到apiKey为空的时候就要提醒用户去配置，并且启动失败。"

## User Scenarios & Testing *(mandatory)*

### Primary User Story
作为一个用户，我希望在启动项目时系统能够自动读取我在home目录下配置的全局设置，这样我就可以在任何地方运行项目时都使用统一的API配置，而不需要每次都手动配置项目目录下的配置文件。

### Acceptance Scenarios
1. **Given** 用户首次启动项目且home目录下无配置文件, **When** 系统启动, **Then** 系统在 `~/.code-cli-any-llm/` 目录下创建配置文件，显示配置引导信息，并优雅地停止启动
2. **Given** 用户home目录下存在配置文件但apiKey为空, **When** 系统启动, **Then** 系统显示apiKey缺失提示信息，指导用户如何配置，并停止启动
3. **Given** 用户home目录下存在完整有效的配置文件, **When** 系统启动, **Then** 系统成功加载配置并正常启动服务
4. **Given** 用户home目录和项目目录都存在配置文件, **When** 系统启动, **Then** 项目目录配置覆盖home目录配置，系统正常启动
5. **Given** 用户修改了home目录下的配置文件, **When** 重新启动项目, **Then** 系统加载新的配置并应用到服务中

### Edge Cases
- 用户home目录没有写入权限时如何处理？
- 配置文件存在但格式错误（非有效YAML）时如何处理？
- 配置文件中某些必需字段缺失或值无效时如何处理？
- 系统无法访问home目录时如何降级处理？

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: 系统启动时必须检查用户home目录下的 `~/.code-cli-any-llm/config.yaml` 配置文件
- **FR-002**: 当全局配置文件不存在时，系统必须自动创建目录结构和配置文件模板
- **FR-003**: 自动创建的配置文件必须包含apiKey（空值）、baseURL（默认值）、model（默认值）、timeout（默认值）字段
- **FR-004**: 系统必须验证apiKey字段是否为空，若为空则显示配置指导信息并停止启动
- **FR-005**: 当全局配置有效时，系统必须使用该配置作为默认配置启动服务
- **FR-006**: 项目目录下的配置文件必须能够覆盖全局配置中的对应设置
- **FR-007**: 配置文件创建或配置验证失败时，系统必须显示清晰的错误提示和解决方案
- **FR-008**: 系统必须在启动日志中显示正在使用的配置文件路径和来源
- **FR-009**: 配置文件格式错误时，系统必须显示具体的格式错误信息和修复建议

### Key Entities *(include if feature involves data)*
- **全局配置文件**: 位于用户home目录的配置文件，包含API连接信息和默认设置
  - 路径: `~/.code-cli-any-llm/config.yaml`
  - 必需字段: apiKey, baseURL, model, timeout
  - 默认值策略: baseURL, model, timeout有默认值，apiKey必须用户填写
- **配置加载顺序**: 全局配置 → 项目配置（覆盖全局配置）
- **配置验证规则**: apiKey非空，baseURL格式有效，model名称有效，timeout为正整数