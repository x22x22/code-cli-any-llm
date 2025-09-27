import { Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

const DEFAULT_CODEX_HOME = path.join(
  os.homedir(),
  '.code-cli-any-llm',
  'codex',
);
const DEFAULT_AUTH_PORT = 1455;
const MAX_BIND_RETRIES = 10;
const RETRY_DELAY_MS = 200;
const CODEX_VERSION = '0.38.0';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const ISSUER = 'https://auth.openai.com';

interface ChatGPTTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  accountId?: string;
  apiKey?: string;
  expiresAt?: number;
  lastRefresh?: number;
}

interface AuthFileSchema {
  OPENAI_API_KEY?: string | null;
  tokens?: {
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
    account_id?: string;
  } | null;
  last_refresh?: string | null;
  access_token_expires_at?: number | null;
}

interface AuthHeaders {
  authorization: string;
  accountId?: string;
}

export class ChatGPTAuthManager {
  private tokens?: ChatGPTTokens;
  private inflight?: Promise<ChatGPTTokens>;
  private readonly codexHome: string;
  private readonly authFile: string;
  private readonly issuer: string;
  private readonly clientId: string;

  constructor(
    private readonly logger: Logger,
    options?: {
      codexHome?: string;
      issuer?: string;
      clientId?: string;
    },
  ) {
    this.codexHome = options?.codexHome
      ? path.resolve(options.codexHome)
      : process.env.CODEX_HOME
        ? path.resolve(process.env.CODEX_HOME)
        : DEFAULT_CODEX_HOME;
    this.authFile = path.join(this.codexHome, 'auth.json');
    this.issuer = options?.issuer ?? ISSUER;
    this.clientId = options?.clientId ?? CLIENT_ID;
  }

  async getAuthHeaders(): Promise<AuthHeaders> {
    const tokens = await this.ensureTokens();
    return {
      authorization: `Bearer ${tokens.accessToken}`,
      accountId: tokens.accountId,
    };
  }

  private async ensureTokens(): Promise<ChatGPTTokens> {
    if (this.tokens && !this.isExpiring(this.tokens)) {
      return this.tokens;
    }

    if (this.inflight) {
      return this.inflight;
    }

    this.inflight = this.loadOrRefreshTokens().finally(() => {
      this.inflight = undefined;
    });
    const tokens = await this.inflight;
    this.tokens = tokens;
    return tokens;
  }

  private async loadOrRefreshTokens(): Promise<ChatGPTTokens> {
    let tokens = this.tokens ?? (await this.readTokensFromDisk());

    if (!tokens) {
      tokens = await this.loginFlow();
      await this.writeTokens(tokens);
      return tokens;
    }

    if (this.isExpiring(tokens)) {
      try {
        const refreshed = await this.refreshTokensInternal(tokens);
        await this.writeTokens(refreshed);
        return refreshed;
      } catch (error) {
        this.logger.warn(
          `刷新 ChatGPT 令牌失败，尝试重新登录: ${String(error)}`,
        );
        const relogin = await this.loginFlow();
        await this.writeTokens(relogin);
        return relogin;
      }
    }

    return tokens;
  }

  private isExpiring(tokens: ChatGPTTokens): boolean {
    if (!tokens.expiresAt) {
      return true;
    }
    const now = Date.now();
    return tokens.expiresAt - now < 60_000; // refresh 1 分钟前
  }

  private async readTokensFromDisk(): Promise<ChatGPTTokens | undefined> {
    try {
      const data = await fs.readFile(this.authFile, 'utf8');
      const parsedUnknown = JSON.parse(data) as unknown;
      if (!this.isAuthFileSchema(parsedUnknown)) {
        return undefined;
      }
      const parsed = parsedUnknown;
      const tokens = parsed.tokens ?? undefined;
      if (!tokens) {
        return undefined;
      }
      if (!tokens.access_token || !tokens.refresh_token || !tokens.id_token) {
        return undefined;
      }
      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        idToken: tokens.id_token,
        accountId: tokens.account_id || this.extractAccountId(tokens.id_token),
        apiKey: parsed.OPENAI_API_KEY ?? undefined,
        expiresAt: parsed.access_token_expires_at ?? undefined,
        lastRefresh: parsed.last_refresh
          ? Date.parse(parsed.last_refresh)
          : undefined,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      this.logger.warn(`读取 ChatGPT 认证文件失败: ${String(error)}`);
      return undefined;
    }
  }

