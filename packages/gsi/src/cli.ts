import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { convertRecording } from './convert.js';
import { toFreezeSnapshot } from './freeze-snapshot.js';
import { MockGsiFeed } from './mock-feed.js';
import { appendRecordingLine, readRecording } from './record.js';
import { GsiServer } from './server.js';
import type { GameState, Side } from './types.js';

function main(): void {
  process.stdout.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') {
      process.exit(0);
    }
  });

  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }

  try {
    if (argv.includes('--convert') && argv.includes('--record')) {
      throw new Error('Use --convert or --record, not both.');
    }

    const convertFile = flagValue(argv, '--convert');
    if (argv.includes('--convert')) {
      if (!convertFile) {
        throw new Error('--convert needs a JSONL recording.');
      }
      const outFile = flagValue(argv, '--out');
      if (argv.includes('--out') && !outFile) {
        throw new Error('--out needs a file path.');
      }
      const ourSide = readSideFlag(flagValue(argv, '--side') ?? process.env.GSI_SIDE);
      const overtimeLimit = readOvertimeLimit(
        flagValue(argv, '--overtime-limit') ?? process.env.GSI_OVERTIME_LIMIT,
      );
      runConvert(convertFile, outFile, ourSide, overtimeLimit, argv.includes('--array'));
      return;
    }

    const recordFile = flagValue(argv, '--record') ?? (argv.includes('--record') ? undefined : process.env.GSI_RECORD);
    if (argv.includes('--record') && !recordFile) {
      throw new Error('--record needs a file path.');
    }

    const ourSide = readSideFlag(flagValue(argv, '--side') ?? process.env.GSI_SIDE);
    const overtimeLimit = readOvertimeLimit(
      flagValue(argv, '--overtime-limit') ?? process.env.GSI_OVERTIME_LIMIT,
    );

    if (argv.includes('--mock')) {
      if (recordFile) {
        throw new Error('--record applies to the live listener, not --mock.');
      }
      const interval = readNumber(flagValue(argv, '--mock-interval')) ?? 0;
      void runMock(interval, ourSide, overtimeLimit).catch((error: unknown) => {
        console.error('[gsi] mock feed failed', error);
        process.exitCode = 1;
      });
      return;
    }

    const host = flagValue(argv, '--host') ?? process.env.GSI_HOST ?? '127.0.0.1';
    const port = readNumber(flagValue(argv, '--port') ?? process.env.GSI_PORT) ?? 3000;
    const authToken = flagValue(argv, '--token') ?? process.env.GSI_TOKEN;

    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
      console.error(
        `[gsi] listening on ${host}. Prefer 127.0.0.1 so buy-phase money stays on this machine.`,
      );
    }

    if (recordFile) {
      prepareRecordFile(recordFile);
    }

    const server = new GsiServer({
      host,
      port,
      ...(authToken ? { authToken } : {}),
      ...(recordFile
        ? {
            onAccepted: (event: { payload: unknown; receivedAt: Date }) => {
              try {
                appendRecordingLine(recordFile, event.payload, event.receivedAt);
              } catch (error) {
                console.error('[gsi] recording failed', error);
              }
            },
          }
        : {}),
      onState: (state) => {
        printState(state, ourSide, overtimeLimit);
      },
    });

    void server
      .start()
      .then((address) => {
        console.error(
          `[gsi] listening on http://${address.host}:${address.port}  (POST /gsi, GET /state)`,
        );
        console.error('[gsi] smoke page: GET /   mock feed: npm run mock');
        if (recordFile) {
          console.error(`[gsi] recording to ${recordFile}`);
        }
      })
      .catch((error: unknown) => {
        console.error('[gsi] failed to listen', error);
        process.exitCode = 1;
      });

    const shutdown = (): void => {
      void server.stop().finally(() => {
        process.exit(0);
      });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error(`[gsi] ${error instanceof Error ? error.message : 'failed to start'}`);
    process.exitCode = 1;
  }
}

