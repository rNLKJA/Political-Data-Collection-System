import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { csvCell, toCsv } from "../csv";
import {
  applyDecision,
  AUDIT_COLUMNS,
  auditToCsv,
  auditToJson,
  createIndexedDbAuditStore,
  createMemoryAuditStore,
  isReviewable,
  newAuditEntry,
  newestFirst,
  normaliseEntry,
  redactSecrets,
  substitutedModel,
  type AuditEntry,
  type AuditStore,
  type NewAuditEntry,
} from "./audit-log";

const KEY = "sk-ant-api03-SECRET-KEY-VALUE-1234";

function fields(over: Partial<NewAuditEntry> = {}): NewAuditEntry {
  return {
    feature: "topic-labels",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    input: { system: "sys", user: "[T001] excerpt text", meta: { item_ids: ["T001"] } },
    output: { labels: [{ id: "T001", topic: "health" }] },
    raw_output: null,
    error: null,
    latency_ms: 812.4,
    usage: { input_tokens: 800, output_tokens: 60 },
    ...over,
  };
}

describe("audit entries", () => {
  it("have every governance field, start pending and round latency", () => {
    const e = newAuditEntry(fields({ timestamp: "2026-10-06T00:00:00.000Z" }), KEY);
    expect(Object.keys(e).sort()).toEqual([...AUDIT_COLUMNS].sort());
    expect(e.decision).toBe("pending");
    expect(e.latency_ms).toBe(812);
    expect(e.timestamp).toBe("2026-10-06T00:00:00.000Z");
    expect(e.id).toMatch(/[0-9a-f-]{8,}/);
  });

  it("never stores the API key, wherever it appears", () => {
    const leaky = fields({
      input: { system: `key=${KEY}`, user: "x", meta: { nested: [KEY, { k: KEY }] } },
      error: { kind: "invalid_key", message: `Incorrect API key provided: ${KEY}` },
      raw_output: KEY,
    });
    const e = newAuditEntry(leaky, KEY);
    expect(JSON.stringify(e)).not.toContain(KEY);
    expect(JSON.stringify(e)).toContain("[redacted key]");
    // short or empty "secrets" are not used for redaction (would mangle normal text)
    expect(redactSecrets({ a: "abc" }, ["", "ab"])).toEqual({ a: "abc" });
  });

  it("tells a dated snapshot of the requested model from a different model", () => {
    expect(substitutedModel("claude-haiku-4-5", "claude-haiku-4-5")).toBeNull();
    expect(substitutedModel("claude-haiku-4-5", "claude-haiku-4-5-20251001")).toBeNull();
    expect(substitutedModel("gpt-5-mini", "gpt-5-mini-2025-08-07")).toBeNull();
    expect(substitutedModel("gpt-5-mini", null)).toBeNull();
    expect(substitutedModel("claude-sonnet-5-5", "claude-opus-4-1")).toBe("claude-opus-4-1");
    expect(substitutedModel("gpt-5", "gpt-5-mini-2025-08-07")).toBe("gpt-5-mini-2025-08-07");
  });

  it("counts only answered calls as reviewable", () => {
    expect(isReviewable(newAuditEntry(fields(), KEY))).toBe(true);
    expect(
      isReviewable(newAuditEntry(fields({ error: { kind: "network", message: "x" } }), KEY)),
    ).toBe(false);
  });

  it("records human decisions, keeping an edit only for 'edited'", () => {
    const e = newAuditEntry(fields(), KEY);
    const at = new Date("2026-10-06T01:02:03.000Z");
    const edited = applyDecision(
      e,
      { decision: "edited", edited_output: { label: "REFUTES" }, decision_note: "  wrong  " },
      at,
    );
    expect(edited).toMatchObject({
      decision: "edited",
      edited_output: { label: "REFUTES" },
      decision_note: "wrong",
      decided_at: "2026-10-06T01:02:03.000Z",
    });
    const rejected = applyDecision(edited, { decision: "rejected", edited_output: { x: 1 } }, at);
    expect(rejected.edited_output).toBeNull();
    expect(rejected.decision_note).toBeNull();
  });

  it("keeps every decision in the history, so a later one never erases an earlier one", () => {
    const e = newAuditEntry(fields(), KEY);
    expect(e.decision_history).toEqual([]);
    const accepted = applyDecision(
      e,
      { decision: "accepted", decision_note: "looks right" },
      new Date("2026-10-06T01:00:00.000Z"),
    );
    const rejected = applyDecision(
      accepted,
      { decision: "rejected" },
      new Date("2026-10-06T02:00:00.000Z"),
    );
    expect(rejected.decision).toBe("rejected");
    expect(rejected.decision_history).toEqual([
      {
        decision: "accepted",
        edited_output: null,
        note: "looks right",
        at: "2026-10-06T01:00:00.000Z",
      },
      { decision: "rejected", edited_output: null, note: null, at: "2026-10-06T02:00:00.000Z" },
    ]);
    // the input record is not mutated
    expect(accepted.decision_history).toHaveLength(1);
  });

  it("gives records written before the history existed a history of their own decision", () => {
    const legacy = { ...newAuditEntry(fields(), KEY) } as Partial<AuditEntry>;
    delete legacy.decision_history;
    const pending = normaliseEntry(legacy as AuditEntry);
    expect(pending.decision_history).toEqual([]);
    const decided = normaliseEntry({
      ...(legacy as AuditEntry),
      decision: "accepted",
      decided_at: "2026-10-06T00:00:00.000Z",
    });
    expect(decided.decision_history).toEqual([
      { decision: "accepted", edited_output: null, note: null, at: "2026-10-06T00:00:00.000Z" },
    ]);
  });

  it("orders calls logged in the same millisecond by batch, newest batch first", () => {
    const at = "2026-10-06T00:00:00.000Z";
    const batch = (run: string, n: number) =>
      newAuditEntry(
        fields({
          timestamp: at,
          input: { system: "s", user: "u", meta: { run_id: run, batch: n } },
        }),
        KEY,
      );
    const entries = [batch("r1", 2), batch("r1", 4), batch("r1", 1), batch("r1", 3)];
    for (let k = 0; k < 5; k++) {
      const shuffled = [...entries].sort(() => (k % 2 ? 1 : -1));
      expect(shuffled.sort(newestFirst).map((e) => e.input.meta.batch)).toEqual([4, 3, 2, 1]);
    }
    const later = newAuditEntry(fields({ timestamp: "2026-10-06T00:00:01.000Z" }), KEY);
    expect([...entries, later].sort(newestFirst)[0].id).toBe(later.id);
    // different runs in the same millisecond stay grouped by run
    const other = [batch("r2", 1), batch("r2", 2)];
    const runs = [...entries, ...other].sort(newestFirst).map((e) => e.input.meta.run_id);
    expect(runs).toEqual(["r2", "r2", "r1", "r1", "r1", "r1"]);
  });
});

