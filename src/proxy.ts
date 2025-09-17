import express, { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { IncomingHttpHeaders, IncomingMessage } from 'http';
import type { ClientRequest } from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { StringDecoder } from 'string_decoder';
import { performanceConfig } from './config/performance.config';

const app: express.Application = express();

// ===== 日志与工具 =====
const nowISO = () => new Date().toISOString();
const genReqId = () =>
  (globalThis as any).crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
function tsForFile() {
  const d = new Date();
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${y}${m}${day}-${hh}${mm}${ss}`;
}

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}
const LOG_FILE = path.join(LOG_DIR, `proxy-${tsForFile()}.log`);
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });

function writeLine(line = '') {
  logStream.write(line + '\n');
}
function writeRaw(text = '') {
  logStream.write(text);
}
function headersToPrintable(headers: IncomingHttpHeaders): string {
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : (v ?? '')}`)
    .join('\n');
}

function bufferToString(buf?: Buffer, charset?: string): string {
  if (!buf) return '';
  const enc = (charset || 'utf-8').toLowerCase();
  try {
    return buf.toString(enc as BufferEncoding);
  } catch {
    return buf.toString('utf-8');
  }
}

function parseCharset(contentType?: string | string[]): string | undefined {
  const ct = Array.isArray(contentType) ? contentType[0] : contentType;
  if (!ct) return undefined;
  const m = /;\s*charset=([^;\s]+)/i.exec(ct);
  return m?.[1];
}

function isSSEResponse(resLike: { headers?: IncomingHttpHeaders }): boolean {
  const ct = resLike.headers?.['content-type'];
  const v = Array.isArray(ct) ? ct[0] : ct;
  return typeof v === 'string' && /^text\/event-stream/i.test(v);
}

function getContentEncoding(headers?: IncomingHttpHeaders): string | undefined {
  const ce = headers?.['content-encoding'];
  return Array.isArray(ce) ? ce[0] : ce;
}

function decompressBodyIfNeeded(
  encoding: string | undefined,
  body: Buffer,
): Buffer {
  if (!encoding) return body;
  try {
    const enc = encoding.toLowerCase();
    if (enc.includes('gzip')) return zlib.gunzipSync(body);
    if (enc.includes('br')) return zlib.brotliDecompressSync(body);
    if (enc.includes('deflate')) {
      try {
        return zlib.inflateSync(body);
      } catch {
        return zlib.inflateRawSync(body);
      }
    }
  } catch (e) {
    writeLine(`[${nowISO()}] 解压响应体失败(${encoding}): ${String(e)}`);
  }
  return body; // 回退为原始内容
}

function normalizeToNodeEncoding(charset?: string): BufferEncoding {
  if (!charset) return 'utf8';
  const c = charset.toLowerCase();
  if (c === 'utf-8' || c === 'utf8') return 'utf8';
  if (c === 'utf-16le' || c === 'utf16le') return 'utf16le';
  if (c === 'latin1' || c === 'iso-8859-1') return 'latin1';
  return 'utf8';
}

// 记录进入代理的请求：方法、URL、头、体
app.use(
  express.raw({
    type: () => true,
    limit: performanceConfig.maxRequestBodySize,
  }),
);
app.use((req: Request & { id?: string }, _res, next) => {
  const reqId = genReqId();
  req.id = reqId;
  const charset = parseCharset(req.headers['content-type']);
  const nodeEnc = normalizeToNodeEncoding(charset);
  const bodyBufRaw = Buffer.isBuffer((req as any).body)
    ? (req as any).body
    : undefined;
  const reqContentEncoding = getContentEncoding(req.headers as any);
  const bodyBuf = bodyBufRaw
    ? decompressBodyIfNeeded(reqContentEncoding, bodyBufRaw)
    : undefined;
  const bodyText = bodyBuf ? bodyBuf.toString(nodeEnc) : '';

  writeLine(``);
  writeLine(`===== REQUEST BEGIN [${reqId}] ${nowISO()} =====`);
  writeLine(`${req.method} ${req.originalUrl}`);
  writeLine(headersToPrintable(req.headers));
  if (bodyBuf && bodyBuf.length) {
    writeLine('');
    writeLine('-- 请求体开始 --');
    writeLine(bodyText);
    writeLine('-- 请求体结束 --');
  } else {
    writeLine('');
    writeLine('(无请求体)');
  }
  writeLine(`===== REQUEST END [${reqId}] ${nowISO()} =====`);
  next();
});

