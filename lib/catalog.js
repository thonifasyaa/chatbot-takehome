const fs = require('node:fs');
const path = require('node:path');

const CSV_PATH = path.join(__dirname, '..', 'data', 'products.csv');

function parseCsv(text) {
  const input = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  if (rows.length < 2) return [];

  const headers = rows.shift().map((header) => header.trim());
  return rows.filter((values) => values.some((value) => value.trim())).map((values) => {
    const product = Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]));
    return {
      nama: product.nama || '',
      kategori: product.kategori || '',
      harga: Number(product.harga) || 0,
      deskripsi: product.deskripsi || '',
      gambar: product.gambar || '',
      url: product.url || '',
      rating: Number(product.rating) || 0,
      terjual: product.terjual || '',
      promo: product.promo || '',
    };
  });
}

function loadProducts() {
  return parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
}

module.exports = { CSV_PATH, loadProducts, parseCsv };
