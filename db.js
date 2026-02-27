/**
 * IndexedDB wrapper — HyperCard PWA
 */
const DB_NAME = 'hypercod-db';
const DB_VERSION = 1;
const STORES = ['stacks', 'backgrounds', 'cards', 'media', 'appstate'];

let _db = null;

export function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            STORES.forEach(s => {
                if (!db.objectStoreNames.contains(s))
                    db.createObjectStore(s, { keyPath: 'id' });
            });
        };
        req.onsuccess = e => { _db = e.target.result; resolve(_db); };
        req.onerror = e => reject(e.target.error);
    });
}

function tx(store, mode = 'readonly') {
    return _db.transaction(store, mode).objectStore(store);
}

export function dbSave(store, item) {
    return new Promise((res, rej) => {
        const r = tx(store, 'readwrite').put(item);
        r.onsuccess = () => res(r.result);
        r.onerror = e => rej(e.target.error);
    });
}

export function dbLoad(store, id) {
    return new Promise((res, rej) => {
        const r = tx(store).get(id);
        r.onsuccess = () => res(r.result || null);
        r.onerror = e => rej(e.target.error);
    });
}

export function dbLoadAll(store) {
    return new Promise((res, rej) => {
        const r = tx(store).getAll();
        r.onsuccess = () => res(r.result || []);
        r.onerror = e => rej(e.target.error);
    });
}

export function dbDelete(store, id) {
    return new Promise((res, rej) => {
        const r = tx(store, 'readwrite').delete(id);
        r.onsuccess = () => res();
        r.onerror = e => rej(e.target.error);
    });
}
