import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CS2_APP_ID,
  GSI_CFG_FILENAME,
  InstallCfgError,
  cs2CfgDir,
  defaultSteamRoots,
  installGsiCfg,
  parseLibraryFolders,
  parseRegQueryOutput,
  readWindowsRegistrySteamPaths,
  runInstallCli,
} from '../src/install-cfg.js';

const exampleCfg = readFileSync(
  fileURLToPath(new URL('../examples/gamestate_integration_roundmind.cfg', import.meta.url)),
  'utf8',
);

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('parseLibraryFolders', () => {
  it('reads escaped Windows paths and app 730 from a modern libraryfolders.vdf', () => {
    const libraries = parseLibraryFolders(`\uFEFF"libraryfolders"
{
  "0"
  {
    "path" "C:\\\\Program Files (x86)\\\\Steam"
    "apps"
    {
      "228980" "100"
      "730" "456"
    }
  }
  "1"
  {
    "path" "D:\\\\SteamLibrary"
    "apps"
    {
      "220" "1"
    }
  }
}
`);

    expect(libraries.map((library) => library.path)).toEqual([
      'C:\\Program Files (x86)\\Steam',
      'D:\\SteamLibrary',
    ]);
    expect(libraries[0]?.appIds).toEqual(expect.arrayContaining(['228980', '730']));
    expect(libraries[0]?.appIds).toHaveLength(2);
    expect(libraries[1]?.appIds).toEqual(['220']);
    expect(libraries[0]?.appIds).toContain(CS2_APP_ID);
  });

  it('reads the legacy numeric libraryfolders format', () => {
    const libraries = parseLibraryFolders(`"LibraryFolders"
{
  "TimeNextStatsReport" "123"
  "ContentStatsID" "-1"
  "1" "D:\\\\Games\\\\Steam"
}
`);

    expect(libraries).toEqual([{ path: 'D:\\Games\\Steam', appIds: [] }]);
  });

  it('rejects a file that is not VDF', () => {
    expect(() => parseLibraryFolders('{ not vdf')).toThrow(InstallCfgError);
  });
});

describe('Steam path layout', () => {
  it('builds the CS2 cfg path with Windows separators', () => {
    expect(cs2CfgDir('C:\\Program Files (x86)\\Steam')).toBe(
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\cfg',
    );
    expect(cs2CfgDir('C:/Program Files (x86)/Steam')).toBe(
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\cfg',
    );
  });

  it('lists the default Linux and Windows Steam roots', () => {
    expect(
      defaultSteamRoots({
        platform: 'linux',
        homeDir: '/home/player',
        env: {},
        registrySteamPaths: [],
      }),
    ).toEqual([
      '/home/player/.steam/steam',
      '/home/player/.steam/root',
      '/home/player/.local/share/Steam',
      '/home/player/.var/app/com.valvesoftware.Steam/.local/share/Steam',
      '/home/player/snap/steam/common/.steam/steam',
      '/home/player/snap/steam/common/.local/share/Steam',
    ]);

    expect(
      defaultSteamRoots({
        platform: 'win32',
        homeDir: 'C:\\Users\\player',
        env: {
          'ProgramFiles(x86)': 'C:\\Program Files (x86)',
          ProgramFiles: 'C:\\Program Files',
        },
        registrySteamPaths: ['D:\\Steam', 'D:\\Steam'],
      }),
    ).toEqual(['D:\\Steam', 'C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam']);
  });

  it('parses reg query output for SteamPath', () => {
    expect(
      parseRegQueryOutput(`
HKEY_CURRENT_USER\\Software\\Valve\\Steam
    SteamPath    REG_SZ    C:\\Program Files (x86)\\Steam
`),
    ).toBe('C:\\Program Files (x86)\\Steam');
    expect(parseRegQueryOutput('no value here')).toBeUndefined();
    expect(Array.isArray(readWindowsRegistrySteamPaths())).toBe(true);
  });
});

