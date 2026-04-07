type CollageDraft = {
  uris: string[];
  createdAt: number;
};

const MAX_AGE_MS = 1000 * 60 * 30;
const store = new Map<string, CollageDraft>();

function cleanup() {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (now - value.createdAt > MAX_AGE_MS) {
      store.delete(key);
    }
  }
}

export function saveCollageDraft(uris: string[]): string {
  cleanup();
  const id = `collage_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  store.set(id, { uris: [...uris], createdAt: Date.now() });
  return id;
}

export function readCollageDraft(id: string): string[] {
  cleanup();
  const draft = store.get(id);
  if (!draft) return [];
  return [...draft.uris];
}

export function clearCollageDraft(id: string) {
  store.delete(id);
}