function runConvert(
  file: string,
  outFile: string | undefined,
  ourSide: Side | undefined,
  overtimeLimit: 0 | 1,
  asArray: boolean,
): void {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'read failed';
    console.error(`[gsi] could not read ${file}: ${message}`);
    process.exitCode = 1;
    return;
  }

  try {
    const match = convertRecording(readRecording(text), {
      ...(ourSide ? { ourSide } : {}),
      overtimeLimit,
    });
    const body = asArray ? match.rounds : match;
    const json = `${JSON.stringify(body, null, 2)}\n`;
    if (outFile) {
      writeFileSync(outFile, json);
      console.error(`[gsi] wrote ${match.rounds.length} rounds to ${outFile}`);
    } else {
      process.stdout.write(json);
      console.error(`[gsi] ${match.rounds.length} rounds`);
    }
  } catch (error) {
    console.error(`[gsi] ${error instanceof Error ? error.message : 'convert failed'}`);
    process.exitCode = 1;
  }
}

function prepareRecordFile(file: string): void {
  const directory = path.dirname(file);
  if (!existsSync(directory)) {
    throw new Error(`recording directory does not exist: ${directory}`);
  }
  appendFileSync(file, '', { flag: 'a' });
}

async function runMock(
  intervalMs: number,
  ourSide: Side | undefined,
  overtimeLimit: 0 | 1,
): Promise<void> {
  const feed = new MockGsiFeed();
  const count = await feed.load();
  console.error(`[gsi] replaying ${count} freeze-time fixtures`);
  await feed.play((state) => {
    printState(state, ourSide, overtimeLimit);
  }, intervalMs);
}

function printState(state: GameState, ourSide: Side | undefined, overtimeLimit: 0 | 1): void {
  const headline = `${state.map.name ?? 'unknown map'} round ${state.match.round} ${state.round.phase} CT ${state.score.ct}-${state.score.t} T`;
  try {
    const snapshot = toFreezeSnapshot(state, {
      ...(ourSide ? { ourSide } : {}),
      overtimeLimit,
    });
    console.error(
      `[gsi] ${headline} | freeze round ${snapshot.roundNumber} ${snapshot.ourSide} players ${snapshot.ourPlayers.length} history ${snapshot.history.length}`,
    );
    console.error(`[gsi] toFreezeSnapshot ${JSON.stringify(snapshot)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'snapshot unavailable';
    console.error(`[gsi] ${headline} | ${message}`);
  }
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
}

function printHelp(): void {
  console.log(`RoundMind GSI listener

Usage:
  npm run dev -- [--host 127.0.0.1] [--port 3000] [--token <secret>] [--side CT|T] [--overtime-limit 0|1] [--record <file.jsonl>]
  npm run convert -- <file.jsonl> [--out <match.json>] [--array] [--side CT|T] [--overtime-limit 0|1]
  npm run mock -- [--mock-interval <ms>]

POST CS2 Game State Integration JSON to / or /gsi.
GET / prints an HTML view of the latest GameState.
GET /state returns that GameState as JSON.
stderr logs toFreezeSnapshot JSON for evaluateFreeze (@roundmind/engine).

--record appends each accepted payload to a JSONL file (version 1).
--convert writes match schema v1: { schemaVersion: 1, map?, rounds }.
--array writes only the rounds array for the post-match CLI on main.
The review UI reads schema v1.
--side overrides GameState.playerSide on the live log. During --convert it is
only the fallback when a payload has no focused player. --overtime-limit
defaults to 1 (Premier).
Environment: GSI_HOST, GSI_PORT, GSI_TOKEN, GSI_SIDE, GSI_OVERTIME_LIMIT, GSI_RECORD.
`);
}

function flagValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    return undefined;
  }
  return value;
}

function readNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

function readSideFlag(value: string | undefined): Side | undefined {
  if (value === undefined) {
    return undefined;
  }
  const upper = value.toUpperCase();
  if (upper === 'CT' || upper === 'T') {
    return upper;
  }
  console.error(`[gsi] ignoring --side ${value}. Use CT or T.`);
  return undefined;
}

function readOvertimeLimit(value: string | undefined): 0 | 1 {
  if (value === undefined || value === '1') {
    return 1;
  }
  if (value === '0') {
    return 0;
  }
  console.error(`[gsi] ignoring overtime limit ${value}. Use 1 (Premier) or 0 (repeated OT).`);
  return 1;
}

main();
