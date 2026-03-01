import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ControlUiEnglishSourceManifest } from "../infra/control-ui-assets.js";

const agentCommand = vi.fn();

vi.mock("../commands/agent.js", () => ({ agentCommand }));

const { ControlUiI18nService } = await import("./control-ui-i18n.js");

type InternalJobRecord = {
  jobId: string;
  locale: string;
  status: "queued" | "running" | "completed" | "failed";
  requestedAtMs: number;
  startedAtMs?: number;
  finishedAtMs?: number;
  error?: string;
  requesterConnId?: string;
  force: boolean;
};

type ServiceInternals = {
  jobsById: Map<string, InternalJobRecord>;
  generateTranslatedFlatMap: (
    manifest: ControlUiEnglishSourceManifest,
    params: { locale: string; sessionKey: string },
  ) => Promise<Record<string, string>>;
};

describe("ControlUiI18nService", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  async function createService() {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-controlui-i18n-"));
    tempDirs.push(stateDir);
    return new ControlUiI18nService({
      stateDir,
      controlUiRoot: undefined,
      broadcast: () => {},
    });
  }

  it("omits internal force field from list jobs payload", async () => {
    const service = await createService();
    const internal = service as unknown as ServiceInternals;
    internal.jobsById.set("job-1", {
      jobId: "job-1",
      locale: "uk",
      status: "queued",
      requestedAtMs: Date.now(),
      force: true,
    });

    const result = await service.list();

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).not.toHaveProperty("force");
  });

  it("passes generation timeout to agent command in seconds", async () => {
    agentCommand.mockResolvedValue({
      payloads: [{ text: JSON.stringify({ "section.hello": "Привіт" }) }],
    });
    const service = await createService();
    const internal = service as unknown as ServiceInternals;
    const manifest: ControlUiEnglishSourceManifest = {
      schemaVersion: 1,
      sourceLocale: "en",
      sourceHash: "hash",
      keyCount: 1,
      flat: {
        "section.hello": "Hello",
      },
    };

    await expect(
      internal.generateTranslatedFlatMap(manifest, {
        locale: "uk",
        sessionKey: "controlui-i18n:uk:test-job-id",
      }),
    ).resolves.toEqual({
      "section.hello": "Привіт",
    });

    expect(agentCommand).toHaveBeenCalledTimes(1);
    expect(agentCommand.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        timeout: "120",
      }),
    );
  });

  it("uses unique per-job generation session keys", async () => {
    agentCommand.mockResolvedValue({
      payloads: [{ text: JSON.stringify({ "section.hello": "Привіт" }) }],
    });
    const service = await createService();
    const internal = service as unknown as ServiceInternals;
    const manifest: ControlUiEnglishSourceManifest = {
      schemaVersion: 1,
      sourceLocale: "en",
      sourceHash: "hash",
      keyCount: 1,
      flat: {
        "section.hello": "Hello",
      },
    };

    await internal.generateTranslatedFlatMap(manifest, {
      locale: "uk",
      sessionKey: "controlui-i18n:uk:job-1",
    });
    await internal.generateTranslatedFlatMap(manifest, {
      locale: "uk",
      sessionKey: "controlui-i18n:uk:job-2",
    });

    expect(agentCommand.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        sessionKey: "controlui-i18n:uk:job-1",
      }),
    );
    expect(agentCommand.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        sessionKey: "controlui-i18n:uk:job-2",
      }),
    );
  });
});