  private async writeTokens(tokens: ChatGPTTokens): Promise<void> {
    const payload: AuthFileSchema = {
      OPENAI_API_KEY: tokens.apiKey ?? null,
      tokens: {
        id_token: tokens.idToken,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        account_id: tokens.accountId,
      },
      last_refresh: new Date(tokens.lastRefresh ?? Date.now()).toISOString(),
      access_token_expires_at: tokens.expiresAt ?? null,
    };

    await fs.mkdir(path.dirname(this.authFile), { recursive: true });
    await fs.writeFile(this.authFile, JSON.stringify(payload, null, 2), 'utf8');
  }

  async refreshAuthTokens(): Promise<void> {
    if (!this.tokens) {
      this.tokens = await this.ensureTokens();
      return;
    }

    const refreshed = await this.refreshTokensInternal(this.tokens);
    await this.writeTokens(refreshed);
    this.tokens = refreshed;
  }

  private async refreshTokensInternal(
    tokens: ChatGPTTokens,
  ): Promise<ChatGPTTokens> {
    const body = {
      client_id: this.clientId,
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      scope: 'openid profile email',
    };

    const response = await fetch(`${this.issuer}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `刷新令牌失败 (${response.status}): ${text || response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      id_token: string;
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const refreshToken = data.refresh_token || tokens.refreshToken;
    const expiresAt =
      Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600_000);
    const accountId = this.extractAccountId(data.id_token) || tokens.accountId;

    return {
      idToken: data.id_token,
      accessToken: data.access_token,
      refreshToken,
      accountId,
      apiKey: tokens.apiKey,
      expiresAt,
      lastRefresh: Date.now(),
    };
  }

  private async loginFlow(): Promise<ChatGPTTokens> {
    const { server, port } = await this.startAuthServer();
    const redirectUri = `http://localhost:${port}/auth/callback`;

    const pkce = this.createPkceCodes();
    const state = this.generateState();
    const authorizeUrl = this.buildAuthorizeUrl(
      redirectUri,
      pkce.codeChallenge,
      state,
    );

    this.logger.log('请在浏览器打开以下链接完成 ChatGPT 登录:');
    this.logger.log(authorizeUrl);

    const tokens = await new Promise<ChatGPTTokens>((resolve, reject) => {
      const timeout = setTimeout(
        () => {
          server.close();
          reject(new Error('等待登录超时'));
        },
        5 * 60 * 1000,
      );

      const cleanup = () => {
        clearTimeout(timeout);
        server.close();
      };

      server.on('request', (req: IncomingMessage, res: ServerResponse) => {
        void (async () => {
          const url = new URL(req.url ?? '/', `http://localhost:${port}`);
          if (url.pathname === '/cancel') {
            res.statusCode = 200;
            res.end('Cancelled');
            cleanup();
            reject(new Error('Login cancelled'));
            return;
          }

          if (url.pathname !== '/auth/callback') {
            res.statusCode = 404;
            res.end('Not Found');
            return;
          }

          const returnedState = url.searchParams.get('state');
          if (!returnedState || returnedState !== state) {
            res.statusCode = 400;
            res.end('State mismatch');
            cleanup();
            reject(new Error('State mismatch'));
            return;
          }

          const code = url.searchParams.get('code');
          if (!code) {
            res.statusCode = 400;
            res.end('Missing authorization code');
            cleanup();
            reject(new Error('Missing authorization code'));
            return;
          }

          try {
            const exchanged = await this.exchangeCodeForTokens(
              code,
              redirectUri,
              pkce.codeVerifier,
            );

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(
              '<html><body><h2>登录成功，可以返回终端。</h2>' +
                '<p>您现在可以关闭此窗口。</p></body></html>',
            );
            cleanup();
            resolve(exchanged);
          } catch (error) {
            const err =
              error instanceof Error
                ? error
                : new Error(String(error ?? '未知错误'));
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(`登录失败: ${err.message}`);
            cleanup();
            reject(err);
          }
        })();
      });
    });

    return tokens;
  }

  private async startAuthServer(): Promise<{
    server: import('http').Server;
    port: number;
  }> {
    for (let attempt = 0; attempt < MAX_BIND_RETRIES; attempt++) {
      const server = createServer();

      try {
        await new Promise<void>((resolve, reject) => {
          const onError = (err: NodeJS.ErrnoException) => {
            server.off('listening', onListening);
            reject(err);
          };
          const onListening = () => {
            server.off('error', onError);
            resolve();
          };
          server.once('error', onError);
          server.listen(DEFAULT_AUTH_PORT, '127.0.0.1', onListening);
        });

        const address = server.address() as AddressInfo | null;
        if (!address || typeof address.port !== 'number') {
          throw new Error('无法获取认证回调端口');
        }

        return { server, port: address.port };
      } catch (error) {
        const shouldRetry =
          (error as NodeJS.ErrnoException).code === 'EADDRINUSE' &&
          attempt < MAX_BIND_RETRIES - 1;

        await new Promise<void>((resolve) => server.close(() => resolve()));

        if (!shouldRetry) {
          throw error;
        }

        await this.sendCancelRequest(DEFAULT_AUTH_PORT);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    throw new Error('无法启动本地认证服务，请检查端口占用。');
  }

  private async sendCancelRequest(port: number): Promise<void> {
    try {
      await fetch(`http://127.0.0.1:${port}/cancel`, {
        method: 'GET',
        headers: {
          'User-Agent': this.buildUserAgent(),
        },
      });
    } catch {
      // 忽略错误
    }
  }

  private async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<ChatGPTTokens> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: this.clientId,
      code_verifier: codeVerifier,
    });

    const response = await fetch(`${this.issuer}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `交换令牌失败 (${response.status}): ${text || response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      id_token: string;
      access_token: string;
      refresh_token: string;
      expires_in?: number;
    };

    let apiKey: string | undefined;
    try {
      apiKey = await this.obtainApiKey(data.id_token);
    } catch (error) {
      this.logger.warn(
        `获取 API Key 失败，将继续使用 ChatGPT 令牌: ${String(error)}`,
      );
    }

    const expiresAt =
      Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600_000);
    const accountId = this.extractAccountId(data.id_token);

    return {
      idToken: data.id_token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      apiKey,
      accountId,
      expiresAt,
      lastRefresh: Date.now(),
    };
  }

