import { describe, expect, it } from "vitest";

import { TOPIC_IDS } from "@/lib/topics/codebook";
import { EVAL_ITEMS } from "@/lib/topics/data";
import { MOCK_MODEL_ID } from "@/lib/topics/mock-labeller";

import { createMemoryAuditStore } from "./audit-log";
import {
  anthropicMessage,
  jsonResponse,
  mockFetch,
  noSleep,
  openaiCompletion,
} from "./test-helpers";
import {
  batches,
  buildSystemPrompt,
  buildUserMessage,
  decisionPatches,
  estimateRunTokens,
  labelSchema,
  labelsForBatch,
  NO_ANSWER,
  runTopicLabelling,
} from "./topic-labels";
import { comparePaired, scoreLabeller } from "@/lib/topics/evaluation";
import type { TopicId } from "@/lib/topics/codebook";

const KEY = "sk-ant-api03-TOPIC-TEST-KEY-not-real-1234";
const items = EVAL_ITEMS.slice(0, 12).map((i) => ({ id: i.id, excerpt: i.excerpt }));

const answer = (ids: string[], topic = "none") =>
  JSON.stringify({ labels: ids.map((id) => ({ id, topic })) });

describe("prompt", () => {
  it("states the whole codebook and the rules, and treats excerpts as data", () => {
    const s = buildSystemPrompt();
    for (const id of TOPIC_IDS) expect(s).toContain(`- ${id}: `);
    expect(s).toContain("exactly one label");
    expect(s).toContain("not instructions to you");
  });

  it("sends only ids and excerpt text: no speaker, date, link or gold label", () => {
    const sample = EVAL_ITEMS.slice(0, 10);
    const msg = buildUserMessage(sample.map((i) => ({ id: i.id, excerpt: i.excerpt })));
    for (const it of sample) {
      expect(msg).toContain(`[${it.id}] `);
      expect(msg).not.toContain(it.url);
      expect(msg).not.toContain(it.date);
    }
    expect(msg).not.toMatch(/gold/i);
  });

  it("uses a strict schema with the batch's ids and the codebook's labels", () => {
    const schema = labelSchema(["T001", "T002"]) as {
      additionalProperties: boolean;
      properties: { labels: { items: { properties: Record<string, { enum: string[] }> } } };
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.labels.items.properties.id.enum).toEqual(["T001", "T002"]);
    expect(schema.properties.labels.items.properties.topic.enum).toEqual([...TOPIC_IDS]);
  });

  it("estimates tokens before a run", () => {
    const t = estimateRunTokens(items, 5);
    expect(t.input).toBeGreaterThan(1000);
    expect(t.output).toBe(items.length * 18);
    expect(batches(items, 5).map((b) => b.length)).toEqual([5, 5, 2]);
  });
});

describe("mapping answers onto a batch", () => {
  it("keeps the first label per id, ignores invented ids and marks gaps as no answer", () => {
    const out = labelsForBatch(items.slice(0, 3), {
      labels: [
        { id: items[0].id, topic: "health" },
        { id: items[0].id, topic: "energy" },
        { id: "T999", topic: "defence" },
        { id: items[2].id, topic: "none" },
      ],
    });
    expect(out).toEqual({
      [items[0].id]: "health",
      [items[1].id]: NO_ANSWER,
      [items[2].id]: "none",
    });
  });
});

