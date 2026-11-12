import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Writes RoundMind's read-only Game State Integration cfg into a CS2 install.
 * It reads Steam library metadata and writes one text file. It does not start
 * CS2, read process memory, or send keyboard, mouse, or console input.
 */

export const GSI_CFG_FILENAME = 'gamestate_integration_roundmind.cfg';
export const CS2_APP_ID = '730';

const CS2_CFG_PARTS = [
  'steamapps',
  'common',
  'Counter-Strike Global Offensive',
  'game',
  'csgo',
  'cfg',
] as const;

export class InstallCfgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstallCfgError';
  }
}

export interface SteamLibrary {
  path: string;
  appIds: string[];
}

export interface InstallOptions {
  cfgDir?: string;
  steamDir?: string;
  dryRun?: boolean;
  force?: boolean;
  platform?: NodeJS.Platform;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  /** When set, skip the live Windows registry query and use these Steam roots. */
  registrySteamPaths?: string[];
  cwd?: string;
}

export interface InstallOutcome {
  targetPath: string;
  contents: string;
  action: 'dry-run' | 'wrote' | 'unchanged';
  differs: boolean;
}

type VdfMap = { [key: string]: VdfValue };
type VdfValue = string | VdfMap;

export function readExampleCfg(): string {
  const cfgPath = fileURLToPath(new URL('../examples/gamestate_integration_roundmind.cfg', import.meta.url));
  return readFileSync(cfgPath, 'utf8');
}

