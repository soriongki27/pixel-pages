/* ===========================================================
   Pixel Pages — storage abstraction
   One async interface, two backends:
     - LocalStore  : guest mode, browser localStorage
     - CloudStore  : signed-in, Supabase (added in a later task)
   Entry shape: { id, prompt, answer, wordCount, timestamp }
   =========================================================== */

const STORAGE_KEY = 'pixelPagesEntries';

window.LocalStore = {
  async getEntries() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  },

  async addEntry(entry) {
    const entries = await this.getEntries();
    const record = {
      id: Date.now(),
      prompt: entry.prompt,
      answer: entry.answer,
      wordCount: entry.wordCount,
      timestamp: new Date().toISOString(),
    };
    entries.push(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return record;
  },

  async deleteEntry(id) {
    const entries = (await this.getEntries()).filter((e) => e.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  },

  async clear() {
    localStorage.removeItem(STORAGE_KEY);
  },
};