// 创建代理中间件，包含请求/响应（含 SSE）日志
// const target = 'https://generativelanguage.googleapis.com';
const target = 'http://localhost:23062/api';
const exampleProxy = createProxyMiddleware({
  target,
  changeOrigin: true,
  secure: false,
  pathRewrite: {
    '^/proxy': '',
  },
  selfHandleResponse: true,
  on: {
    proxyReq: (proxyReq: ClientRequest, req: Request & { id?: string }) => {
      // 将已通过 express.raw 解析的请求体重新写入到代理请求中，并记录必要日志
      const bodyBuf = Buffer.isBuffer((req as any).body)
        ? (req as any).body
        : undefined;
      if (bodyBuf && bodyBuf.length) {
        proxyReq.setHeader('content-length', Buffer.byteLength(bodyBuf));
        try {
          proxyReq.write(bodyBuf);
        } catch (e) {
          writeLine(`[${nowISO()}] 写入代理请求体失败: ${String(e)}`);
        }
      }
    },
    proxyRes: (
      proxyRes: IncomingMessage,
      req: Request & { id?: string },
      res: Response,
    ) => {
      const reqId = req.id || 'unknown';
      const isSSE = isSSEResponse(proxyRes);
      const statusCode = proxyRes.statusCode ?? 502;

      // 先将响应头同步到下游客户端
      Object.entries(proxyRes.headers).forEach(([k, v]) => {
        if (typeof v !== 'undefined') res.setHeader(k, v as any);
      });
      res.status(statusCode);

      // 打印响应起始行与头
      writeLine('');
      writeLine(`===== RESPONSE BEGIN [${reqId}] ${nowISO()} =====`);
      writeLine(`状态: ${statusCode}${isSSE ? ' [SSE]' : ''}`);
      writeLine(headersToPrintable(proxyRes.headers));

      if (isSSE) {
        // 流式透传并逐块打印（不聚合，避免占用内存）
        let chunkIndex = 0;
        const contentEncoding = getContentEncoding(proxyRes.headers);
        const decoder = new StringDecoder('utf8');
        if (contentEncoding && /gzip|br|deflate/i.test(contentEncoding)) {
          writeLine('');
          writeLine(
            `[${nowISO()}] [SSE] 检测到压缩(${contentEncoding})，跳过内容解码，仅记录块到达与透传。`,
          );
        }
        proxyRes.on('data', (chunk: Buffer) => {
          chunkIndex += 1;
          writeLine('');
          writeLine(`[${nowISO()}] [SSE] ${reqId} 块#${chunkIndex}:`);
          if (contentEncoding && /gzip|br|deflate/i.test(contentEncoding)) {
            // 无法在不破坏边界的情况下按块解压，避免乱码，直接跳过正文
            writeLine('(内容被压缩，未解码)');
          } else {
            // 即时打印每个 SSE 块（跨块字符用 StringDecoder 处理）
            const text = decoder.write(chunk);
            writeRaw(text);
          }
          // 透传给客户端
          res.write(chunk);
        });
        proxyRes.on('end', () => {
          res.end();
          const remain = decoder.end();
          if (remain) writeRaw(remain);
          writeLine('');
          writeLine(`[${nowISO()}] [SSE] ${reqId} 结束，共 ${chunkIndex} 块`);
          writeLine(`===== RESPONSE END [${reqId}] ${nowISO()} =====`);
        });
        proxyRes.on('error', (err) => {
          writeLine(`[${nowISO()}] [SSE] ${reqId} 响应流错误: ${String(err)}`);
          try {
            res.end();
          } catch (streamError) {
            writeLine(
              `[${nowISO()}] [SSE] ${reqId} 终止响应时异常: ${String(
                streamError,
              )}`,
            );
          }
        });
      } else {
        // 普通响应：聚合打印完整体，同时按块透传
        const chunks: Buffer[] = [];
        proxyRes.on('data', (chunk: Buffer) => {
          chunks.push(Buffer.from(chunk));
          res.write(chunk);
        });
        proxyRes.on('end', () => {
          res.end();
          const rawBody = Buffer.concat(chunks);
          const contentEncoding = getContentEncoding(proxyRes.headers);
          const body = decompressBodyIfNeeded(contentEncoding, rawBody);
          const charset = parseCharset(proxyRes.headers['content-type']);
          const bodyText = bufferToString(body, charset);
          if (body.length) {
            writeLine('');
            writeLine('-- 响应体开始 --');
            writeLine(bodyText);
            writeLine('-- 响应体结束 --');
          } else {
            writeLine('');
            writeLine('(无响应体)');
          }
          writeLine(`===== RESPONSE END [${reqId}] ${nowISO()} =====`);
        });
        proxyRes.on('error', (err) => {
          writeLine(`[${nowISO()}] ${reqId} 响应流错误: ${String(err)}`);
          try {
            res.end();
          } catch (streamError) {
            writeLine(
              `[${nowISO()}] ${reqId} 终止响应时异常: ${String(streamError)}`,
            );
          }
        });
      }
    },
  },
});

// mount `exampleProxy` in web server
app.use('/proxy', exampleProxy);

const PORT = Number(process.env.PORT || 3000);
app
  .listen(PORT, () => {
    const msg = [
      '================ 代理已启动 ================',
      `[${nowISO()}] 服务监听: http://localhost:${PORT}`,
      `[${nowISO()}] 路由前缀: /proxy`,
      `[${nowISO()}] 目标地址: ${target}`,
      `[${nowISO()}] 日志文件: ${LOG_FILE}`,
      `[${nowISO()}] 日志: 已启用完整请求/响应日志 (含 SSE)`,
      '============================================',
    ];
    for (const line of msg) {
      console.log(line);
      writeLine(line);
    }
  })
  .on('error', (err) => {
    const info = `[${nowISO()}] 启动失败: ${String(err)}`;
    console.error(info);
    writeLine(info);
  });

process.on('SIGINT', () => {
  writeLine(`[${nowISO()}] 进程收到 SIGINT, 准备退出...`);
  logStream.end(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  writeLine(`[${nowISO()}] 进程收到 SIGTERM, 准备退出...`);
  logStream.end(() => {
    process.exit(0);
  });
});
