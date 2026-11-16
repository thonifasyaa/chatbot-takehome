const STOP_WORDS = new Set([
  'ada', 'apa', 'aja', 'atau', 'bagaimana', 'berapa', 'buat', 'dan', 'dari', 'dong',
  'harga', 'ini', 'itu', 'kak', 'kah', 'katalog', 'ke', 'yang', 'mana', 'mau', 'min',
  'model', 'oleh', 'paling', 'produk', 'saja', 'saya', 'semua', 'toko', 'untuk', 'ya',
]);

function tokenize(value) {
  return value.toLocaleLowerCase('id-ID').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
}

function retrieveProducts(query, products, limit = 6) {
  const normalized = query.toLocaleLowerCase('id-ID').trim();
  const tokens = tokenize(query).filter((token) => !STOP_WORDS.has(token) && token.length > 1);
  const asksForAll = /\b(semua|seluruh|daftar|katalog|koleksi)\b/.test(normalized) && tokens.length === 0;
  if (asksForAll) return products.slice(0, Math.min(products.length, 12));

  const ranked = products.map((product) => {
    const name = product.nama.toLocaleLowerCase('id-ID');
    const description = product.deskripsi.toLocaleLowerCase('id-ID');
    let score = 0;
    for (const token of tokens) {
      if (name.includes(token)) score += token.length > 3 ? 5 : 3;
      if (description.includes(token)) score += 2;
      if (product.kategori.toLocaleLowerCase('id-ID').includes(token)) score += 1;
    }
    if (normalized.includes('termurah') || normalized.includes('murah')) score += 0;
    return { product, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.product.harga - b.product.harga);

  if (ranked.length) return ranked.slice(0, limit).map((item) => item.product);
  if (/\b(termurah|paling murah|harga terendah)\b/.test(normalized)) {
    return [...products].sort((a, b) => a.harga - b.harga).slice(0, limit);
  }
  return [];
}

function formatPrice(price) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price);
}

function buildGroundedAnswer(query, products, matches) {
  if (!matches.length) return 'Saya belum menemukan produk yang cocok di katalog. Coba sebutkan ukuran atau jenis penggaris, misalnya “30 cm”, “besi”, atau “segitiga”.';
  const normalized = query.toLocaleLowerCase('id-ID');
  if (/\b(termurah|paling murah|harga terendah)\b/.test(normalized)) {
    const cheapest = [...products].sort((a, b) => a.harga - b.harga)[0];
    return `Produk dengan harga terendah di katalog adalah ${cheapest.nama}, seharga ${formatPrice(cheapest.harga)}.`;
  }
  if (/\b(rating|terlaris|paling laku)\b/.test(normalized)) {
    const sorted = [...matches].sort((a, b) => /laku|terjual/.test(normalized) ? parseSales(b.terjual) - parseSales(a.terjual) : b.rating - a.rating);
    const best = sorted[0];
    return `${best.nama}: ${formatPrice(best.harga)}${best.rating ? `, rating ${best.rating}/5` : ''}${best.terjual ? `, ${best.terjual}` : ''}.`;
  }
  const heading = matches.length === 1 ? 'Saya menemukan produk ini:' : `Berikut ${matches.length} produk yang cocok:`;
  return `${heading}\n${matches.slice(0, 6).map((item) => `• ${item.nama} — ${formatPrice(item.harga)}${item.rating ? ` · rating ${item.rating}/5` : ''}`).join('\n')}`;
}

function parseSales(value = '') {
  const match = value.match(/([\d.]+)\s*(RB\+)?/i);
  if (!match) return 0;
  const count = Number(match[1].replace(/\./g, '')) || 0;
  return match[2] ? count * 1000 : count;
}

async function answerQuery(query, products) {
  const matches = retrieveProducts(query, products);
  const fallback = buildGroundedAnswer(query, products, matches);
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !matches.length) return { answer: fallback, products: matches, mode: 'catalog' };

  const context = matches.map((item) => `Nama: ${item.nama}\nKategori: ${item.kategori}\nHarga: ${formatPrice(item.harga)}\nDeskripsi: ${item.deskripsi || 'Tidak tersedia'}\nRating: ${item.rating || 'Tidak tersedia'}\nTerjual: ${item.terjual || 'Tidak tersedia'}\nPromo: ${item.promo || 'Tidak tersedia'}`).join('\n\n');
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0.2,
        max_tokens: 350,
        messages: [
          { role: 'system', content: 'Kamu adalah asisten katalog produk berbahasa Indonesia. Jawab hanya memakai data katalog di bawah. Jangan menebak atau mengarang harga, stok, atau deskripsi. Jika informasi tidak tersedia, katakan dengan jelas. Jawab ringkas dan ramah.' },
          { role: 'user', content: `Pertanyaan: ${query}\n\nData katalog yang ditemukan:\n${context}` },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Groq returned ${response.status}`);
    const payload = await response.json();
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('Empty Groq response');
    return { answer, products: matches, mode: 'groq' };
  } catch (error) {
    console.error('[RAG] LLM unavailable; using catalog response:', error.message);
    return { answer: fallback, products: matches, mode: 'catalog' };
  }
}

module.exports = { answerQuery, buildGroundedAnswer, formatPrice, retrieveProducts };
