import test from 'node:test';
import assert from 'node:assert/strict';

import handler, { mergeTotals } from '../api/totals.js';

function makeRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('mergeTotals prende il valore più alto per capitoli e volumi', () => {
  assert.deepEqual(
    mergeTotals([
      { chapters: 10, volumes: 2 },
      { chapters: 12, volumes: null },
      { chapters: null, volumes: 5 }
    ]),
    { chapters: 12, volumes: 5 }
  );
});

test('mergeTotals ignora zero e valori non validi', () => {
  assert.deepEqual(
    mergeTotals([
      { chapters: 0, volumes: 0 },
      { chapters: null, volumes: '12' },
      { chapters: '98', volumes: undefined }
    ]),
    { chapters: 98, volumes: 12 }
  );
});

test('handler ricava i totali da MangaDex aggregate per le serie in corso', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async url => {
    const target = String(url);
    const payload = target.includes('/aggregate')
      ? {
          volumes: {
            '1': { chapters: { '1': {}, '2': {} } },
            '2': { chapters: { '3': {}, '4': {} } },
            none: { chapters: { '99': {} } }
          }
        }
      : target.includes('mangadex')
        ? { data: [{ id: 'manga-1', attributes: { lastChapter: '', lastVolume: '' } }] }
        : { data: [] };
    return { ok: true, json: async () => payload };
  };

  const res = makeRes();
  await handler({ method: 'GET', query: { title: `Aggregate ${Date.now()}` } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.chapters, 99);
  assert.equal(res.body.volumes, 2);
  assert.deepEqual(res.body.sources, ['mangadex']);
});

test('handler rifiuta i metodi diversi da GET', async () => {
  const res = makeRes();
  await handler({ method: 'POST', query: {} }, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET');
});

test('handler richiede il parametro title', async () => {
  const res = makeRes();
  await handler({ method: 'GET', query: {} }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /title/);
});

test('handler aggrega le fonti e poi serve dalla cache', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async url => {
    const target = String(url);
    const payload = target.includes('mangadex')
      ? { data: [{ attributes: { lastChapter: '87', lastVolume: '9' } }] }
      : target.includes('kitsu')
        ? { data: [{ attributes: { chapterCount: 90, volumeCount: 10 } }] }
        : { data: [{ chapters: 88, volumes: 9 }] };
    return { ok: true, json: async () => payload };
  };

  const title = `Berserk test ${Date.now()}`;

  const first = makeRes();
  await handler({ method: 'GET', query: { title } }, first);

  assert.equal(first.statusCode, 200);
  assert.equal(first.body.title, title);
  assert.equal(first.body.chapters, 90);
  assert.equal(first.body.volumes, 10);
  assert.deepEqual(first.body.sources.sort(), ['jikan', 'kitsu', 'mangadex']);
  assert.equal(first.headers['X-Cache'], 'MISS');

  const second = makeRes();
  await handler({ method: 'GET', query: { title } }, second);

  assert.equal(second.statusCode, 200);
  assert.equal(second.headers['X-Cache'], 'HIT');
  assert.equal(second.body.chapters, 90);
});
