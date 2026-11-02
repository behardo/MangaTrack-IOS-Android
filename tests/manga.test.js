import test from 'node:test';
import assert from 'node:assert/strict';

import { mapAniList, mangaInfo } from '../src/api/manga.js';

test('mapAniList normalizza titolo, cover, voto e sinossi', () => {
  const manga = mapAniList({
    title: { romaji: 'Sousou no Frieren', english: 'Frieren' },
    coverImage: { large: 'https://img.example/cover.jpg' },
    genres: ['Adventure', 'Drama'],
    chapters: 120,
    volumes: 12,
    format: 'MANGA',
    averageScore: 87,
    description: '<b>Una</b> maga &quot;elfica&quot; &amp; il tempo.<br>Seconda riga'
  });

  assert.equal(manga.title, 'Sousou no Frieren');
  assert.equal(manga.title_english, 'Frieren');
  assert.equal(manga.images.jpg.image_url, 'https://img.example/cover.jpg');
  assert.deepEqual(manga.genres, [{ name: 'Adventure' }, { name: 'Drama' }]);
  assert.equal(manga.chapters, 120);
  assert.equal(manga.volumes, 12);
  assert.equal(manga.score, 8.7);
  assert.equal(manga.synopsis, 'Una maga "elfica" & il tempo. Seconda riga');
});

test('mangaInfo preferisce la corrispondenza esatta del titolo', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: {
        Page: {
          media: [
            {
              title: { romaji: 'S.H.N.D.: Ero Gal', english: null },
              coverImage: { large: 'https://img.example/wrong.jpg' },
              genres: [],
              chapters: 11,
              volumes: 1,
              format: 'MANGA',
              averageScore: 70,
              description: 'Titolo sbagliato'
            },
            {
              title: { romaji: 'Real', english: 'Real' },
              coverImage: { large: 'https://img.example/real.jpg' },
              genres: ['Drama'],
              chapters: null,
              volumes: 14,
              format: 'MANGA',
              averageScore: 90,
              description: 'Tre ragazzi e il basket.'
            }
          ]
        }
      }
    })
  });

  const info = await mangaInfo('Real');

  assert.equal(info.title, 'Real');
  assert.equal(info.images.jpg.image_url, 'https://img.example/real.jpg');
  assert.equal(info.synopsis, 'Tre ragazzi e il basket.');
});

test('mangaInfo non chiama la rete senza un titolo', async () => {
  assert.equal(await mangaInfo('   '), null);
});

test('mangaInfo restituisce null se AniList non risponde', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async () => { throw new Error('offline'); };

  assert.equal(await mangaInfo('Berserk'), null);
});
