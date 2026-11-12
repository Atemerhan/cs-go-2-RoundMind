import { blueprintRoundsForEngine, MATCH_SCHEMA_VERSION, type MatchDocument } from "@roundmind/post-match";

/** In-memory copy of `post-match/examples/match.json` for the static Pages build. */
export function sampleDocument(): MatchDocument {
  const rounds = blueprintRoundsForEngine();
  return {
    schemaVersion: MATCH_SCHEMA_VERSION,
    label: "Sample match",
    rounds,
  };
}
