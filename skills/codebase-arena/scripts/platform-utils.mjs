import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const windowsReservedName = /^(con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function isPortableSegment(value) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 100
    && /^[A-Za-z0-9._-]+$/.test(value)
    && value !== '.'
    && value !== '..'
    && !value.endsWith('.')
    && !windowsReservedName.test(value);
}

export function assertPortableSegment(value, label) {
  if (!isPortableSegment(value)) throw new Error(`${label} is not a portable file-name segment`);
  return value;
}

export function removeTree(target) {
  rmSync(path.resolve(target), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

export function childEnvironment(allowlist = []) {
  const common = ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'CI'];
  const windows = [
    'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
    'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)'
  ];
  const names = new Set([...common, ...windows, ...allowlist]);
  return Object.fromEntries([...names].filter((name) => process.env[name] !== undefined).map((name) => [name, process.env[name]]));
}

export function terminateProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return { method: 'none', success: false, error: 'invalid-pid' };
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, encoding: 'utf8' });
    if (result.status === 0) return { method: 'taskkill-tree', success: true, error: null };
    try {
      process.kill(pid, 'SIGTERM');
      return { method: 'direct-fallback', success: true, error: (result.stderr || result.stdout || '').trim() || null };
    } catch (error) {
      return { method: 'taskkill-and-direct-fallback', success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  try {
    process.kill(-pid, 'SIGTERM');
    return { method: 'process-group-sigterm', success: true, error: null };
  } catch (error) {
    return { method: 'process-group-sigterm', success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function assertWindowsPathBudget(target, suffixBudget = 0) {
  if (process.platform === 'win32' && path.resolve(target).length + suffixBudget >= 240) {
    throw new Error(`Windows path budget exceeded; choose a shorter evaluation root: ${target}`);
  }
}
