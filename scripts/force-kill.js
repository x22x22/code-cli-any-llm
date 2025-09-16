#!/usr/bin/env node

/**
 * Force kill script for zombie processes
 * Run this if Ctrl+C doesn't properly kill the process
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get the project root directory
const projectRoot = process.cwd();

// Check for .pid file
const pidFile = path.join(projectRoot, '.development.pid');
let pid = null;

try {
  if (fs.existsSync(pidFile)) {
    pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
    console.log(`Found PID file: ${pid}`);
  }
} catch (error) {
  console.error('Error reading PID file:', error.message);
}

// If no PID file, try to find process by port
if (!pid) {
  try {
    const lsofOutput = execSync('lsof -ti:3002', { encoding: 'utf8' }).trim();
    if (lsofOutput) {
      pid = parseInt(lsofOutput.split('\n')[0]);
      console.log(`Found process on port 3002: ${pid}`);
    }
  } catch (error) {
    // Ignore error if no process found
  }
}

// If still no PID, try to find node processes related to the project
if (!pid) {
  try {
    const psOutput = execSync('ps aux | grep "node.*dist/main.js" | grep -v grep', { encoding: 'utf8' });
    if (psOutput) {
      const lines = psOutput.trim().split('\n');
      for (const line of lines) {
        const match = line.match(/\s+(\d+)\s+/);
        if (match) {
          pid = parseInt(match[1]);
          console.log(`Found running process: ${pid}`);
          break;
        }
      }
    }
  } catch (error) {
    // Ignore error if no process found
  }
}

if (pid) {
  try {
    // Try graceful shutdown first
    console.log(`Attempting graceful shutdown of process ${pid}...`);
    process.kill(pid, 'SIGTERM');

    // Wait for graceful shutdown
    setTimeout(() => {
      try {
        // Check if process is still running
        process.kill(pid, 0); // This throws if process doesn't exist
        console.log(`Process ${pid} is still running, forcing shutdown...`);
        process.kill(pid, 'SIGKILL');
        console.log(`Process ${pid} forcefully terminated`);
      } catch (error) {
        console.log(`Process ${pid} has been terminated`);
      }

      // Clean up PID file
      if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile);
        console.log('PID file removed');
      }
    }, 5000);
  } catch (error) {
    console.error(`Error killing process ${pid}:`, error.message);
  }
} else {
  console.log('No running development process found');
}

// Also check for any hanging node processes
try {
  const hangingProcesses = execSync('ps aux | grep "node.*gemini-any-llm" | grep -v grep', { encoding: 'utf8' });
  if (hangingProcesses) {
    console.log('\nFound hanging processes:');
    console.log(hangingProcesses);
    console.log('\nYou may need to manually kill these processes:');
    console.log('  pkill -f "node.*gemini-any-llm"');
  }
} catch (error) {
  // Ignore error if no process found
}