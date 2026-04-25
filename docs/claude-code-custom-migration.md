# Lilac migration plan from claude-code-custom

This plan ports the reusable product shape of `claude-code-custom` into Lilac without copying private Anthropic service bindings or native/platform shims that do not fit Lilac's OpenAI-compatible runtime.

## Target: 80% user-facing parity

The migration focuses on the features a CLI agent user touches most often:

1. Interactive REPL shell with slash commands, streaming answers, clear status, and keyboard exits.
2. Local configuration, model selection, permission mode, and session persistence.
3. Workspace-aware tools for reading files, listing files, searching text, and running shell commands.
4. Skills as portable agent behaviors, including listing and switching skills.
5. Claude-Code-like commands: `/help`, `/status`, `/model`, `/skills`, `/clear`, `/compact`, `/files`, `/permissions`, `/doctor`, `/exit`.
6. Better terminal presentation for system/tool/user/assistant messages.
7. Clear extension boundaries for future MCP, plugin, remote session, IDE, and voice features.

## Non-goals for this migration pass

- Anthropic-only auth, billing, rate-limit, Claude remote bridge, and official plugin marketplace internals.
- Native shims for url-handler, modifiers, audio capture, image processor, or computer-use packages.
- Full custom Ink renderer replacement. Lilac stays on upstream Ink.

## Implementation phases

### Phase 1: Command and session foundation

- Add command registry and parser.
- Add persistent config and session storage under `.lilac/`.
- Wire slash commands into `App`.
- Commit after the command layer builds.

### Phase 2: Workspace tools and permission mode

- Add list/read/search shell tools with workspace path guards.
- Add shell command execution with ask/auto/deny modes.
- Expose tool capabilities to the harness runtime.
- Commit after TypeScript validation.

### Phase 3: Claude-Code-like UI surface

- Add compact status header, command help, system/tool messages, and empty-state hints.
- Add `/doctor`, `/files`, `/compact`, and `/clear` interactions.
- Commit after a local smoke run.

### Phase 4: Documentation and parity report

- Update README with the migrated command surface and environment/config details.
- Add a parity checklist to describe what is done and what remains.
- Final commit with verification notes.

## Extension map

| claude-code-custom area | Lilac equivalent |
| --- | --- |
| `commands/*` | `src/commands/*` command registry |
| `skills/*` | `skills/*.md` and `src/core/skills.ts` |
| `utils/permissions/*` | lightweight `src/core/settings.ts` permission mode |
| `query/*` and tool runtime | `src/harness/*` and `src/harness/tools.ts` |
| `components/*` | `src/components/*` Ink UI |
| session/history utilities | `src/core/session.ts` |
| doctor/status commands | `/doctor` and `/status` |

