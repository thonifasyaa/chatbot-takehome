const { loadProducts } = require('../lib/catalog');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
  try {
    res.status(200).json({ products: loadProducts() });
  } catch (error) {
    console.error('[Catalog] Failed to load products:', error.message);
    res.status(500).json({ error: 'Katalog produk belum dapat dimuat.' });
  }
};
