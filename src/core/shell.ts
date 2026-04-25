import { loadSettings } from './settings';
import { workspaceRoot } from './workspace';

const defaultTimeoutMs = 30000;

export async function runWorkspaceShell(command: string, timeoutMs = defaultTimeoutMs): Promise<{
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  const settings = await loadSettings();
  if (settings.permissionMode !== 'auto') {
    throw new Error(`Shell execution requires /permissions auto. Current mode is ${settings.permissionMode}.`);
  }

  const proc = Bun.spawn(['bash', '-lc', command], {
    cwd: workspaceRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    return {
      command,
      exitCode,
      stdout: stdout.slice(0, settings.maxToolOutputChars),
      stderr: stderr.slice(0, settings.maxToolOutputChars),
      timedOut,
    };
  } finally {
    clearTimeout(timeout);
  }
}