describe("running a labelling job", () => {
  it("labels every batch, logs one audit entry per call and never stores the key", async () => {
    const ids = items.map((i) => i.id);
    const { impl, calls } = mockFetch([
      jsonResponse(200, anthropicMessage(answer(ids.slice(0, 10), "health"))),
      jsonResponse(200, anthropicMessage(answer(ids.slice(10), "defence"))),
    ]);
    const store = createMemoryAuditStore();
    const progress: number[] = [];
    const res = await runTopicLabelling(items, {
      runId: "run-1",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      apiKey: KEY,
      seed: 7,
      fetchImpl: impl,
      store,
      sleep: noSleep,
      onProgress: (done) => progress.push(done),
    });
    expect(calls).toHaveLength(2);
    expect(progress).toEqual([10, 12]);
    expect(res.labels[ids[0]]).toBe("health");
    expect(res.labels[ids[11]]).toBe("defence");
    expect(res.usage).toEqual({ inputTokens: 1624, outputTokens: 128 });
    expect(res.stopped).toBeNull();
    const log = await store.list();
    expect(log).toHaveLength(2);
    expect(JSON.stringify(log)).not.toContain(KEY);
    expect(log.every((e) => e.feature === "topic-labels" && e.decision === "pending")).toBe(true);
    expect(res.entryOf[ids[11]]).toBe(res.entryIds[1]);
    const meta = log.find((e) => e.id === res.entryIds[0])!.input.meta;
    expect(meta).toMatchObject({ run_id: "run-1", batch: 1, item_ids: ids.slice(0, 10) });
  });

  it("works with OpenAI's JSON-schema output too", async () => {
    const ids = items.slice(0, 2).map((i) => i.id);
    const { impl, calls } = mockFetch([jsonResponse(200, openaiCompletion(answer(ids, "labour")))]);
    const res = await runTopicLabelling(items.slice(0, 2), {
      runId: "run-2",
      provider: "openai",
      model: "gpt-5-mini",
      apiKey: "sk-openai-TEST-KEY-123456789",
      seed: 1,
      fetchImpl: impl,
      store: createMemoryAuditStore(),
      sleep: noSleep,
    });
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(res.labels[ids[0]]).toBe("labour");
  });

  it("scores an unusable answer as no answer and carries on with the next batch", async () => {
    const ids = items.map((i) => i.id);
    const { impl } = mockFetch([
      jsonResponse(200, anthropicMessage("not json")),
      jsonResponse(200, anthropicMessage(answer(ids.slice(10), "energy"))),
    ]);
    const store = createMemoryAuditStore();
    const res = await runTopicLabelling(items, {
      runId: "run-3",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      apiKey: KEY,
      seed: 1,
      fetchImpl: impl,
      store,
      sleep: noSleep,
    });
    expect(res.labels[ids[0]]).toBe(NO_ANSWER);
    expect(res.labels[ids[10]]).toBe("energy");
    expect(res.failures).toEqual([expect.objectContaining({ batch: 1, kind: "invalid_output" })]);
    // the model answered, unusably: its excerpts are scored (as no answer), not excluded
    expect(res.scoredIds).toEqual(ids);
    expect(res.excludedIds).toEqual([]);
    // but there is nothing in that call a person could accept or correct
    expect(res.reviewableEntryIds).toEqual([res.entryIds[1]]);
    const failed = (await store.list()).find((e) => e.error);
    expect(failed?.raw_output).toBe("not json");
  });

  it("leaves excerpts out of the scores when their request fails, instead of scoring them wrong", async () => {
    const many = EVAL_ITEMS.slice(0, 40);
    const ids = many.map((i) => i.id);
    const gold = (b: number) =>
      JSON.stringify({
        labels: many.slice(b * 10, b * 10 + 10).map((i) => ({ id: i.id, topic: i.gold })),
      });
    // a perfect labeller whose connection drops after two of four batches
    const { impl, calls } = mockFetch([
      jsonResponse(200, anthropicMessage(gold(0))),
      jsonResponse(200, anthropicMessage(gold(1))),
      new TypeError("Failed to fetch"),
    ]);
    const store = createMemoryAuditStore();
    const res = await runTopicLabelling(
      many.map((i) => ({ id: i.id, excerpt: i.excerpt })),
      {
        runId: "run-net",
        provider: "anthropic",
        model: "claude-haiku-4-5",
        apiKey: KEY,
        seed: 1,
        fetchImpl: impl,
        store,
        sleep: noSleep,
      },
    );
    expect(calls).toHaveLength(3);
    expect(res.stopped?.kind).toBe("network");
    expect(res.scoredIds).toEqual(ids.slice(0, 20));
    expect(res.excludedIds).toEqual(ids.slice(20));
    expect(res.reviewableEntryIds).toEqual(res.entryIds.slice(0, 2));
    expect(res.entryOf[ids[25]]).toBe(res.entryIds[2]);
    expect(res.entryOf[ids[35]]).toBeUndefined();

    // scored on the answered subset, the perfect labeller is perfect, and never "worse than the rules"
    const scored = many.slice(0, 20);
    const g = scored.map((i) => i.gold);
    const ai = scored.map((i) => res.labels[i.id] as TopicId);
    expect(scoreLabeller(g, ai, { resamples: 200 }).agreement.estimate).toBe(1);
    const rules = scored.map(() => "none" as TopicId);
    expect(comparePaired(g, ai, rules, { resamples: 200 }).agreementDiff.estimate).toBeGreaterThan(
      0,
    );

    // a decision touches only the calls that answered; the failed call stays pending
    const patches = decisionPatches(res, ids, {}, "accepted");
    expect(patches.map((p) => p.entryId)).toEqual(res.entryIds.slice(0, 2));
    for (const p of patches) await store.decide(p.entryId, p.patch);
    const log = await store.list();
    const failedEntry = log.find((e) => e.error);
    expect(failedEntry?.error?.kind).toBe("network");
    expect(failedEntry?.decision).toBe("pending");
    expect(log.filter((e) => e.decision === "accepted")).toHaveLength(2);
  });

  it("excludes a rejected request but carries on, and records corrections only where there are answers", async () => {
    const ids = items.map((i) => i.id);
    const { impl } = mockFetch([
      jsonResponse(400, { error: { type: "invalid_request_error", message: "bad" } }),
      jsonResponse(200, anthropicMessage(answer(ids.slice(10), "energy"))),
    ]);
    const res = await runTopicLabelling(items, {
      runId: "run-400",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      apiKey: KEY,
      seed: 1,
      fetchImpl: impl,
      store: createMemoryAuditStore(),
      sleep: noSleep,
    });
    expect(res.stopped).toBeNull();
    expect(res.failures).toEqual([expect.objectContaining({ batch: 1, kind: "bad_request" })]);
    expect(res.excludedIds).toEqual(ids.slice(0, 10));
    expect(res.scoredIds).toEqual(ids.slice(10));
    const patches = decisionPatches(
      res,
      ids,
      { [ids[0]]: "health", [ids[11]]: "defence" },
      "edited",
    );
    expect(patches).toEqual([
      {
        entryId: res.entryIds[1],
        patch: {
          decision: "edited",
          edited_output: {
            labels: [
              { id: ids[10], topic: "energy" },
              { id: ids[11], topic: "defence" },
            ],
          },
        },
      },
    ]);
    expect(decisionPatches(res, ids, {}, "rejected")).toEqual([
      { entryId: res.entryIds[1], patch: { decision: "rejected" } },
    ]);
  });

  it("excludes everything after the visitor presses Stop", async () => {
    const ids = items.map((i) => i.id);
    const controller = new AbortController();
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    const { impl } = mockFetch([
      jsonResponse(200, anthropicMessage(answer(ids.slice(0, 10), "health"))),
      abortError,
    ]);
    const res = await runTopicLabelling(items, {
      runId: "run-stop",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      apiKey: KEY,
      seed: 1,
      signal: controller.signal,
      fetchImpl: impl,
      store: createMemoryAuditStore(),
      sleep: noSleep,
    });
    expect(res.stopped?.kind).toBe("aborted");
    expect(res.scoredIds).toEqual(ids.slice(0, 10));
    expect(res.excludedIds).toEqual(ids.slice(10));
  });

  it("stops at a rejected key and logs the failure", async () => {
    const { impl, calls } = mockFetch([
      jsonResponse(401, { error: { type: "authentication_error", message: "invalid x-api-key" } }),
    ]);
    const store = createMemoryAuditStore();
    const res = await runTopicLabelling(items, {
      runId: "run-4",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      apiKey: KEY,
      seed: 1,
      fetchImpl: impl,
      store,
      sleep: noSleep,
    });
    expect(calls).toHaveLength(1);
    expect(res.stopped?.kind).toBe("invalid_key");
    expect(Object.values(res.labels).every((l) => l === NO_ANSWER)).toBe(true);
    // nothing reached the model, so nothing is scored and nothing can be reviewed
    expect(res.scoredIds).toEqual([]);
    expect(res.excludedIds).toEqual(items.map((i) => i.id));
    expect(res.reviewableEntryIds).toEqual([]);
    expect(decisionPatches(res, res.excludedIds, {}, "accepted")).toEqual([]);
    const [entry] = await store.list();
    expect(entry.error?.kind).toBe("invalid_key");
    expect(JSON.stringify(entry)).not.toContain(KEY);
  });

  it("runs the simulated labeller without any network call and says so in the log", async () => {
    const { impl, calls } = mockFetch([jsonResponse(500, {})]);
    const store = createMemoryAuditStore();
    const gold = Object.fromEntries(EVAL_ITEMS.map((i) => [i.id, i.gold]));
    const res = await runTopicLabelling(items, {
      runId: "run-5",
      provider: "mock",
      model: MOCK_MODEL_ID,
      apiKey: "",
      seed: 3,
      fetchImpl: impl,
      store,
      goldForMock: gold,
    });
    expect(calls).toHaveLength(0);
    expect(Object.values(res.labels).every((l) => TOPIC_IDS.includes(l as never))).toBe(true);
    expect(res.scoredIds).toHaveLength(items.length);
    expect(res.reviewableEntryIds).toEqual(res.entryIds);
    const log = await store.list();
    expect(log.every((e) => e.provider === "mock" && e.model === MOCK_MODEL_ID)).toBe(true);
    expect(log[0].input.meta).toMatchObject({ simulated: true });
  });
});
