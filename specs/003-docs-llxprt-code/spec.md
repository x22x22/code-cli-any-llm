# Feature Specification: 报文转换代码移植与智谱优化

**Feature Branch**: `003-docs-llxprt-code`
**Created**: 2025-09-17
**Status**: Draft
**Input**: User description: "请基于 @docs/LLXPRT_CODE_ANALYSIS.md 的分析结果，把 @/home/kdump/llm/project/llxprt-code/ 项目中的openai、qwen、智谱的报文转换代码移植到本项目，代替掉本项目现有的报文转换代码。"

## Execution Flow (main)
```
1. Parse user description from Input
   → 核心任务：代码移植，非从零开发
2. Extract key concepts from description
   → Actors: 开发者（执行移植）, API users（受益者）
   → Actions: 代码移植, 现有代码替换, 功能验证
   → Data: llxprt-code 项目的成熟转换逻辑
   → Constraints: 保持 API 兼容性, 通过现有测试
3. For each unclear aspect:
   → [基于 LLXPRT_CODE_ANALYSIS.md 明确所有移植要求]
4. Fill User Scenarios & Testing section
   → 重点验证移植后的功能正确性
5. Generate Functional Requirements
   → 每个需求都是具体的移植任务
6. Identify Key Entities
   → 明确需要移植的核心组件和模块
7. Run Review Checklist
   → 确保移植范围完整且可执行
8. Return: SUCCESS (spec ready for migration planning)
```

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

---

## User Scenarios & Testing

### Primary User Story
作为开发者，我需要将 llxprt-code 项目中经过充分测试和优化的报文转换代码移植到当前项目，替换现有的转换逻辑，以获得更好的 OpenAI、qwen、智谱模型兼容性和性能，特别是工具调用和智谱模型特有问题的处理能力。

### Acceptance Scenarios
1. **Given** 用户通过 Gemini CLI 调用智谱 GLM-4.5 模型，**When** 使用复杂的工具调用功能，**Then** 系统能正确处理双重转义问题并返回准确结果
2. **Given** 用户使用流式响应调用智谱模型，**When** 模型返回中文内容，**Then** 系统能避免断行格式问题，提供更流畅的输出
3. **Given** 用户调用支持多种工具格式的功能，**When** 切换不同的 LLM 提供者，**Then** 系统能自动检测并应用正确的工具格式转换
4. **Given** 用户使用包含特殊字符的工具参数，**When** 调用智谱模型，**Then** 系统能检测并修复参数中的编码问题

### Edge Cases
- 智谱 API 返回双重 JSON 字符串化的参数时，系统如何自动检测和修复？（直接移植 llxprt-code 项目的 doubleEscapeUtils 解决方案）
- 当工具调用参数包含复杂嵌套对象时，转义检测机制如何处理？（移植 llxprt-code 项目的 ToolFormatter 处理逻辑）
- 不同工具格式（openai、qwen、hermes 等）之间转换时如何保证数据完整性？（移植 llxprt-code 项目的完整工具格式转换系统）

## Requirements

### Functional Requirements
- **FR-001**: 系统必须完整移植 llxprt-code 项目的 ToolFormatter 类，支持 7+ 种工具格式转换（openai、qwen、deepseek、anthropic、hermes、xml、gemma）
- **FR-002**: 系统必须移植 llxprt-code 项目的智谱 GLM 模型自动检测和优化处理逻辑
- **FR-003**: 系统必须移植 llxprt-code 项目的 doubleEscapeUtils 模块，处理智谱 API 双重转义问题
- **FR-004**: 系统必须移植 llxprt-code 项目的流式响应缓冲优化机制
- **FR-005**: 系统必须移植智谱模型工具调用时禁用流式响应的逻辑
- **FR-006**: 系统必须移植 BaseProvider 的统一工具格式检测接口
- **FR-007**: 移植的代码必须保持与现有 Gemini API 的 100% 兼容性
- **FR-008**: 系统必须移植工具调用累积和参数类型自动修复功能
- **FR-009**: 系统必须移植 llxprt-code 项目的详细日志记录和错误处理机制
- **FR-010**: 系统必须移植认证优先级处理和配置管理逻辑
- **FR-011**: 系统必须用移植的代码完全替换现有的报文转换实现
- **FR-012**: 移植后的系统必须通过现有的所有测试用例

### Key Entities (移植的核心组件)
- **ToolFormatter**: 从 llxprt-code 移植的工具格式转换器，支持 7+ 种工具格式的相互转换
- **doubleEscapeUtils**: 从 llxprt-code 移植的智谱专用处理器，解决双重转义和参数类型问题
- **OpenAIProvider**: 从 llxprt-code 移植的增强版提供者，包含智谱优化和流式响应处理
- **BaseProvider**: 从 llxprt-code 移植的统一基础提供者，包含认证和配置管理
- **buildResponsesRequest/parseResponsesStream**: 从 llxprt-code 移植的请求构建和响应解析模块

---

## Review & Acceptance Checklist

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed

---