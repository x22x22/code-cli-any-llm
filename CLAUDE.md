# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS TypeScript project called "gemini-any-llm" - a Gemini API Gateway that enables Gemini CLI to access non-Gemini LLM providers. The project implements a translation gateway service that allows seamless, non-intrusive connectivity to various LLM providers (OpenAI, Anthropic, Qwen, etc.) through Gemini API compatibility.

**Key Design Principles**:
- 100% Gemini API compatibility - no modifications needed to Gemini CLI
- Provider abstraction layer for easy extension
- High-performance streaming support with Server-Sent Events (SSE)
- Production-ready with monitoring, error handling, and graceful shutdown

## Current Implementation Status

**Phase 3: Core Implementation - Completed ✅**
- ✅ Full NestJS architecture with modular design
- ✅ OpenAI provider implementation with retry logic
- ✅ Request/response transformers for Gemini ↔ OpenAI format
- ✅ Streaming support with proper SSE formatting
- ✅ Tool calling support (7+ format conversions)
- ✅ Comprehensive error handling and validation
- ✅ Health check and monitoring endpoints
- ✅ YAML-based configuration system
- ✅ Graceful shutdown handling

**API Endpoints**:
- `GET /api/v1/health` - Health check
- `POST /api/v1/models/{model}:generateContent` - Standard content generation
- `POST /api/v1/models/{model}:streamGenerateContent` - Streaming content generation

## Common Development Commands

### Installation and Setup
```bash
pnpm install  # Install dependencies
cp config/config.example.yaml config/config.yaml  # Copy configuration
# Edit config/config.yaml with your API keys and settings
```

### Development
```bash
pnpm run start:dev      # Start in development mode with file watching
pnpm run start:debug    # Start in debug mode with file watching
pnpm run start          # Build and run the application
pnpm run start:prod     # Run the production build
pnpm run kill            # Force kill any hanging processes
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
pnpm run test         # Run all tests
pnpm run test:watch   # Run tests in watch mode
pnpm run test:cov     # Run tests with coverage report
pnpm run test:e2e     # Run end-to-end tests
pnpm run test:debug   # Run tests in debug mode

# Run specific test file
pnpm test -- test/integration/api-gateway-comprehensive.spec.ts
```

## Project Architecture

The project follows a layered architecture with clear separation of concerns:

### Core Architecture Layers

1. **Controllers Layer** (`src/controllers/`) - HTTP request handling
   - `GeminiController` - Implements Gemini API endpoints
   - `HealthController` - Service health monitoring
   - Request validation and response formatting

2. **Providers Layer** (`src/providers/`) - LLM provider implementations
   - `OpenAIProvider` - OpenAI-compatible provider with retry logic
   - Implements `LLMProvider` interface for extensibility
   - Health check and model listing capabilities

3. **Transformers Layer** (`src/transformers/`) - API format conversion
   - `RequestTransformer` - Converts Gemini requests to provider format
   - `ResponseTransformer` - Converts provider responses to Gemini format
   - `StreamTransformer` - Handles streaming response transformation
   - Supports tool calling format conversion between providers

4. **Models Layer** (`src/models/`) - Data transfer objects
   - Complete Gemini API DTOs with validation
   - OpenAI request/response models
   - Type-safe interfaces for all API interactions

5. **Configuration Layer** (`src/config/`) - Configuration management
   - YAML-based configuration with environment variable override
   - Schema validation using class-validator
   - Support for multiple provider configurations

### Key Design Patterns

- **Provider Pattern**: Abstract LLM providers behind unified interface
- **Transformer Pattern**: Handle API format differences between providers
- **Middleware Pattern**: Cross-cutting concerns (logging, timeout, CORS)
- **Dependency Injection**: NestJS DI container for service management

### Configuration System

The project uses YAML configuration files instead of environment variables:

- **Main Config**: `config/config.yaml`
- **Example Config**: `config/config.example.yaml`
- **Environment Override**: Any config value can be overridden with environment variables

Configuration priority: Environment Variables > YAML > Defaults

Example configuration:
```yaml
# OpenAI Configuration
openai:
  apiKey: 'your-api-key'
  baseURL: 'https://api.openai.com/v1'  # or compatible provider
  model: 'gpt-3.5-turbo'
  timeout: 30000

# Gateway Configuration
gateway:
  port: 3002
  host: '0.0.0.0'
  logLevel: 'info'
```

## Testing Architecture

### Test Structure
- **Unit Tests**: `src/**/*.spec.ts` - Individual component testing
- **Integration Tests**: `test/integration/` - Component interaction testing
- **Contract Tests**: `test/contract/` - API compatibility verification
- **E2E Tests**: `test/` - Full application testing

