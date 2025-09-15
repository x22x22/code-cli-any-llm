## 项目目的

本项目参考 [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router)，旨在为 Gemini CLI 提供访问非 Gemini 模型的路由服务。通过本服务，Gemini CLI 可以无缝地连接和使用其他大语言模型提供商的 API。

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```
