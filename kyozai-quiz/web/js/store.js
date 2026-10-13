// 保存先。ブラウザでは IndexedDB（このブラウザの中だけに残る）。テストでは MemoryStore を使う。
// ページ画像は PNG の base64 で pages に持つ（あとから図の説明文を作り直せるように必ず残す）。

const byPage = (a, b) => a.pageNumber - b.pageNumber;
const byQuestion = (a, b) => a.pageNumber - b.pageNumber || a.id - b.id;

export class MemoryStore {
  constructor() {
    this.materials = new Map();
    this.pages = new Map();
    this.questions = [];
    this.log = [];
    this.nextId = 1;
  }
  async listMaterials() { return [...this.materials.values()].sort((a, b) => a.registeredAt.localeCompare(b.registeredAt)); }
  async getMaterial(id) { return this.materials.get(id) ?? null; }
  async saveMaterial(material, pages) {
    this.materials.set(material.id, structuredClone(material));
    for (const p of pages) await this.putPage(p);
  }
  async deleteMaterial(id) {
    this.materials.delete(id);
    for (const key of [...this.pages.keys()]) if (key.startsWith(`${id}\u0000`)) this.pages.delete(key);
    this.questions = this.questions.filter((q) => q.materialId !== id);
    this.log = this.log.filter((l) => l.materialId !== id);
  }
  async getPages(materialId) {
    return [...this.pages.values()].filter((p) => p.materialId === materialId).sort(byPage).map((p) => structuredClone(p));
  }
  async putPage(page) { this.pages.set(`${page.materialId}\u0000${page.pageNumber}`, structuredClone(page)); }
  async addQuestions(items) { for (const q of items) this.questions.push({ ...structuredClone(q), id: this.nextId++ }); }
  async getQuestions(materialId) { return this.questions.filter((q) => q.materialId === materialId).sort(byQuestion); }
  async deleteQuestions(materialId, batchId) {
    this.questions = this.questions.filter((q) => !(q.materialId === materialId && (!batchId || q.batchId === batchId)));
  }
  async addLog(entry) { this.log.push({ ...entry, id: this.nextId++ }); }
  async getLog(materialId) { return this.log.filter((l) => l.materialId === materialId); }
}

const DB_NAME = "kyozai-quiz";
const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const done = (tx) => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });

export class IndexedDbStore {
  static async open() {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      db.createObjectStore("materials", { keyPath: "id" });
      db.createObjectStore("pages", { keyPath: ["materialId", "pageNumber"] }).createIndex("materialId", "materialId");
      db.createObjectStore("questions", { keyPath: "id", autoIncrement: true }).createIndex("materialId", "materialId");
      db.createObjectStore("log", { keyPath: "id", autoIncrement: true }).createIndex("materialId", "materialId");
    };
    const store = new IndexedDbStore();
    store.db = await req(open);
    return store;
  }
  tx(names, mode = "readonly") { return this.db.transaction(names, mode); }

  async listMaterials() {
    const items = await req(this.tx("materials").objectStore("materials").getAll());
    return items.sort((a, b) => a.registeredAt.localeCompare(b.registeredAt));
  }
  async getMaterial(id) { return (await req(this.tx("materials").objectStore("materials").get(id))) ?? null; }
  async saveMaterial(material, pages) {
    const tx = this.tx(["materials", "pages"], "readwrite");
    tx.objectStore("materials").put(material);
    for (const p of pages) tx.objectStore("pages").put(p);
    await done(tx);
  }
  async deleteMaterial(id) {
    const tx = this.tx(["materials", "pages", "questions", "log"], "readwrite");
    tx.objectStore("materials").delete(id);
    for (const name of ["pages", "questions", "log"]) {
      const index = tx.objectStore(name).index("materialId");
      index.openKeyCursor(IDBKeyRange.only(id)).onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { tx.objectStore(name).delete(cursor.primaryKey); cursor.continue(); }
      };
    }
    await done(tx);
  }
  async getPages(materialId) {
    const items = await req(this.tx("pages").objectStore("pages").index("materialId").getAll(materialId));
    return items.sort(byPage);
  }
  async putPage(page) {
    const tx = this.tx("pages", "readwrite");
    tx.objectStore("pages").put(page);
    await done(tx);
  }
  async addQuestions(items) {
    if (!items.length) return;
    const tx = this.tx("questions", "readwrite");
    for (const q of items) tx.objectStore("questions").add(q);
    await done(tx);
  }
  async getQuestions(materialId) {
    const items = await req(this.tx("questions").objectStore("questions").index("materialId").getAll(materialId));
    return items.sort(byQuestion);
  }
  async deleteQuestions(materialId, batchId) {
    const tx = this.tx("questions", "readwrite");
    tx.objectStore("questions").index("materialId").openCursor(IDBKeyRange.only(materialId)).onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return;
      if (!batchId || cursor.value.batchId === batchId) cursor.delete();
      cursor.continue();
    };
    await done(tx);
  }
  async addLog(entry) {
    const tx = this.tx("log", "readwrite");
    tx.objectStore("log").add(entry);
    await done(tx);
  }
  async getLog(materialId) { return req(this.tx("log").objectStore("log").index("materialId").getAll(materialId)); }
}
