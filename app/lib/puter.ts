/**
 * Local store — replaces Puter.js entirely.
 *
 * Auth   → localStorage (username-based, no password needed)
 * KV     → localStorage  (prefix "smr_kv_")
 * Files  → IndexedDB     (database "smr_files", object-store "blobs")
 */
import { create } from "zustand";

// ─── IndexedDB helpers ──────────────────────────────────────────────────────

const DB_NAME = "smr_files";
const STORE_NAME = "blobs";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key: string): Promise<Blob | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

const AUTH_KEY = "smr_user";

function loadUser(): PuterUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveUser(user: PuterUser) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

function removeUser() {
  localStorage.removeItem(AUTH_KEY);
}

// ─── KV helpers ───────────────────────────────────────────────────────────────

const KV_PREFIX = "smr_kv_";

function kvGet(key: string): string | null {
  return localStorage.getItem(KV_PREFIX + key);
}

function kvSet(key: string, value: string) {
  localStorage.setItem(KV_PREFIX + key, value);
}

function kvDelete(key: string) {
  localStorage.removeItem(KV_PREFIX + key);
}

function kvList(pattern: string, returnValues = false): string[] | { key: string; value: string }[] {
  const prefix = KV_PREFIX;
  // Convert glob pattern (e.g. "resume:*") to regex
  const regex = new RegExp(
    "^" + prefix + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"
  );
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && regex.test(k)) keys.push(k.slice(prefix.length));
  }
  if (!returnValues) return keys;
  return keys.map((k) => ({ key: k, value: localStorage.getItem(KV_PREFIX + k) ?? "" }));
}

// ─── Zustand store ────────────────────────────────────────────────────────────

interface LocalStore {
  isLoading: boolean;
  error: string | null;
  puterReady: boolean;

  auth: {
    user: PuterUser | null;
    isAuthenticated: boolean;
    signIn: (username: string) => void;
    signOut: () => void;
    getUser: () => PuterUser | null;
  };

  fs: {
    /** Save a file under `path` in IndexedDB; returns a fake FSItem */
    write: (path: string, data: File | Blob) => Promise<{ path: string } | undefined>;
    read: (path: string) => Promise<Blob | undefined>;
    upload: (files: File[] | Blob[]) => Promise<{ path: string } | undefined>;
    delete: (path: string) => Promise<void>;
    readDir: (path: string) => Promise<undefined>;
  };

  kv: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
    list: (pattern: string, returnValues?: boolean) => Promise<any[]>;
    flush: () => Promise<void>;
  };

  init: () => void;
  clearError: () => void;
}

export const usePuterStore = create<LocalStore>((set, get) => {
  const init = () => {
    const user = loadUser();
    set({
      puterReady: true,
      isLoading: false,
      auth: {
        ...get().auth,
        user,
        isAuthenticated: !!user,
      },
    });
  };

  const signIn = (username: string) => {
    const user: PuterUser = { username };
    saveUser(user);
    set({
      auth: {
        ...get().auth,
        user,
        isAuthenticated: true,
      },
    });
  };

  const signOut = () => {
    removeUser();
    set({
      auth: {
        ...get().auth,
        user: null,
        isAuthenticated: false,
      },
    });
  };

  return {
    isLoading: false,
    error: null,
    puterReady: false,

    auth: {
      user: null,
      isAuthenticated: false,
      signIn,
      signOut,
      getUser: () => get().auth.user,
    },

    fs: {
      write: async (path, data) => {
        const blob = data instanceof Blob ? data : new Blob([data]);
        await idbSet(path, blob);
        return { path };
      },
      read: async (path) => idbGet(path),
      upload: async (files) => {
        if (!files.length) return undefined;
        const f = files[0];
        const blob = f instanceof Blob ? f : new Blob([f]);
        const path = `uploads/${Date.now()}_${(f as File).name ?? "file"}`;
        await idbSet(path, blob);
        return { path };
      },
      delete: async (path) => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, "readwrite");
          tx.objectStore(STORE_NAME).delete(path);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      },
      readDir: async () => undefined,
    },

    kv: {
      get: async (key) => kvGet(key),
      set: async (key, value) => kvSet(key, value),
      delete: async (key) => kvDelete(key),
      list: async (pattern, returnValues) => kvList(pattern, returnValues) as any[],
      flush: async () => {
        const prefix = KV_PREFIX;
        const toDelete: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(prefix)) toDelete.push(k);
        }
        toDelete.forEach((k) => localStorage.removeItem(k));
      },
    },

    init,
    clearError: () => set({ error: null }),
  };
});
