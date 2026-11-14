import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import adapter from "./v2"
import { mkdir, withTempDir, writeText } from "./test-utils/temp-dir"

type Command = {
  name: string
  description?: string
  execute(input: {
    sessionID: string
    prompt: { text: string; attachments?: unknown[] }
    delivery: "steer" | "queue"
  }): Promise<void>
}

function fakeContext(directory: string, existingNames: string[] = []) {
  const registered: Command[] = []
  const prompt = vi.fn(async () => undefined)
  const ctx = {
    location: { directory },
    command: {
      list: vi.fn(async () => ({ data: existingNames.map((name) => ({ name })) })),
      transform: vi.fn(async (fn: (editor: { add(command: Command): void }) => void) => {
        fn({ add: (command) => registered.push(command) })
      }),
    },
    session: { prompt },
  }
  return { ctx, prompt, registered }
}

async function seedProject(directory: string) {
  await writeText(join(directory, "Makefile"), "build: ## Build app\n\t@echo built\n")
  await writeText(join(directory, "package.json"), JSON.stringify({
    scripts: { verify: "echo verified" },
  }))
  await mkdir(join(directory, ".opencode"))
  await writeText(join(directory, ".opencode/opencode-command-inject.json"), JSON.stringify({
    sources: { skill: { disable: true } },
  }))
}

describe("OpenCode V2 Command Inject adapter", () => {
  it("registers Makefile and npm scripts and forwards arguments exactly once", async () => {
    await withTempDir(async (directory) => {
      await seedProject(directory)
      const { ctx, prompt, registered } = fakeContext(directory)
      await adapter.setup(ctx)

      expect(registered.map(({ name }) => name)).toContain("make:build")
      expect(registered.map(({ name }) => name)).toContain("npm:verify")

      const command = registered.find(({ name }) => name === "make:build")!
      const attachments = [{ type: "file", url: "file:///fixture.txt" }]
      await command.execute({
        sessionID: "ses_test",
        prompt: { text: "-n", attachments },
        delivery: "queue",
      })
      expect(prompt).toHaveBeenCalledTimes(1)
      expect(prompt).toHaveBeenCalledWith({
        sessionID: "ses_test",
        text: "Use shell to execute `make build -n`",
        attachments,
        delivery: "queue",
      })
    })
  })

  it("does not overwrite an existing command of the same name", async () => {
    await withTempDir(async (directory) => {
      await seedProject(directory)
      const { ctx, registered } = fakeContext(directory, ["make:build"])
      await adapter.setup(ctx)
      expect(registered.map(({ name }) => name)).not.toContain("make:build")
      expect(registered.map(({ name }) => name)).toContain("npm:verify")
    })
  })

  it("respects disabled sources and does not register unrelated commands", async () => {
    await withTempDir(async (directory) => {
      await mkdir(join(directory, ".opencode"))
      await writeText(join(directory, ".opencode/opencode-command-inject.json"), JSON.stringify({
        sources: { skill: { disable: true } },
      }))
      const { ctx, registered } = fakeContext(directory)
      await adapter.setup(ctx)
      expect(registered).toEqual([])
    })
  })
})