### Key Test Areas
- Health check endpoints
- Content generation (sync and streaming)
- Tool calling functionality
- Multi-turn conversation context
- Error handling and validation
- Request/response format compliance

### Gemini CLI Integration Tests

The project includes comprehensive integration tests that verify compatibility with the actual Gemini CLI tool. These tests ensure that the gateway works correctly with real-world usage scenarios.

**Test File**: `test/integration/gemini-cli-integration.spec.ts`

**Prerequisites**:
- Development server must be running (`pnpm run start:dev`)
- Gemini CLI must be installed (`npm install -g @google/gemini-cli`)

**Test Coverage**:
- **Basic Functionality**: Chinese/English greetings, response validation
- **Complex Queries**: Code generation, multi-language requests
- **Stream Processing**: Streaming responses without JSON errors, GLM buffering
- **Error Handling**: Long prompts, special characters
- **Tool Calls**: Advanced features and function calling

**Running the Tests**:
```bash
# Run all Gemini CLI integration tests
pnpm test -- test/integration/gemini-cli-integration.spec.ts

# Run specific test
pnpm test -- test/integration/gemini-cli-integration.spec.ts -t "should handle simple Chinese greeting"

# Run with verbose output
pnpm test -- test/integration/gemini-cli-integration.spec.ts --verbose

# Run with coverage
pnpm test -- test/integration/gemini-cli-integration.spec.ts --coverage
```

**Test Features**:
- Automatically checks if dev server is running
- Tests real Gemini CLI commands with timeout protection
- Validates output for expected patterns and absence of JSON errors
- Includes skip flags for manual verification tests
- Comprehensive error reporting for failed commands

**Expected Results**:
- All tests should pass without JSON parsing errors
- Chinese characters should render correctly
- Streaming responses should work without interruption
- Tool calls should be handled gracefully

## Key Dependencies

### Core Dependencies
- **@nestjs/common**: ^11.0.1 - Core NestJS framework
- **@nestjs/config**: ^4.0.2 - Configuration management
- **@nestjs/throttler**: ^6.4.0 - Rate limiting
- **openai**: ^5.20.2 - OpenAI API client
- **class-validator**: ^0.14.2 - Request validation
- **js-yaml**: ^4.1.0 - YAML configuration parsing
- **nestjs-rate-limiter**: ^3.1.0 - Advanced rate limiting

### Development Dependencies
- **TypeScript**: ^5.7.3 - Type-safe JavaScript
- **Jest**: ^30.0.0 - Testing framework
- **ESLint & Prettier**: Code quality and formatting
- **supertest**: ^7.0.0 - HTTP assertions for testing

## Development Environment

- **Package Manager**: pnpm (required)
- **Runtime**: Node.js 18+
- **Architecture**: NestJS with Express
- **Type Safety**: Strict TypeScript configuration
- **Code Style**: ESLint + Prettier with auto-fix

## Important Implementation Details

### Streaming Response Handling
- Uses Server-Sent Events (SSE) for real-time responses
- Implements proper `finishReason` mapping between providers
- Supports thought process indicators for Gemini 2.5
- Handles tool call accumulation during streaming

### Error Handling
- Global exception filters for structured error responses
- Retry logic with exponential backoff for API failures
- Graceful degradation for unsupported features
- Sensitive information filtering in logs

### Process Management
- Graceful shutdown on SIGTERM/SIGINT
- Force kill script for zombie processes
- Proper resource cleanup on shutdown

### CORS Configuration
- Flexible origin control for development/production
- Credentials support for authenticated requests
- Pre-flight request handling

## Extension Points

### Adding New Providers
1. Implement the `LLMProvider` interface in `src/providers/`
2. Create corresponding transformers in `src/transformers/`
3. Add provider configuration schema in `src/config/`
4. Update provider registry if using dynamic loading

### Adding New Features
- Middleware: Add to `src/middleware/` and register in `app.module.ts`
- Filters: Add to `src/filters/` for global exception handling
- DTOs: Add validated models in `src/models/`

## API Compatibility Notes

- Supports Gemini 2.5 thought process features (`thought` boolean field)
- Implements tool calling with proper parameter transformation
- Maintains 100% compatibility with Gemini CLI expectations
- Handles both synchronous and streaming response modes

## Common Issues and Solutions

1. **Process not stopping on Ctrl+C**: Use `pnpm run kill` to force terminate
2. **Port already in use**: Change `gateway.port` in config.yaml
3. **CORS errors**: Update allowed origins in configuration
4. **API timeouts**: Adjust timeout values in provider configuration