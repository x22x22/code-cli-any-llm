import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { GlobalConfigService } from '../config/global-config.service';

interface ProcessInfo {
  pid: number;
  source: 'pidfile' | 'port' | 'process_search';
}

/**
 * Force kill utility for zombie processes
 * Migrated from scripts/force-kill.js to TypeScript
 */
export async function forceKillProcesses(): Promise<void> {
  console.log('正在查找并终止僵尸进程...');

  // Get project root directory
  const projectRoot = process.cwd();

  // Load configuration to get the gateway port
  const configService = new GlobalConfigService();
  const configResult = configService.loadGlobalConfig();

  let gatewayPort = 23062; // fallback default

  if (configResult.isValid && configResult.config) {
    gatewayPort = configResult.config.gateway.port;
    console.log(`从配置文件读取到网关端口: ${gatewayPort}`);
  } else {
    console.log(`配置文件无效，使用默认端口: ${gatewayPort}`);
  }

  const processesToKill: ProcessInfo[] = [];

  // Check for .pid file
  const pidFile = path.join(projectRoot, '.development.pid');

  try {
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (!isNaN(pid) && pid > 0) {
        processesToKill.push({ pid, source: 'pidfile' });
        console.log(`从PID文件发现进程: ${pid}`);
      }
    }
  } catch (error) {
    console.error(
      '读取PID文件错误:',
      error instanceof Error ? error.message : String(error),
    );
  }

  // If no PID file, try to find process by port
  if (processesToKill.length === 0) {
    try {
      const lsofOutput = execSync(`lsof -ti:${gatewayPort}`, {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();

      if (lsofOutput) {
        const pid = parseInt(lsofOutput.split('\n')[0], 10);
        if (!isNaN(pid) && pid > 0) {
          processesToKill.push({ pid, source: 'port' });
          console.log(`从端口 ${gatewayPort} 发现进程: ${pid}`);
        }
      }
    } catch {
      // Ignore error if no process found on port
    }
  }

  // If still no PID, try to find node processes related to the project
  if (processesToKill.length === 0) {
    try {
      const psOutput = execSync(
        'ps aux | grep "node.*dist/main.js" | grep -v grep',
        {
          encoding: 'utf8',
          timeout: 5000,
        },
      );

      if (psOutput.trim()) {
        const lines = psOutput.trim().split('\n');
        for (const line of lines) {
          const match = line.match(/\s+(\d+)\s+/);
          if (match) {
            const pid = parseInt(match[1], 10);
            if (!isNaN(pid) && pid > 0) {
              processesToKill.push({ pid, source: 'process_search' });
              console.log(`从进程搜索发现运行中的进程: ${pid}`);
              break; // Only take the first match to avoid duplicates
            }
          }
        }
      }
    } catch {
      // Ignore error if no process found
    }
  }

  // Kill found processes
  if (processesToKill.length > 0) {
    for (const processInfo of processesToKill) {
      await killProcess(processInfo.pid);
    }

    // Clean up PID file
    if (fs.existsSync(pidFile)) {
      try {
        fs.unlinkSync(pidFile);
        console.log('PID文件已删除');
      } catch (error) {
        console.error(
          '删除PID文件失败:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  } else {
    console.log('未发现运行中的开发进程');
  }

  // Also check for any hanging node processes related to gemini-any-llm
  checkHangingProcesses();
}

/**
 * Kill a process with graceful shutdown attempt first
 */
async function killProcess(pid: number): Promise<void> {
  try {
    // Try graceful shutdown first
    console.log(`尝试优雅关闭进程 ${pid}...`);
    process.kill(pid, 'SIGTERM');

    // Wait for graceful shutdown with timeout
    const gracefulTimeout = 5000; // 5 seconds

    return new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        try {
          // Check if process is still running
          process.kill(pid, 0); // This throws if process doesn't exist
          console.log(`进程 ${pid} 仍在运行，强制终止...`);
          process.kill(pid, 'SIGKILL');
          console.log(`进程 ${pid} 已强制终止`);
        } catch {
          console.log(`进程 ${pid} 已终止`);
        }
        resolve();
      }, gracefulTimeout);

      // Set up a check to see if process terminates before timeout
      const checkInterval = setInterval(() => {
        try {
          process.kill(pid, 0);
        } catch {
          // Process no longer exists
          console.log(`进程 ${pid} 已优雅关闭`);
          clearTimeout(timeoutId);
          clearInterval(checkInterval);
          resolve();
        }
      }, 200);
    });
  } catch (error) {
    console.error(
      `终止进程 ${pid} 失败:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Check for hanging processes related to gemini-any-llm
 */
function checkHangingProcesses(): void {
  try {
    const hangingProcesses = execSync(
      'ps aux | grep "node.*gemini-any-llm" | grep -v grep',
      {
        encoding: 'utf8',
        timeout: 5000,
      },
    );

    if (hangingProcesses.trim()) {
      console.log('\n发现悬挂进程:');
      console.log(hangingProcesses);
      console.log('\n你可能需要手动终止这些进程:');
      console.log('  pkill -f "node.*gemini-any-llm"');
    }
  } catch {
    // Ignore error if no process found
  }
}

/**
 * Entry point for gal kill command
 */
export async function runGalKill(): Promise<void> {
  await forceKillProcesses();
}
