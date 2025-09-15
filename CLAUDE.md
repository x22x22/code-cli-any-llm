# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS TypeScript project called "gemini-any-llm" - a Gemini API Gateway that enables Gemini CLI to access non-Gemini LLM providers. The project implements a translation gateway service that allows seamless, non-intrusive connectivity to various LLM providers (OpenAI, Anthropic, Qwen, etc.) through Gemini API compatibility.

**Key Design Principles**:
- 100% Gemini API compatibility - no modifications needed to Gemini CLI
- Provider abstraction layer for easy extension
- High-performance streaming support
- Production-ready with monitoring and error handling

## Common Development Commands

### Installation and Setup
```bash
pnpm install  # Install dependencies
```

### Development
```bash
pnpm run start:dev      # Start in development mode with file watching
pnpm run start:debug    # Start in debug mode with file watching
pnpm run start          # Build and run the application
pnpm run start:prod     # Run the production build
```

### Building
```bash
pnpm run build        # Build the TypeScript project
```

### Code Quality
```bash
pnpm run lint         # Run ESLint with auto-fix
pnpm run format       # Format code with Prettier
```

### Testing
```bash
pnpm run test         # Run unit tests
pnpm run test:watch   # Run unit tests in watch mode
pnpm run test:cov     # Run tests with coverage report
pnpm run test:e2e     # Run end-to-end tests
pnpm run test:debug   # Run tests in debug mode
```

## Project Architecture

The project follows a modular architecture with clear separation of concerns:

### Core Layers
1. **Controllers Layer** (`src/controllers/`) - HTTP request handling
   - Gemini API endpoint compatibility
   - Request validation and response formatting

2. **Providers Layer** (`src/providers/`) - LLM provider implementations
   - `LLMProvider` interface for all providers
   - Implementations: OpenAI, Anthropic, Qwen, etc.
   - Provider registry for dynamic loading

3. **Transformers Layer** (`src/transformers/`) - API format conversion
   - Request/response transformation between Gemini and provider formats
   - Tool calling format conversion (supports 7+ formats)
   - Streaming response handling

4. **Streaming Layer** (`src/streaming/`) - Real-time response processing
   - Server-Sent Events (SSE) support
   - Tool call accumulation (借鉴 AionCLI's Map-based approach)
   - Timeout and retry mechanisms

### Key Design Patterns
- **Provider Pattern**: Abstract LLM providers behind unified interface
- **Transformer Pattern**: Handle API format differences
- **Middleware Pattern**: Cross-cutting concerns (logging, monitoring)
- **Dependency Injection**: NestJS DI container for service management

### Configuration System
- Environment-based configuration with validation
- YAML-based provider and model mappings
- Runtime configuration hot-reload support

## Key Dependencies

- **@nestjs/common**: Core NestJS framework
- **@nestjs/core**: NestJS core module
- **@nestjs/platform-express**: Express-based HTTP server
- **@nestjs/config**: Configuration management
- **openai**: OpenAI API client (for compatible providers)
- **class-validator**: Request validation
- **rxjs**: Reactive extensions for JavaScript
- **TypeScript**: Primary language with strict typing
- **Jest**: Testing framework
- **ESLint & Prettier**: Code linting and formatting

## Development Environment

- Uses pnpm as the package manager
- TypeScript with strict configuration
- ESLint for code quality
- Jest for testing
- Standard NestJS CLI tooling

## Testing

### Test Structure
- **Unit Tests**: Individual component testing
- **Integration Tests**: Provider and transformer testing
- **E2E Tests**: Full API compatibility testing
- **Performance Tests**: Load and stress testing

### Running Tests
```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:cov

# Watch mode for development
pnpm test:watch

# Run specific test file
pnpm test -- providers/openai/openai.provider.spec.ts
```

## Implementation Status

**Current Phase**: Design and Research (Week 0)
- ✅ Completed: Research analysis of llxprt-code and aioncli
- ✅ Completed: Architecture design and interface definitions
- 🚧 In Progress: MVP implementation (Weeks 1-4)

**Upcoming Milestones**:
- Week 1-4: MVP with basic OpenAI compatibility
- Week 5-7: Streaming and tool calling support
- Week 8-9: Production-ready features

## Architecture Decisions

### Key Insights from Research
1. **From LLxprt-Code**: ProviderManager pattern for multi-provider support, ToolFormatter for 7+ format conversions
2. **From AionCLI**: Production-grade error handling, streaming tool call accumulation, message cleanup logic

### Technical Choices
- **NestJS**: Provides enterprise-grade structure with DI, modules, and middleware
- **TypeScript**: Ensures type safety across provider interfaces
- **SSE over WebSockets**: Better compatibility with Gemini API streaming model
- **Map-based accumulation**: Proven effective for streaming tool calls (AionCLI)