describe('installGsiCfg', () => {
  it('writes the shipped cfg into the app 730 library and skips a different library', () => {
    const home = makeTemp('linux-home');
    const steam = path.join(home, '.steam', 'steam');
    const decoy = path.join(home, 'OtherLibrary');
    const cs2 = path.join(home, 'SteamLibrary');
    const decoyCfg = makeCfg(decoy);
    const cs2Cfg = makeCfg(cs2);
    writeLibraryFolders(steam, [
      { libraryPath: decoy, appIds: ['570'] },
      { libraryPath: cs2, appIds: ['730'] },
    ]);

    const stdout: string[] = [];
    const code = runInstallCli([], {
      platform: 'linux',
      homeDir: home,
      env: {},
      registrySteamPaths: [],
      stdout: (text) => stdout.push(text),
      stderr: () => {},
    });

    const target = path.join(cs2Cfg, GSI_CFG_FILENAME);
    expect(code).toBe(0);
    expect(stdout.join('')).toBe(`wrote ${target}\n`);
    expect(readFileSync(target, 'utf8')).toBe(exampleCfg);
    expect(readFileSync(target, 'utf8')).toContain('http://127.0.0.1:3000/gsi');
    expect(readFileSync(target, 'utf8')).toContain('roundmind-local-dev');
    expect(exists(path.join(decoyCfg, GSI_CFG_FILENAME))).toBe(false);
  });

  it('prints the target path and contents on --dry-run without writing', () => {
    const home = makeTemp('dry-home');
    const steam = path.join(home, '.local', 'share', 'Steam');
    const cfg = makeCfg(steam);
    writeLibraryFolders(steam, [{ libraryPath: steam, appIds: ['730'] }]);
    const target = path.join(cfg, GSI_CFG_FILENAME);
    const stdout: string[] = [];

    const code = runInstallCli(['--dry-run'], {
      platform: 'linux',
      homeDir: home,
      env: {},
      registrySteamPaths: [],
      stdout: (text) => stdout.push(text),
      stderr: () => {},
    });

    expect(code).toBe(0);
    expect(stdout.join('')).toBe(`target: ${target}\n${exampleCfg}`);
    expect(exists(target)).toBe(false);
  });

  it('uses --cfg-dir and --steam-dir', () => {
    const root = makeTemp('overrides');
    const explicit = path.join(root, 'explicit-cfg');
    mkdirSync(explicit, { recursive: true });
    const steam = path.join(root, 'Steam');
    const cfg = makeCfg(steam);
    writeLibraryFolders(steam, [{ libraryPath: steam, appIds: ['730'] }]);

    const byCfg = installGsiCfg({
      cfgDir: explicit,
      platform: 'linux',
      homeDir: root,
      env: {},
      registrySteamPaths: [],
    });
    expect(byCfg.action).toBe('wrote');
    expect(byCfg.targetPath).toBe(path.join(explicit, GSI_CFG_FILENAME));
    expect(readFileSync(byCfg.targetPath, 'utf8')).toBe(exampleCfg);

    const bySteam = installGsiCfg({
      steamDir: steam,
      platform: 'linux',
      homeDir: '/unused',
      env: {},
      registrySteamPaths: [],
    });
    expect(bySteam.targetPath).toBe(path.join(cfg, GSI_CFG_FILENAME));
    expect(readFileSync(bySteam.targetPath, 'utf8')).toBe(exampleCfg);
  });

  it('refuses to overwrite a different file unless --force is set', () => {
    const home = makeTemp('force-home');
    const steam = path.join(home, '.steam', 'steam');
    const cfg = makeCfg(steam);
    writeLibraryFolders(steam, [{ libraryPath: steam, appIds: ['730'] }]);
    const target = path.join(cfg, GSI_CFG_FILENAME);
    writeFileSync(target, `${exampleCfg}\n// local edit\n`, 'utf8');
    const before = readFileSync(target, 'utf8');
    const stderr: string[] = [];

    const refused = runInstallCli([], {
      platform: 'linux',
      homeDir: home,
      env: {},
      registrySteamPaths: [],
      stdout: () => {},
      stderr: (text) => stderr.push(text),
    });

    expect(refused).toBe(1);
    expect(stderr.join('')).toContain('--force');
    expect(readFileSync(target, 'utf8')).toBe(before);

    const forced = runInstallCli(['--force'], {
      platform: 'linux',
      homeDir: home,
      env: {},
      registrySteamPaths: [],
      stdout: () => {},
      stderr: () => {},
    });
    expect(forced).toBe(0);
    expect(readFileSync(target, 'utf8')).toBe(exampleCfg);
  });

  it('leaves an identical file unchanged', () => {
    const dir = path.join(makeTemp('same'), 'cfg');
    mkdirSync(dir, { recursive: true });
    const target = path.join(dir, GSI_CFG_FILENAME);
    writeFileSync(target, exampleCfg, 'utf8');

    const outcome = installGsiCfg({ cfgDir: dir });
    expect(outcome.action).toBe('unchanged');
    expect(readFileSync(target, 'utf8')).toBe(exampleCfg);
  });

  it('finds CS2 from a Windows registry Steam path', () => {
    const root = makeTemp('win-reg');
    const steam = path.join(root, 'Steam');
    const cfg = makeCfg(steam);
    writeLibraryFolders(steam, [{ libraryPath: steam, appIds: ['730'] }]);

    const outcome = installGsiCfg({
      platform: 'win32',
      homeDir: root,
      env: {},
      registrySteamPaths: [steam],
    });

    expect(outcome.action).toBe('wrote');
    expect(outcome.targetPath).toBe(path.join(cfg, GSI_CFG_FILENAME));
    expect(readFileSync(outcome.targetPath, 'utf8')).toBe(exampleCfg);
  });

  it('falls back to config/libraryfolders.vdf', () => {
    const root = makeTemp('legacy-vdf');
    const steam = path.join(root, 'Steam');
    const library = path.join(root, 'Library');
    const cfg = makeCfg(library);
    mkdirSync(path.join(steam, 'config'), { recursive: true });
    writeFileSync(
      path.join(steam, 'config', 'libraryfolders.vdf'),
      `"LibraryFolders"
{
  "TimeNextStatsReport" "1"
  "1" "${vdfEscape(library)}"
}
`,
      'utf8',
    );

    const outcome = installGsiCfg({
      steamDir: steam,
      platform: 'linux',
      homeDir: root,
      env: {},
      registrySteamPaths: [],
    });
    expect(outcome.targetPath).toBe(path.join(cfg, GSI_CFG_FILENAME));
  });

  it('errors when Steam and the cfg directory cannot be found', () => {
    const home = makeTemp('missing');
    expect(() =>
      installGsiCfg({
        platform: 'linux',
        homeDir: home,
        env: {},
        registrySteamPaths: [],
      }),
    ).toThrow(/Could not find a Steam installation/);

    expect(() => installGsiCfg({ cfgDir: path.join(home, 'missing-cfg') })).toThrow(InstallCfgError);
  });

  it('rejects unknown arguments and prints help', () => {
    const stderr: string[] = [];
    expect(runInstallCli(['--nope'], { stderr: (text) => stderr.push(text), stdout: () => {} })).toBe(1);
    expect(stderr.join('')).toContain('Unknown argument');

    const stdout: string[] = [];
    expect(runInstallCli(['--help'], { stdout: (text) => stdout.push(text), stderr: () => {} })).toBe(0);
    expect(stdout.join('')).toContain('--dry-run');
    expect(stdout.join('')).toContain('--cfg-dir');
    expect(stdout.join('')).toContain('--steam-dir');
  });
});

function makeTemp(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `roundmind-${name}-`));
  tempDirs.push(dir);
  return dir;
}

function makeCfg(libraryPath: string): string {
  const cfg = path.join(
    libraryPath,
    'steamapps',
    'common',
    'Counter-Strike Global Offensive',
    'game',
    'csgo',
    'cfg',
  );
  mkdirSync(cfg, { recursive: true });
  return cfg;
}

function writeLibraryFolders(
  steamRoot: string,
  libraries: { libraryPath: string; appIds: string[] }[],
): void {
  const blocks = libraries
    .map((library, index) => {
      const apps = library.appIds.map((id) => `      "${id}" "1"`).join('\n');
      return `  "${index}"
  {
    "path" "${vdfEscape(library.libraryPath)}"
    "apps"
    {
${apps}
    }
  }`;
    })
    .join('\n');
  const dir = path.join(steamRoot, 'steamapps');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'libraryfolders.vdf'), `"libraryfolders"\n{\n${blocks}\n}\n`, 'utf8');
}

function vdfEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function exists(file: string): boolean {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
}
