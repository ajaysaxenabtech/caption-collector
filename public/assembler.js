(function (global) {
  const normalized = text => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const clean = text => text.replace(/\s+/g, ' ').trim();

  function sameCaption(a, b) {
    const x = normalized(a);
    const y = normalized(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const shorter = x.length < y.length ? x : y;
    const longer = x.length < y.length ? y : x;
    return shorter.length >= 12 && longer.startsWith(shorter) && shorter.length / longer.length >= 0.45;
  }

  class CaptionAssembler {
    constructor() {
      this.pending = [];
      this.recent = [];
    }

    observe(text, now = Date.now()) {
      const lines = String(text).split(/\r?\n/).map(clean)
        .filter(line => line.length >= 3 && !/^(live captions|transcription|microsoft teams)$/i.test(line));
      const next = [];
      const used = new Set();
      for (const line of lines) {
        const index = this.pending.findIndex((item, i) => !used.has(i) && sameCaption(item.text, line));
        if (index >= 0) {
          used.add(index);
          const old = this.pending[index];
          next.push({ text: line.length >= old.text.length ? line : old.text, at: old.at, lastSeen: now });
        } else {
          next.push({ text: line, at: now, lastSeen: now });
        }
      }
      const missing = this.pending.filter((_, i) => !used.has(i));
      const finished = missing.filter(item => now - item.lastSeen >= 3500);
      next.push(...missing.filter(item => now - item.lastSeen < 3500));
      this.pending = next;
      return this.commit(finished, now);
    }

    flush(now = Date.now()) {
      const finished = this.pending;
      this.pending = [];
      return this.commit(finished, now);
    }

    commit(items, now) {
      this.recent = this.recent.filter(item => now - item.at < 30000);
      const output = [];
      for (const item of items) {
        if (this.recent.some(previous => sameCaption(previous.text, item.text))) continue;
        output.push(item.text);
        this.recent.push({ text: item.text, at: now });
      }
      return output;
    }
  }

  global.CaptionAssembler = CaptionAssembler;
  if (typeof module !== 'undefined') module.exports = { CaptionAssembler, sameCaption };
})(typeof window === 'undefined' ? globalThis : window);
