const state = { products: [], category: 'all', search: '', sort: 'featured' };
const grid = document.getElementById('product-grid');
const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function visibleProducts() {
  const query = state.search.toLocaleLowerCase('id-ID').trim();
  let products = state.products.filter((product) => {
    const matchesCategory = state.category === 'all' || product.kategori === state.category;
    const matchesQuery = !query || `${product.nama} ${product.kategori} ${product.deskripsi}`.toLocaleLowerCase('id-ID').includes(query);
    return matchesCategory && matchesQuery;
  });
  if (state.sort === 'price-asc') products = [...products].sort((a, b) => a.harga - b.harga);
  if (state.sort === 'price-desc') products = [...products].sort((a, b) => b.harga - a.harga);
  if (state.sort === 'rating') products = [...products].sort((a, b) => b.rating - a.rating);
  return products;
}

function makeProductCard(product) {
  const card = document.createElement('article');
  card.className = 'product-card';
  const imageWrap = document.createElement('div');
  imageWrap.className = 'product-image';
  if (product.gambar) {
    const image = document.createElement('img');
    image.src = product.gambar;
    image.alt = product.nama;
    image.loading = 'lazy';
    image.onerror = () => { image.remove(); imageWrap.append(textElement('span', 'product-placeholder', 'P')); };
    imageWrap.append(image);
  } else imageWrap.append(textElement('span', 'product-placeholder', 'P'));
  const badgeText = product.promo || product.kategori || 'Pilihan';
  imageWrap.append(textElement('span', 'product-badge', badgeText));
  const info = document.createElement('div');
  info.className = 'product-info';
  const meta = document.createElement('div');
  meta.className = 'product-meta';
  meta.append(textElement('span', '', product.kategori || 'Katalog'));
  if (product.rating) meta.append(textElement('span', 'product-rating', `★ ${product.rating}`));
  const name = textElement('h3', 'product-name', product.nama);
  const bottom = document.createElement('div');
  bottom.className = 'product-bottom';
  bottom.append(textElement('span', 'product-price', money.format(product.harga)));
  if (product.url) {
    const link = textElement('a', 'product-link', 'Lihat produk ↗');
    link.href = product.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    bottom.append(link);
  }
  info.append(meta, name, bottom);
  card.append(imageWrap, info);
  return card;
}

function renderProducts() {
  const products = visibleProducts();
  document.getElementById('product-count').textContent = state.products.length;
  document.getElementById('hero-count').textContent = state.products.length;
  grid.replaceChildren();
  if (!products.length) {
    grid.append(textElement('div', 'empty-state', 'Produk tidak ditemukan. Coba kata pencarian lain.'));
  } else {
    products.forEach((product) => grid.append(makeProductCard(product)));
  }
  document.getElementById('catalog-note').textContent = `Menampilkan ${products.length} dari ${state.products.length} produk · informasi berdasarkan data katalog.`;
}

async function loadCatalog() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('Katalog belum dapat dimuat.');
    const data = await response.json();
    state.products = data.products || [];
    renderProducts();
  } catch (error) {
    grid.replaceChildren(textElement('div', 'empty-state', 'Katalog belum dapat dimuat. Periksa koneksi lalu muat ulang halaman.'));
  }
}

document.getElementById('product-search').addEventListener('input', (event) => { state.search = event.target.value; renderProducts(); });
document.getElementById('product-sort').addEventListener('change', (event) => { state.sort = event.target.value; renderProducts(); });
document.querySelectorAll('.filter-chip').forEach((button) => button.addEventListener('click', () => {
  state.category = button.dataset.category;
  document.querySelectorAll('.filter-chip').forEach((chip) => chip.classList.toggle('active', chip === button));
  renderProducts();
}));

const panel = document.getElementById('chat-panel');
const launcher = document.getElementById('chat-launcher');
const input = document.getElementById('chat-input');
const messages = document.getElementById('chat-messages');
function setChatOpen(open) {
  panel.hidden = !open;
  launcher.setAttribute('aria-expanded', String(open));
  if (open) input.focus();
}
launcher.addEventListener('click', () => setChatOpen(panel.hidden));
document.getElementById('chat-close').addEventListener('click', () => setChatOpen(false));
document.getElementById('ask-hero').addEventListener('click', () => { setChatOpen(true); });
document.querySelectorAll('.suggestions button').forEach((button) => button.addEventListener('click', () => {
  input.value = button.textContent;
  document.getElementById('chat-form').requestSubmit();
}));

function appendMessage(text, who) {
  const message = textElement('div', `message ${who}-message`, text);
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
}

function appendChatProducts(products = []) {
  if (!products.length) return;
  const list = document.createElement('div');
  list.className = 'chat-products';
  products.slice(0, 3).forEach((product) => {
    const item = document.createElement(product.url ? 'a' : 'div');
    item.className = 'chat-product';
    if (product.url) { item.href = product.url; item.target = '_blank'; item.rel = 'noopener noreferrer'; }
    if (product.gambar) {
      const image = document.createElement('img');
      image.src = product.gambar;
      image.alt = '';
      image.loading = 'lazy';
      item.append(image);
    } else item.append(textElement('span', 'mini-placeholder', 'P'));
    const details = document.createElement('div');
    details.append(textElement('strong', '', product.nama), textElement('span', '', money.format(product.harga)));
    item.append(details);
    list.append(item);
  });
  messages.append(list);
  messages.scrollTop = messages.scrollHeight;
}

document.getElementById('chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  appendMessage(message, 'user');
  input.value = '';
  const thinking = textElement('div', 'message assistant-message chat-thinking', 'Mencari di katalog…');
  messages.append(thinking);
  messages.scrollTop = messages.scrollHeight;
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message }) });
    const data = await response.json();
    thinking.remove();
    if (!response.ok) throw new Error(data.error || 'Asisten belum dapat menjawab.');
    appendMessage(data.answer, 'assistant');
    appendChatProducts(data.products);
  } catch (error) {
    thinking.remove();
    appendMessage(error.message || 'Asisten belum dapat menjawab. Silakan coba lagi.', 'assistant');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    document.getElementById('product-search').focus();
  }
  if (event.key === 'Escape' && !panel.hidden) setChatOpen(false);
});

loadCatalog();