  private async obtainApiKey(idToken: string): Promise<string | undefined> {
    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: this.clientId,
      requested_token: 'openai-api-key',
      subject_token: idToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    });

    const response = await fetch(`${this.issuer}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `交换 API Key 失败 (${response.status}): ${text || response.statusText}`,
      );
    }

    const data = (await response.json()) as { access_token?: string };
    return data.access_token;
  }

  private buildAuthorizeUrl(
    redirectUri: string,
    codeChallenge: string,
    state: string,
  ): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: 'openid profile email offline_access',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
      originator: 'codex_cli_rs',
      state,
    });
    return `${this.issuer}/oauth/authorize?${params.toString()}`;
  }

  private createPkceCodes(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = this.generateRandomString(64);
    const hash = createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = this.toBase64Url(hash);
    return { codeVerifier, codeChallenge };
  }

  private generateState(): string {
    return this.generateRandomString(32);
  }

  private generateRandomString(bytesLength: number): string {
    return this.toBase64Url(randomBytes(bytesLength));
  }

  private toBase64Url(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private extractAccountId(idToken: string): string | undefined {
    try {
      const [, payload] = idToken.split('.');
      if (!payload) {
        return undefined;
      }
      const decoded = Buffer.from(payload, 'base64url').toString('utf8');
      const claims = JSON.parse(decoded) as Record<string, any>;
      const authClaims =
        (claims['https://api.openai.com/auth'] as
          | Record<string, any>
          | undefined) || {};
      return (
        authClaims.chatgpt_account_id ||
        authClaims.account_id ||
        authClaims.chatgpt_user_id ||
        claims.sub ||
        undefined
      );
    } catch (error) {
      this.logger.warn(`解析 ID Token 失败: ${String(error)}`);
      return undefined;
    }
  }

  private isAuthFileSchema(value: unknown): value is AuthFileSchema {
    return typeof value === 'object' && value !== null;
  }

  private buildUserAgent(): string {
    const osLabel = `${os.type()} ${os.release()}`;
    const arch = os.arch();
    return `codex_cli_rs/${CODEX_VERSION} (${osLabel}; ${arch}) Node.js`;
  }
}
