import fs from 'fs/promises';
import path from 'path';

const ignoredDirs = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', '.lilac']);

export const workspaceRoot = process.cwd();

export function resolveWorkspacePath(inputPath = '.'): string {
  const normalizedInput = inputPath.replace(/\\/g, '/');
  const absolute = path.resolve(workspaceRoot, normalizedInput);
  const relative = path.relative(workspaceRoot, absolute);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path is outside workspace root.');
  }

  return absolute;
}

export function toWorkspaceRelative(absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).replace(/\\/g, '/') || '.';
}

export async function listWorkspaceFiles(inputPath = '.', limit = 120): Promise<string[]> {
  const start = resolveWorkspacePath(inputPath);
  const results: string[] = [];

  async function visit(current: string) {
    if (results.length >= limit) {
      return;
    }

    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (results.length >= limit) {
        return;
      }
      if (entry.name.startsWith('.') && entry.name !== '.env.example') {
        continue;
      }

      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) {
          continue;
        }
        await visit(absolute);
        continue;
      }

      if (entry.isFile()) {
        results.push(toWorkspaceRelative(absolute));
      }
    }
  }

  const stat = await fs.stat(start);
  if (stat.isFile()) {
    return [toWorkspaceRelative(start)];
  }

  await visit(start);
  return results;
}

export async function readWorkspaceFile(inputPath: string, maxChars: number): Promise<{
  path: string;
  truncated: boolean;
  content: string;
}> {
  const absolutePath = resolveWorkspacePath(inputPath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error('Target is not a file.');
  }

  const content = await fs.readFile(absolutePath, 'utf-8');
  return {
    path: toWorkspaceRelative(absolutePath),
    truncated: content.length > maxChars,
    content: content.slice(0, maxChars),
  };
}

export async function writeWorkspaceFile(inputPath: string, content: string): Promise<{ path: string; bytes: number }> {
  const absolutePath = resolveWorkspacePath(inputPath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content);
  return {
    path: toWorkspaceRelative(absolutePath),
    bytes: Buffer.byteLength(content),
  };
}

export async function searchWorkspace(pattern: string, inputPath = '.', limit = 80): Promise<string[]> {
  const root = resolveWorkspacePath(inputPath);
  const proc = Bun.spawn(['rg', '--line-number', '--color', 'never', '--glob', '!node_modules/**', pattern, root], {
    cwd: workspaceRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode > 1) {
    throw new Error(stderr.trim() || `rg exited with code ${exitCode}`);
  }

  return stdout
    .split('\n')
    .filter(Boolean)
    .slice(0, limit)
    .map(line => line.replace(`${workspaceRoot}/`, ''));
}

