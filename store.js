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

// Factory for a Supabase-backed store bound to one signed-in user.
window.createCloudStore = function createCloudStore(client, userId) {
  return {
    async getEntries() {
      const { data, error } = await client
        .from('entries')
        .select('id, prompt, answer, word_count, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        prompt: row.prompt,
        answer: row.answer,
        wordCount: row.word_count,
        timestamp: row.created_at,
      }));
    },

    async addEntry(entry) {
      const { data, error } = await client
        .from('entries')
        .insert({
          user_id: userId,
          prompt: entry.prompt,
          answer: entry.answer,
          word_count: entry.wordCount,
        })
        .select('id, prompt, answer, word_count, created_at')
        .single();
      if (error) throw error;
      return {
        id: data.id,
        prompt: data.prompt,
        answer: data.answer,
        wordCount: data.word_count,
        timestamp: data.created_at,
      };
    },

    async deleteEntry(id) {
      const { error } = await client.from('entries').delete().eq('id', id);
      if (error) throw error;
    },

    async importEntries(entries) {
      if (!entries.length) return;
      const rows = entries.map((e) => ({
        user_id: userId,
        prompt: e.prompt,
        answer: e.answer,
        word_count: e.wordCount,
      }));
      const { error } = await client.from('entries').insert(rows);
      if (error) throw error;
    },
  };
};
