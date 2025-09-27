import { ConsoleLogger, ConsoleLoggerOptions, LogLevel } from '@nestjs/common';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  WriteStream,
} from 'fs';
import os from 'os';
import path from 'path';
import { inspect } from 'util';

export interface GatewayLoggerOptions extends ConsoleLoggerOptions {
  logDir?: string;
  filePrefix?: string;
}

const DEFAULT_LOG_DIR = path.join(os.homedir(), '.code-cli-any-llm', 'logs');
const DEFAULT_FILE_PREFIX = 'gateway';

export class GatewayLoggerService extends ConsoleLogger {
  private static instance: GatewayLoggerService | null = null;
  private static logStream: WriteStream | null = null;
  private static logFilePath = '';
  private static logDir = DEFAULT_LOG_DIR;
  private static filePrefix = DEFAULT_FILE_PREFIX;
  private static readonly stackTracePattern = /^(.)+\n\s+at .+:\d+:\d+/;

  private constructor(options?: GatewayLoggerOptions) {
    const { logDir, filePrefix, ...consoleOptions } = options ?? {};
    super(consoleOptions);

    GatewayLoggerService.applyLogDestination(logDir, filePrefix);
    GatewayLoggerService.ensureLogStream();
  }

  static create(options?: GatewayLoggerOptions): GatewayLoggerService {
    if (!GatewayLoggerService.instance) {
      GatewayLoggerService.instance = new GatewayLoggerService(options);
    } else if (options) {
      let reopened = false;
      if (options.logDir || options.filePrefix) {
        reopened = GatewayLoggerService.applyLogDestination(
          options.logDir,
          options.filePrefix,
        );
        if (reopened) {
          GatewayLoggerService.ensureLogStream();
        }
      }
      if (options.logLevels) {
        GatewayLoggerService.instance.setLogLevels(options.logLevels);
      }
    }
    return GatewayLoggerService.instance;
  }

  static getLogFilePath(): string {
    GatewayLoggerService.ensureLogStream();
    return GatewayLoggerService.logFilePath;
  }

  static close(): void {
    if (!GatewayLoggerService.logStream) {
      return;
    }
    GatewayLoggerService.logStream.end();
    GatewayLoggerService.logStream = null;
  }

  log(message: any, ...optionalParams: any[]): void {
    super.log(message, ...optionalParams);
    this.persistIfEnabled('log', 'INFO', message, optionalParams);
  }

  error(message: any, ...optionalParams: any[]): void {
    super.error(message, ...optionalParams);
    this.persistIfEnabled('error', 'ERROR', message, optionalParams);
  }

  warn(message: any, ...optionalParams: any[]): void {
    super.warn(message, ...optionalParams);
    this.persistIfEnabled('warn', 'WARN', message, optionalParams);
  }

  debug(message: any, ...optionalParams: any[]): void {
    super.debug(message, ...optionalParams);
    this.persistIfEnabled('debug', 'DEBUG', message, optionalParams);
  }

  verbose(message: any, ...optionalParams: any[]): void {
    super.verbose(message, ...optionalParams);
    this.persistIfEnabled('verbose', 'VERBOSE', message, optionalParams);
  }

  fatal(message: any, ...optionalParams: any[]): void {
    super.fatal?.(message, ...optionalParams);
    this.persistIfEnabled('fatal', 'FATAL', message, optionalParams);
  }

  setLogLevels(levels: LogLevel[]): void {
    super.setLogLevels(levels);
  }

  private persistIfEnabled(
    level: LogLevel,
    label: string,
    message: any,
    optionalParams: any[],
  ): void {
    if (!this.isLevelEnabled(level)) {
      return;
    }
    this.persist(label, message, optionalParams);
  }

  private persist(level: string, message: any, optionalParams: any[]): void {
    if (!GatewayLoggerService.logStream) {
      return;
    }

    const timestamp = new Date().toISOString();
    const { context, rest } =
      GatewayLoggerService.extractContext(optionalParams);
    const parts = [`[${timestamp}]`, `[${level}]`];
    if (context) {
      parts.push(`[${context}]`);
    }
    const baseMessage = GatewayLoggerService.stringify(message);
    let line = `${parts.join(' ')} ${baseMessage}`;

    for (const param of rest) {
      const formatted = GatewayLoggerService.formatExtra(param);
      if (formatted.startsWith('\n')) {
        line += formatted;
      } else {
        line += ` ${formatted}`;
      }
    }

    GatewayLoggerService.logStream.write(`${line}\n`);
  }