export function defaultSteamRoots(options: {
  platform: NodeJS.Platform;
  homeDir: string;
  env: NodeJS.ProcessEnv;
  registrySteamPaths: string[];
}): string[] {
  const { platform, homeDir, env, registrySteamPaths } = options;
  const roots: string[] = [];
  if (platform === 'win32') {
    const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const programFiles = env.ProgramFiles || 'C:\\Program Files';
    roots.push(
      ...registrySteamPaths,
      path.win32.join(programFilesX86, 'Steam'),
      path.win32.join(programFiles, 'Steam'),
    );
  } else if (platform === 'darwin') {
    roots.push(path.posix.join(homeDir, 'Library', 'Application Support', 'Steam'));
  } else {
    roots.push(
      path.posix.join(homeDir, '.steam', 'steam'),
      path.posix.join(homeDir, '.steam', 'root'),
      path.posix.join(homeDir, '.local', 'share', 'Steam'),
      path.posix.join(homeDir, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
      path.posix.join(homeDir, 'snap', 'steam', 'common', '.steam', 'steam'),
      path.posix.join(homeDir, 'snap', 'steam', 'common', '.local', 'share', 'Steam'),
    );
  }
  return dedupePaths(roots);
}

export function cs2CfgDir(libraryPath: string): string {
  return joinUnder(libraryPath, CS2_CFG_PARTS);
}

export function parseLibraryFolders(text: string): SteamLibrary[] {
  let root: VdfMap;
  try {
    root = parseVdf(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid VDF';
    throw new InstallCfgError(`Could not parse libraryfolders.vdf: ${message}`);
  }
  const container = folderContainer(root);
  const libraries: SteamLibrary[] = [];
  for (const [key, value] of Object.entries(container)) {
    if (typeof value === 'string') {
      if (/^\d+$/.test(key) && value.trim()) {
        libraries.push({ path: value.trim(), appIds: [] });
      }
      continue;
    }
    const rawPath = value.path ?? value.Path;
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      continue;
    }
    const apps = value.apps ?? value.Apps;
    const appIds =
      apps && typeof apps === 'object' ? Object.keys(apps).filter((id) => id !== '') : [];
    libraries.push({ path: rawPath.trim(), appIds });
  }
  return libraries;
}

export function parseRegQueryOutput(output: string): string | undefined {
  const match = output.match(/REG_SZ\s+(\S.*?)\s*$/m);
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

export function installGsiCfg(options: InstallOptions = {}): InstallOutcome {
  const cfgDir = resolveCfgDir(options);
  const targetPath = joinUnder(cfgDir, [GSI_CFG_FILENAME]);
  const contents = readExampleCfg();
  const existing = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : undefined;
  const differs = existing !== undefined && existing !== contents;
  if (options.dryRun) {
    return { targetPath, contents, action: 'dry-run', differs };
  }
  if (differs && !options.force) {
    throw new InstallCfgError(
      `Refusing to overwrite ${targetPath} because its contents differ. Re-run with --force to replace it.`,
    );
  }
  if (existing === contents) {
    return { targetPath, contents, action: 'unchanged', differs: false };
  }
  writeFileSync(targetPath, contents, 'utf8');
  return { targetPath, contents, action: 'wrote', differs: false };
}

export function resolveCfgDir(options: InstallOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  if (options.cfgDir) {
    const dir = resolveUserPath(options.cfgDir, cwd);
    assertCfgDirectory(dir);
    return dir;
  }

  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? '';
  const env = options.env ?? process.env;
  const registrySteamPaths = registryPathsFor(options, platform);
  const steamRoots = options.steamDir
    ? [resolveUserPath(options.steamDir, cwd)]
    : defaultSteamRoots({ platform, homeDir, env, registrySteamPaths }).filter((root) => existsSync(root));

  if (options.steamDir && !existsSync(steamRoots[0] ?? '')) {
    throw new InstallCfgError(`Steam directory does not exist: ${steamRoots[0]}`);
  }
  if (steamRoots.length === 0) {
    throw new InstallCfgError(
      'Could not find a Steam installation. Pass --steam-dir or --cfg-dir.',
    );
  }

  const candidates: { cfgDir: string; hasApp: boolean }[] = [];
  for (const root of steamRoots) {
    for (const library of librariesForSteamRoot(root)) {
      const cfgDir = cs2CfgDir(library.path);
      if (!isDirectory(cfgDir)) {
        continue;
      }
      candidates.push({ cfgDir, hasApp: library.appIds.includes(CS2_APP_ID) });
    }
  }

  const chosen = candidates.find((candidate) => candidate.hasApp) ?? candidates[0];
  if (!chosen) {
    throw new InstallCfgError(
      `Could not find Counter-Strike 2's game/csgo/cfg under Steam (${steamRoots.join(', ')}). Pass --cfg-dir.`,
    );
  }
  return chosen.cfgDir;
}

export function runInstallCli(
  argv: string[],
  options: InstallOptions & {
    stdout?: (text: string) => void;
    stderr?: (text: string) => void;
  } = {},
): number {
  const stdout = options.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = options.stderr ?? ((text: string) => process.stderr.write(text));
  try {
    const args = parseInstallArgs(argv);
    if (args.help) {
      stdout(`${HELP_TEXT}\n`);
      return 0;
    }
    const outcome = installGsiCfg({
      ...options,
      dryRun: args.dryRun,
      force: args.force,
      ...(args.cfgDir ? { cfgDir: args.cfgDir } : {}),
      ...(args.steamDir ? { steamDir: args.steamDir } : {}),
    });
    if (outcome.action === 'dry-run') {
      stdout(`target: ${outcome.targetPath}\n${outcome.contents}`);
      if (outcome.differs) {
        const forceNote = args.force
          ? ' --force is set, so a real run would replace it.'
          : ' A real run refuses unless --force is set.';
        stderr(
          `note: ${outcome.targetPath} already exists with different contents.${forceNote}\n`,
        );
      }
      return 0;
    }
    stdout(`${outcome.action} ${outcome.targetPath}\n`);
    return 0;
  } catch (error) {
    if (error instanceof InstallCfgError) {
      stderr(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

const HELP_TEXT = `Write RoundMind's read-only CS2 Game State Integration cfg.

Usage:
  npm run install-cfg -- [--cfg-dir <game/csgo/cfg>] [--steam-dir <Steam>] [--dry-run] [--force]

Looks up Steam's libraryfolders.vdf from the usual Windows and Linux install
locations (and the Windows registry Steam path) and writes
${GSI_CFG_FILENAME} into Counter-Strike 2's game/csgo/cfg.
The file is the sample shipped with this package (127.0.0.1:3000, token roundmind-local-dev).

--cfg-dir    Write into this cfg directory. Skips Steam discovery.
--steam-dir  Read libraryfolders.vdf from this Steam installation.
--dry-run    Print the target path and file contents. Do not write.
--force      Replace an existing cfg whose contents differ.

An existing file with the same contents is left unchanged. A different file
is not overwritten unless --force is set. Restart CS2 after a write.
This command does not start the game or send input.`;

function parseInstallArgs(argv: string[]): {
  help: boolean;
  dryRun: boolean;
  force: boolean;
  cfgDir?: string;
  steamDir?: string;
} {
  const parsed = {
    help: false,
    dryRun: false,
    force: false,
    cfgDir: undefined as string | undefined,
    steamDir: undefined as string | undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (arg === '--force') {
      parsed.force = true;
      continue;
    }
    const inline = /^(--cfg-dir|--steam-dir)=(.*)$/.exec(arg);
    if (inline) {
      assignPath(parsed, inline[1] ?? '', inline[2] ?? '');
      continue;
    }
    if (arg === '--cfg-dir' || arg === '--steam-dir') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new InstallCfgError(`${arg} needs a path`);
      }
      assignPath(parsed, arg, value);
      index += 1;
      continue;
    }
    throw new InstallCfgError(`Unknown argument ${arg}. Run with --help.`);
  }
  return parsed;
}

function assignPath(
  parsed: { cfgDir?: string; steamDir?: string },
  flag: string,
  value: string,
): void {
  if (!value.trim()) {
    throw new InstallCfgError(`${flag} needs a path`);
  }
  if (flag === '--cfg-dir') {
    parsed.cfgDir = value;
    return;
  }
  parsed.steamDir = value;
}

function registryPathsFor(options: InstallOptions, platform: NodeJS.Platform): string[] {
  if (options.registrySteamPaths) {
    return options.registrySteamPaths;
  }
  if (platform === 'win32' && process.platform === 'win32') {
    return readWindowsRegistrySteamPaths();
  }
  return [];
}

export function readWindowsRegistrySteamPaths(): string[] {
  const queries: readonly (readonly [string, string])[] = [
    ['HKCU\\Software\\Valve\\Steam', 'SteamPath'],
    ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'],
    ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath'],
  ];
  const found: string[] = [];
  for (const [key, valueName] of queries) {
    try {
      const output = execFileSync('reg', ['query', key, '/v', valueName], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const value = parseRegQueryOutput(output);
      if (value) {
        found.push(value);
      }
    } catch {
      // Missing key or reg.exe. The default Program Files paths still apply.
    }
  }
  return dedupePaths(found);
}

function librariesForSteamRoot(steamRoot: string): SteamLibrary[] {
  const vdfPath = [
    joinUnder(steamRoot, ['steamapps', 'libraryfolders.vdf']),
    joinUnder(steamRoot, ['config', 'libraryfolders.vdf']),
  ].find((candidate) => existsSync(candidate));

  let libraries: SteamLibrary[] = [];
  if (vdfPath) {
    try {
      libraries = parseLibraryFolders(readFileSync(vdfPath, 'utf8'));
    } catch (error) {
      if (error instanceof InstallCfgError) {
        throw new InstallCfgError(`${error.message} (${vdfPath})`);
      }
      throw error;
    }
  }

  if (!libraries.some((library) => samePath(library.path, steamRoot))) {
    libraries.unshift({ path: steamRoot, appIds: [] });
  }
  return libraries;
}

function assertCfgDirectory(dir: string): void {
  if (!isDirectory(dir)) {
    throw new InstallCfgError(`CS2 cfg directory does not exist: ${dir}`);
  }
}

function isDirectory(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function resolveUserPath(input: string, cwd: string): string {
  if (path.win32.isAbsolute(input) || path.posix.isAbsolute(input)) {
    return input;
  }
  return path.resolve(cwd, input);
}

function joinUnder(root: string, parts: readonly string[]): string {
  const lib = pathStyle(root) === 'win32' ? path.win32 : path.posix;
  return lib.join(root, ...parts);
}

function pathStyle(input: string): 'win32' | 'posix' {
  if (/^[A-Za-z]:[\\/]/.test(input) || input.includes('\\')) {
    return 'win32';
  }
  return 'posix';
}

function samePath(left: string, right: string): boolean {
  return normalizeForCompare(left) === normalizeForCompare(right);
}

function normalizeForCompare(input: string): string {
  const style = pathStyle(input);
  const lib = style === 'win32' ? path.win32 : path.posix;
  const normalized = lib.normalize(input).replace(/[\\/]+$/, '');
  return style === 'win32' ? normalized.toLowerCase() : normalized;
}

function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const entry of paths) {
    const key = normalizeForCompare(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(entry);
  }
  return unique;
}

function folderContainer(root: VdfMap): VdfMap {
  const inner = root.libraryfolders ?? root.LibraryFolders;
  if (inner && typeof inner === 'object') {
    return inner;
  }
  return root;
}

function parseVdf(text: string): VdfMap {
  const parser = new VdfParser(text.replace(/^\uFEFF/, ''));
  const value = parser.parseObject();
  parser.skip();
  if (!parser.eof()) {
    throw new Error('trailing data in VDF');
  }
  return value;
}

class VdfParser {
  private index = 0;

  constructor(private readonly text: string) {}

  parseObject(): VdfMap {
    const map: VdfMap = {};
    this.skip();
    while (!this.eof() && this.peek() !== '}') {
      const key = this.readToken();
      this.skip();
      if (this.peek() === '{') {
        this.index += 1;
        map[key] = this.parseObject();
        this.skip();
        if (this.peek() !== '}') {
          throw new Error('unterminated VDF object');
        }
        this.index += 1;
      } else {
        map[key] = this.readToken();
      }
      this.skip();
    }
    return map;
  }

  skip(): void {
    while (!this.eof()) {
      const current = this.peek();
      if (current === '/' && this.peek(1) === '/') {
        while (!this.eof() && this.peek() !== '\n') {
          this.index += 1;
        }
        continue;
      }
      if (current === ' ' || current === '\t' || current === '\r' || current === '\n') {
        this.index += 1;
        continue;
      }
      break;
    }
  }

  eof(): boolean {
    return this.index >= this.text.length;
  }

  private readToken(): string {
    if (this.peek() === '"') {
      this.index += 1;
      let out = '';
      while (!this.eof()) {
        const current = this.peek();
        if (current === '"') {
          this.index += 1;
          return out;
        }
        if (current === '\\') {
          const next = this.peek(1);
          if (!next) {
            break;
          }
          this.index += 2;
          if (next === 'n') {
            out += '\n';
          } else if (next === 't') {
            out += '\t';
          } else if (next === 'r') {
            out += '\r';
          } else {
            out += next;
          }
          continue;
        }
        out += current;
        this.index += 1;
      }
      throw new Error('unterminated VDF string');
    }

    const start = this.index;
    while (!this.eof()) {
      const current = this.peek();
      if (
        current === ' ' ||
        current === '\t' ||
        current === '\r' ||
        current === '\n' ||
        current === '{' ||
        current === '}' ||
        current === '"'
      ) {
        break;
      }
      this.index += 1;
    }
    if (this.index === start) {
      throw new Error(`unexpected ${JSON.stringify(this.peek() || 'EOF')} in VDF`);
    }
    return this.text.slice(start, this.index);
  }

  private peek(offset = 0): string {
    return this.text[this.index + offset] ?? '';
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectExecution()) {
  process.exitCode = runInstallCli(process.argv.slice(2));
}
