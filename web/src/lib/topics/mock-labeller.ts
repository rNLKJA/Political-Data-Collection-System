/**
 * The simulated labeller behind the no-key demo on /topics. It is not a
 * model and calls nothing: for each excerpt it returns the gold label with
 * probability `accuracy`, otherwise a different codebook label chosen at
 * random, all from a seeded generator. It exists so the evaluation harness,
 * the audit log and the exports can be tried without an API key, and every
 * screen that shows its output says "Simulated".
 */
import { mulberry32 } from "@/lib/stats/random";

import { TOPIC_IDS, type TopicId } from "./codebook";

export const MOCK_MODEL_ID = "simulated-labeller-v1";
export const MOCK_ACCURACY = 0.7;

/** FNV-1a hash of a string, so each excerpt gets its own reproducible stream. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mockLabel(
  item: { id: string; gold: TopicId },
  seed: number,
  accuracy = MOCK_ACCURACY,
): TopicId {
  const rng = mulberry32((seed ^ hashString(item.id)) >>> 0);
  if (rng() < accuracy) return item.gold;
  const others = TOPIC_IDS.filter((t) => t !== item.gold);
  return others[Math.floor(rng() * others.length)];
}
