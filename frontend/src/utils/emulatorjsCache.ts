// EmulatorJS opens exactly three IndexedDB databases:
//
//   EmulatorJS-Cache    the core/download cache      (emulator.js)
//   EmulatorJS-states   save states, not cache       (emulator.js)
//   /data/saves         the IDBFS mount, autoPersist (GameManager.js)
//
// "EmulatorJS-roms" and "EmulatorJS-core" match nothing in its source, so
// deleting those has always been a silent no-op: deleteDatabase on a name that
// does not exist succeeds.

const EJS_SRC_MODULES = [
  "GameManager.js",
  "cache.js",
  "compression.js",
  "consts.js",
  "emulator.js",
  "frontend.js",
  "gamepad.js",
  "license.js",
  "netplay.js",
  "setup.js",
  "shaders.js",
  "storage.js",
  "utils.js",
  "zipstream.js",
];

// Declared locally rather than leaning on the global augmentation in a v1
// view, so this stays usable from v2 and from anywhere the player is not.
interface EmulatorJSWindow {
  EJS_pathtodata?: string;
  EJS_emulator?: { storageCache?: { clear(): Promise<void> } };
}

function ejsWindow(): EmulatorJSWindow {
  return window as unknown as EmulatorJSWindow;
}

export interface ClearCacheResult {
  cleared: string[];
  blocked: string[];
}

// Resolves false rather than rejecting, including when the delete is blocked.
// A blocked delete is the normal case here, not an edge case: EmulatorJS opens
// a connection per operation and never closes any of them, so while a game is
// running there is always at least one open. The request then stays pending
// with no error, which is why clearing has appeared to succeed and done
// nothing.
function deleteDatabase(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.deleteDatabase(name);
    } catch {
      resolve(false);
      return;
    }
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
  });
}

// Code and cores are served from stable, unversioned URLs, so the browser's
// HTTP cache can outlive an image upgrade and run old EmulatorJS against a
// freshly hashed app bundle. Refetching past the cache replaces those entries
// so the next load gets what is actually deployed.
async function revalidateEmulatorJSAssets(): Promise<void> {
  const base = ejsWindow().EJS_pathtodata;
  if (typeof base !== "string" || base.length === 0) return;
  // EJS_pathtodata is set without a trailing slash, and its other caller adds
  // the separator itself. Joining without one produced ".../dataloader.js" for
  // every entry: a 404 the catch below discarded, so this has been clearing
  // nothing.
  const prefix = base.endsWith("/") ? base : `${base}/`;

  const paths = ["loader.js", "emulator.min.js", "emulator.css"].concat(
    EJS_SRC_MODULES.map((file) => `src/${file}`),
  );

  const missed: string[] = [];
  await Promise.all(
    paths.map((path) =>
      fetch(prefix + path, { cache: "reload" })
        .then((r) => {
          if (!r.ok) missed.push(path);
        })
        .catch(() => missed.push(path)),
    ),
  );
  // Reported rather than swallowed: a silent miss here reads as a browser
  // serving stale code for no reason.
  if (missed.length > 0) {
    console.warn("Could not revalidate EmulatorJS assets:", missed.join(", "));
  }
}

// The downloaded core and ROM only. Nothing here is user data: every entry is
// refetched on demand.
export async function clearEmulatorJSDownloadCache(): Promise<boolean> {
  // Cleared through EmulatorJS's own API rather than deleteDatabase, because
  // that API empties the store over the connection it already holds instead of
  // waiting for every connection to close.
  const storageCache = ejsWindow().EJS_emulator?.storageCache;
  if (storageCache) {
    try {
      await storageCache.clear();
      return true;
    } catch {
      return false;
    }
  }
  return deleteDatabase("EmulatorJS-Cache");
}

// Everything EmulatorJS keeps in this browser, INCLUDING SAVE DATA. Only for
// the Clear cache dialog, which warns about that. Save states also live on the
// server, and our save states carry the game's own ScummVM saves inside them,
// so loading one from the server restores the in-game save list.
export async function clearEmulatorJSCaches(): Promise<ClearCacheResult> {
  const cleared: string[] = [];
  const blocked: string[] = [];
  const record = (name: string, ok: boolean) =>
    (ok ? cleared : blocked).push(name);

  record("EmulatorJS-Cache", await clearEmulatorJSDownloadCache());
  record("/data/saves", await deleteDatabase("/data/saves"));
  record("EmulatorJS-states", await deleteDatabase("EmulatorJS-states"));

  await revalidateEmulatorJSAssets();

  return { cleared, blocked };
}
