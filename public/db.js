class SmartestKingDB {
  constructor() {
    this.dbName = 'SmartestKingDB';
    this.storeName = 'analyses';
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { this.db = req.result; resolve(); };
      req.onupgradeneeded = (e) => {
        const store = e.target.result.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      };
    });
  }

  async save(data) {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction([this.storeName], 'readwrite')
        .objectStore(this.storeName).add({ ...data, timestamp: Date.now() });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAll(limit = 50) {
    return new Promise((resolve, reject) => {
      const results = [];
      const req = this.db.transaction([this.storeName], 'readonly')
        .objectStore(this.storeName).index('timestamp').openCursor(null, 'prev');
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && results.length < limit) { results.push(cursor.value); cursor.continue(); }
        else resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async delete(id) {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction([this.storeName], 'readwrite')
        .objectStore(this.storeName).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear() {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction([this.storeName], 'readwrite')
        .objectStore(this.storeName).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

const db = new SmartestKingDB();
db.init().catch(console.error);
