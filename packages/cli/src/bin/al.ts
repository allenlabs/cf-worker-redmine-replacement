#!/usr/bin/env node
// @allenlabs/cli — `al` binary entrypoint.
//
// Subcommands are thin wrappers; all the logic + I/O lives in src/commands/*.

/* v8 ignore start — commander wiring; exercised by humans + smoke tests. */

import { Command } from 'commander';
import {
  captureCommand,
  listCommand,
  transitionCommand,
} from '../commands/inbox.js';
import {
  startCommand,
  stopCommand,
  distractCommand,
  statusCommand,
} from '../commands/focus.js';
import { loginCommand } from '../commands/login.js';
import { configCommand } from '../commands/config.js';
import { shellPromptCommand } from '../commands/shell-prompt.js';

const VERSION = '0.1.0';

const program = new Command();
program
  .name('al')
  .description('Zero-friction CLI for the Allen Labs ADHD-developer SaaS suite')
  .version(VERSION, '-v, --version')
  .option('--verbose', 'verbose diagnostics on stderr')
  .option('--json', 'machine-readable output');

function flags(cmd: Command): { verbose?: boolean; json?: boolean } {
  // Pull flags from the root program AND the current sub-command so users
  // can write either `al --json inbox "x"` or `al inbox "x" --json`.
  const opts = cmd.optsWithGlobals() as { verbose?: boolean; json?: boolean };
  return { verbose: opts.verbose, json: opts.json };
}

// ---------- inbox ----------

const inbox = program.command('inbox').description('inbox capture + triage');
inbox
  .command('list')
  .description('list unread items')
  .action(async (_opts, cmd) => process.exit(await listCommand(flags(cmd))));
inbox
  .command('done <id>')
  .description('mark an item done')
  .action(async (id: string, _opts, cmd) =>
    process.exit(await transitionCommand('done', Number(id), flags(cmd))),
  );
inbox
  .command('drop <id>')
  .description('mark an item dropped')
  .action(async (id: string, _opts, cmd) =>
    process.exit(await transitionCommand('drop', Number(id), flags(cmd))),
  );
inbox
  .command('capture <text...>')
  .description('capture a new item (explicit form)')
  .option('-t, --tag <tag>', 'add a tag (repeatable)', (v, prev: string[] = []) => [...prev, v], [] as string[])
  .action(async (textParts: string[], opts: { tag?: string[] }, cmd) =>
    process.exit(await captureCommand(textParts.join(' '), { ...flags(cmd), tag: opts.tag })),
  );

// ---------- focus ----------

const focus = program.command('focus').description('focus sessions (Pomodoro)');
focus
  .command('start <text...>')
  .description('start a focus session')
  .option('-m, --minutes <n>', 'target duration in minutes', '25')
  .action(async (textParts: string[], opts: { minutes: string }, cmd) =>
    process.exit(
      await startCommand(textParts.join(' '), Number(opts.minutes), flags(cmd)),
    ),
  );
focus
  .command('stop')
  .description('end the current session')
  .action(async (_opts, cmd) => process.exit(await stopCommand(flags(cmd))));
focus
  .command('distract <label...>')
  .description('log a distraction in the current session')
  .action(async (parts: string[], _opts, cmd) =>
    process.exit(await distractCommand(parts.join(' '), flags(cmd))),
  );
focus
  .command('status')
  .description('show the current session (zero-latency, local cache)')
  .action(async (_opts, cmd) => process.exit(await statusCommand(flags(cmd))));

// ---------- top-level ----------

program
  .command('login')
  .description('interactive setup: endpoints + HMAC secrets')
  .action(async (_opts, cmd) => process.exit(await loginCommand(flags(cmd))));

program
  .command('config')
  .description('show resolved config + endpoint health')
  .action(async (_opts, cmd) => process.exit(await configCommand(flags(cmd))));

program
  .command('shell-prompt')
  .description('print a one-line PS1 snippet for the current focus session')
  .action(async () => process.exit(await shellPromptCommand()));

// ---------- shorthand: `al "thought"` → inbox capture ----------
//
// commander has no native "default subcommand from positional", so we
// inspect argv first and fall through to capture when the first non-flag
// arg isn't a known subcommand.

const KNOWN_SUBCOMMANDS = new Set([
  'inbox', 'focus', 'login', 'config', 'shell-prompt', 'help',
]);

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const firstNonFlag = argv.find((a) => !a.startsWith('-'));
  if (firstNonFlag && !KNOWN_SUBCOMMANDS.has(firstNonFlag)) {
    // Treat all positional words as the capture text; preserve flag flags.
    const textParts = argv.filter((a) => !a.startsWith('-'));
    const wantsJson = argv.includes('--json');
    const wantsVerbose = argv.includes('--verbose');
    process.exit(
      await captureCommand(textParts.join(' '), {
        json: wantsJson,
        verbose: wantsVerbose,
      }),
    );
    return;
  }
  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
});

/* v8 ignore stop */
