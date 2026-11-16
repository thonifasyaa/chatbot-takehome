const { loadProducts } = require('../lib/catalog');
const { answerQuery } = require('../lib/rag');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Metode tidak didukung.' });
  }
  const query = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!query || query.length > 500) return res.status(400).json({ error: 'Pertanyaan harus berisi 1–500 karakter.' });
  try {
    const result = await answerQuery(query, loadProducts());
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Chat] Failed to answer:', error.message);
    return res.status(500).json({ error: 'Asisten sedang mengalami kendala. Silakan coba lagi.' });
  }
};
