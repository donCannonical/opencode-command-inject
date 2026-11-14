/**
 * OpenCode V2 command adapter.
 *
 * Keep command discovery, configuration, naming and collision semantics in the
 * existing V1 catalog builder. This adapter registers the resulting commands
 * with V2's command domain and does not execute any project scripts itself.
 *
 * A plain { id, setup } export is the V2 loader contract, so a second SDK
 * dependency is not needed just to define the plugin.
 */
import { createCommandInjectPlugin } from "./plugin"
import { injectCommandArguments } from "./command-sources/template"

interface CommandPrompt {
  text: string
  [key: string]: unknown
}

interface CommandInvocation {
  sessionID: string
  prompt: CommandPrompt
  delivery: "steer" | "queue"
}

interface CommandDefinition {
  name: string
  description?: string
  execute(input: CommandInvocation): Promise<void>
}

interface V2CommandContext {
  location: { directory: string }
  command: {
    list(): Promise<{ data: Array<{ name: string }> }>
    transform(callback: (editor: { add(command: CommandDefinition): void }) => void): Promise<unknown>
  }
  session: {
    prompt(input: CommandPrompt & { sessionID: string; delivery: CommandInvocation["delivery"] }): Promise<unknown>
  }
}

interface InjectedCommand {
  template: string
  description?: string
}

export default {
  id: "opencode-command-inject",
  async setup(ctx: V2CommandContext): Promise<void> {
    // Commands already registered by OpenCode, the user, or earlier plugins
    // have priority; the old config hook's collision policy is reused below.
    const existing = await ctx.command.list()
    const reservedNames = new Set(existing.data.map((command) => command.name))

    // Null-prototype registry handles script names such as "__proto__" safely.
    const configCommands: Record<string, InjectedCommand> = Object.create(null)
    for (const name of reservedNames) {
      configCommands[name] = { template: "", description: "" }
    }

    // The V1 factory constructs command metadata and reads files, but never
    // invokes the generated command. Only directory is needed by that logic.
    const legacy = createCommandInjectPlugin()
    const hooks = await legacy({ directory: ctx.location.directory } as Parameters<typeof legacy>[0])
    if (!hooks.config) {
      throw new Error("[command-inject] legacy catalog hook unavailable")
    }
    await hooks.config({ command: configCommands } as never)

    // Sample the discovery result once. Transform callbacks are replayed by
    // OpenCode and therefore must be synchronous and free of filesystem I/O.
    const commands = Object.entries(configCommands)
      .filter(([name]) => !reservedNames.has(name))
      .map(([name, command]) => ({ name, ...command }))

    await ctx.command.transform((editor) => {
      for (const command of commands) {
        editor.add({
          name: command.name,
          description: command.description,
          async execute({ sessionID, prompt, delivery }) {
            // V2 supplies arguments in prompt.text. Preserve attachments and
            // delivery policy; the normal agent tool permissions still apply.
            await ctx.session.prompt({
              ...prompt,
              sessionID,
              text: injectCommandArguments(command.template, prompt.text),
              delivery,
            })
          },
        })
      }
    })
  },
}
