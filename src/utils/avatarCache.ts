const DB_NAME = 'KindredSpiritsCache';
const STORE_NAME = 'avatars';
const DB_VERSION = 1;
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000;

interface CachedAvatar {
  url: string;
  blob: Blob;
  timestamp: number;
  agentId: number;
}

class AvatarCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.initDB();
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'agentId' });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (this.initPromise) {
      await this.initPromise;
    }
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  async get(agentId: number): Promise<string | null> {
    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(agentId);

        request.onsuccess = () => {
          const cached = request.result as CachedAvatar | undefined;

          if (!cached) {
            resolve(null);
            return;
          }

          const now = Date.now();
          if (now - cached.timestamp > CACHE_DURATION) {
            this.delete(agentId);
            resolve(null);
            return;
          }

          const blobUrl = URL.createObjectURL(cached.blob);
          resolve(blobUrl);
        };

        request.onerror = () => {
          console.error('Error reading from cache:', request.error);
          resolve(null);
        };
      });
    } catch (error) {
      console.error('Error accessing cache:', error);
      return null;
    }
  }

  async set(agentId: number, url: string, blob: Blob): Promise<void> {
    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const cached: CachedAvatar = {
          agentId,
          url,
          blob,
          timestamp: Date.now()
        };

        const request = store.put(cached);

        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.error('Error writing to cache:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error writing to cache:', error);
    }
  }

  async delete(agentId: number): Promise<void> {
    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(agentId);

        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.error('Error deleting from cache:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error deleting from cache:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.error('Error clearing cache:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  async cleanExpired(): Promise<void> {
    try {
      const db = await this.ensureDB();
      const now = Date.now();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const request = index.openCursor();

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

          if (cursor) {
            const cached = cursor.value as CachedAvatar;
            if (now - cached.timestamp > CACHE_DURATION) {
              cursor.delete();
            }
            cursor.continue();
          } else {
            resolve();
          }
        };

        request.onerror = () => {
          console.error('Error cleaning expired cache:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error cleaning expired cache:', error);
    }
  }
}

export const avatarCache = new AvatarCache();