  private static formatExtra(value: any): string {
    if (value instanceof Error) {
      return value.stack ? `\n${value.stack}` : value.message;
    }
    if (typeof value === 'string') {
      return GatewayLoggerService.isStackTrace(value) ? `\n${value}` : value;
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return inspect(value, { depth: 5, breakLength: Infinity });
      }
    }
    return String(value);
  }

  private static stringify(value: any): string {
    if (value instanceof Error) {
      return value.message ?? value.toString();
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return inspect(value, { depth: 5, breakLength: Infinity });
      }
    }
    return String(value);
  }

  private static extractContext(params: any[]): {
    context?: string;
    rest: any[];
  } {
    if (!params.length) {
      return { rest: [] };
    }
    const last = params[params.length - 1];
    if (typeof last === 'string' && !GatewayLoggerService.isStackTrace(last)) {
      return { context: last, rest: params.slice(0, -1) };
    }
    return { rest: params };
  }

  private static isStackTrace(value: any): boolean {
    return (
      typeof value === 'string' &&
      GatewayLoggerService.stackTracePattern.test(value)
    );
  }

  private static ensureLogStream(): void {
    if (GatewayLoggerService.logStream) {
      return;
    }

    mkdirSync(GatewayLoggerService.logDir, { recursive: true });
    const baseFilePath = path.join(
      GatewayLoggerService.logDir,
      `${GatewayLoggerService.filePrefix}.log`,
    );

    GatewayLoggerService.rotateExistingLog(baseFilePath);

    GatewayLoggerService.logFilePath = baseFilePath;
    GatewayLoggerService.logStream = createWriteStream(baseFilePath, {
      flags: 'a',
      encoding: 'utf8',
    });
  }

  static getDefaultLogDir(): string {
    return DEFAULT_LOG_DIR;
  }

  private static applyLogDestination(
    logDir?: string,
    filePrefix?: string,
  ): boolean {
    const resolvedDir = GatewayLoggerService.resolveLogDir(logDir);
    const resolvedPrefix = GatewayLoggerService.resolveFilePrefix(filePrefix);
    const dirChanged = resolvedDir !== GatewayLoggerService.logDir;
    const prefixChanged = resolvedPrefix !== GatewayLoggerService.filePrefix;

    if (dirChanged || prefixChanged) {
      GatewayLoggerService.logDir = resolvedDir;
      GatewayLoggerService.filePrefix = resolvedPrefix;
      GatewayLoggerService.close();
      return true;
    }

    return false;
  }

  private static resolveLogDir(dir?: string): string {
    if (!dir || !dir.trim()) {
      return DEFAULT_LOG_DIR;
    }
    const trimmed = dir.trim();
    if (trimmed === '~') {
      return os.homedir();
    }
    if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
      const relative = trimmed.slice(2);
      return path.join(os.homedir(), relative);
    }
    if (trimmed.startsWith('~')) {
      const relative = trimmed.slice(1).replace(/^[\\/]/, '');
      return path.join(os.homedir(), relative);
    }
    return path.isAbsolute(trimmed) ? trimmed : path.resolve(trimmed);
  }

  private static resolveFilePrefix(prefix?: string): string {
    return prefix && prefix.trim().length > 0
      ? prefix.trim()
      : DEFAULT_FILE_PREFIX;
  }

  private static buildTimestamp(): string {
    const now = new Date();
    const pad = (input: number) => input.toString().padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  private static rotateExistingLog(baseFilePath: string): void {
    if (!existsSync(baseFilePath)) {
      return;
    }

    const timestamp = GatewayLoggerService.buildTimestamp();
    let archivedFilePath = path.join(
      GatewayLoggerService.logDir,
      `${GatewayLoggerService.filePrefix}-${timestamp}.log`,
    );

    if (existsSync(archivedFilePath)) {
      let suffix = 1;
      do {
        archivedFilePath = path.join(
          GatewayLoggerService.logDir,
          `${GatewayLoggerService.filePrefix}-${timestamp}-${suffix}.log`,
        );
        suffix += 1;
      } while (existsSync(archivedFilePath));
    }

    try {
      renameSync(baseFilePath, archivedFilePath);
    } catch (error) {
      // 如果重命名失败，保留旧文件继续写入，避免阻塞网关启动
      process.stderr.write(
        `网关日志文件重命名失败，将继续使用原文件: ${(error as Error).message}\n`,
      );
    }
  }
}
