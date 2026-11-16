require('dotenv').config();

const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { loadProducts } = require('./lib/catalog');
const { answerQuery, formatPrice } = require('./lib/rag');

const lastProductsBySender = new Map();
const inFlightMessages = new Set();
const processedMessages = new Set();
const HISTORY_LIMIT = 500;

function isGreeting(message) {
  return /^(halo|hai|hi|hey|hello|p|ping|test|pagi|selamat pagi|siang|selamat siang|sore|selamat sore|malam|selamat malam|assalamualaikum|assalamu'alaikum|permisi)[!.\s]*$/i.test(message.trim());
}

function isThanks(message) {
  return /^(terima kasih|terimakasih|makasih|makasi|thanks|thank you|thx)[!.\s]*$/i.test(message.trim());
}

function isFollowUp(message) {
  return /\b(harganya|berapa harga|berapa harganya|yang tadi|produk tadi|linknya|tautannya|detailnya|ratingnya)\b/i.test(message);
}

function formatFollowUp(product, query) {
  const normalized = query.toLocaleLowerCase('id-ID');
  const lines = [`*${product.nama}*`, `Harga: ${formatPrice(product.harga)}`];
  if (/rating/.test(normalized) && product.rating) lines.push(`Rating: ${product.rating}/5`);
  if (/terjual|laku/.test(normalized) && product.terjual) lines.push(`Terjual: ${product.terjual}`);
  if (/link|tautan/.test(normalized) && product.url) lines.push(product.url);
  return lines.join('\n');
}

function rememberMessage(id) {
  if (processedMessages.has(id)) return false;
  processedMessages.add(id);
  if (processedMessages.size > HISTORY_LIMIT) {
    const oldest = processedMessages.values().next().value;
    processedMessages.delete(oldest);
  }
  return true;
}

const phoneNumber = (process.env.WA_PHONE_NUMBER || '').replace(/\D/g, '');
const clientOptions = {
  authStrategy: new LocalAuth({ clientId: 'shopee-catalog-takehome' }),
  authTimeoutMs: Number(process.env.WWEBJS_AUTH_TIMEOUT_MS) || 90000,
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  },
};
if (phoneNumber) {
  clientOptions.pairWithPhoneNumber = { phoneNumber, showNotification: true };
}
const client = new Client(clientOptions);

client.on('qr', (qr) => {
  if (phoneNumber) return;
  console.log('\nPindai QR ini melalui WhatsApp > Perangkat tertaut > Tautkan perangkat.');
  qrcode.generate(qr, { small: true });
});

client.on('code', (code) => {
  console.log('\nKode tautkan perangkat:', code);
  console.log('Di WhatsApp, pilih “Tautkan dengan nomor telepon saja”, lalu masukkan kode ini.');
});

client.on('authenticated', () => console.log('Autentikasi WhatsApp berhasil.'));
client.on('auth_failure', (message) => console.error('Autentikasi gagal:', message));
client.on('loading_screen', (percent, message) => console.log(`[WhatsApp Web] ${percent}% ${message || ''}`));
client.on('change_state', (state) => console.log('[WhatsApp Web] status:', state));
client.on('ready', () => console.log('Gateway WhatsApp siap. Pesan pribadi akan dijawab dari data/products.csv.'));
client.on('disconnected', (reason) => console.warn('WhatsApp terputus:', reason));

client.on('message', async (msg) => {
  const messageId = msg.id?._serialized;
  if (msg.fromMe || !msg.body || !messageId || !rememberMessage(messageId)) return;
  if (!msg.from.endsWith('@c.us') && !msg.from.endsWith('@lid')) return;
  if (msg.from.endsWith('@status')) return;

  const query = msg.body.trim();
  if (!query || query.length > 500) {
    await msg.reply('Pesan terlalu panjang. Silakan kirim pertanyaan produk yang lebih singkat.');
    return;
  }
  if (inFlightMessages.has(messageId)) return;
  inFlightMessages.add(messageId);

  try {
    if (isGreeting(query)) {
      await msg.reply('Halo! Saya asisten katalog. Tanyakan ukuran atau jenis penggaris, misalnya “penggaris 30 cm”.');
      return;
    }
    if (isThanks(query)) {
      await msg.reply('Sama-sama! Silakan tanya lagi jika ingin mencari produk lain.');
      return;
    }

    const previousProducts = lastProductsBySender.get(msg.from) || [];
    if (isFollowUp(query) && previousProducts.length) {
      await msg.reply(formatFollowUp(previousProducts[0], query));
      return;
    }

    const result = await answerQuery(query, loadProducts());
    if (result.products.length) lastProductsBySender.set(msg.from, result.products);
    await msg.reply(result.answer);
  } catch (error) {
    console.error('Gagal memproses pesan:', error.message);
    try { await msg.reply('Maaf, asisten sedang mengalami kendala. Silakan coba lagi sebentar.'); }
    catch (replyError) { console.error('Gagal mengirim balasan:', replyError.message); }
  } finally {
    inFlightMessages.delete(messageId);
  }
});

console.log('Memulai gateway dan memuat WhatsApp Web...');
client.initialize().catch((error) => {
  console.error('Gateway gagal dijalankan:', error.stack || error);
  client.destroy()
    .catch((cleanupError) => console.error('Gagal menutup Chromium setelah timeout:', cleanupError.message))
    .finally(() => { process.exitCode = 1; });
});

async function shutdown() {
  console.log('\nMenutup gateway WhatsApp...');
  try { await client.destroy(); }
  catch (error) { console.error('Penutupan client:', error.message); }
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