async function exercise(store: AuditStore) {
  const a = newAuditEntry(fields({ timestamp: "2026-10-06T00:00:01.000Z" }), KEY);
  const b = newAuditEntry(fields({ timestamp: "2026-10-06T00:00:02.000Z", provider: "mock" }), KEY);
  await store.add(a);
  await store.add(b);
  expect((await store.list()).map((e) => e.id)).toEqual([b.id, a.id]);
  const decided = await store.decide(a.id, { decision: "accepted" });
  expect(decided?.decision).toBe("accepted");
  expect((await store.get(a.id))?.decision).toBe("accepted");
  await store.decide(a.id, { decision: "rejected", decision_note: "changed my mind" });
  const trail = (await store.get(a.id))?.decision_history.map((h) => [h.decision, h.note]);
  expect(trail).toEqual([
    ["accepted", null],
    ["rejected", "changed my mind"],
  ]);
  expect(await store.decide("missing", { decision: "rejected" })).toBeUndefined();
  await store.clear();
  expect(await store.list()).toEqual([]);
}

describe("audit stores", () => {
  it("in memory", async () => {
    await exercise(createMemoryAuditStore());
  });

  it("in IndexedDB (fake-indexeddb)", async () => {
    await exercise(createIndexedDbAuditStore(new IDBFactory(), "test-db"));
  });

  it("explains when IndexedDB is unavailable", async () => {
    const store = createIndexedDbAuditStore(undefined, "nope");
    const had = globalThis.indexedDB;
    // vitest runs in node, where there is no IndexedDB
    expect(had).toBeUndefined();
    await expect(store.list()).rejects.toThrow(/IndexedDB/);
  });
});

describe("exports", () => {
  it("CSV quotes, escapes and defuses spreadsheet formulas", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(3)).toBe("3");
    expect(csvCell(true)).toBe("true");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell({ a: [1, 2] })).toBe('"{""a"":[1,2]}"');
    expect(toCsv([{ a: 1, b: "x" }], ["a", "b"])).toBe("a,b\r\n1,x\r\n");
  });

  it("exports the log as JSON and CSV with one row per call", () => {
    const entries: AuditEntry[] = [newAuditEntry(fields(), KEY), newAuditEntry(fields(), KEY)];
    const json = JSON.parse(auditToJson(entries)) as { count: number; entries: AuditEntry[] };
    expect(json.count).toBe(2);
    expect(json.entries[0].id).toBe(entries[0].id);
    const csv = auditToCsv(entries);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(AUDIT_COLUMNS.join(","));
    expect(lines).toHaveLength(3);
    expect(csv).not.toContain(KEY);
  });
});
