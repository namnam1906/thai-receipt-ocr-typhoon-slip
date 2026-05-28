import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 10);

const requiredEnv = ['N8N_OCR_PREVIEW_URL', 'N8N_CONFIRM_SAVE_URL', 'N8N_TRANSACTIONS_URL'];
const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length && process.env.NODE_ENV === 'production') {
  console.warn(`Missing env vars: ${missing.join(', ')}`);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('tiny'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'application/pdf'].includes(file.mimetype);
    cb(ok ? null : new Error('รองรับเฉพาะไฟล์ PNG, JPG, JPEG หรือ PDF'), ok);
  }
});

const emptyReceipt = () => ({
  document_type: '', expense_category: '',
  issuer_name: '', issuer_tax_id: '', receipt_no: '', issue_date: '', issue_time: '',
  customer_name: '', customer_tax_id: '', subtotal_amount: '', vat_amount: '', total_amount: '', payment_method: '',
  bank_name: '', sender_name: '', sender_account: '', receiver_name: '', receiver_account: '',
  transfer_datetime: '', transaction_ref: '', transfer_amount: ''
});

function normalizeDate(value) {
  if (!value) return '';
  const months = { 'ม.ค.':'01','มกราคม':'01','ก.พ.':'02','กุมภาพันธ์':'02','มี.ค.':'03','มีนาคม':'03','เม.ย.':'04','เมษายน':'04','พ.ค.':'05','พฤษภาคม':'05','มิ.ย.':'06','มิถุนายน':'06','ก.ค.':'07','กรกฎาคม':'07','ส.ค.':'08','สิงหาคม':'08','ก.ย.':'09','กันยายน':'09','ต.ค.':'10','ตุลาคม':'10','พ.ย.':'11','พฤศจิกายน':'11','ธ.ค.':'12','ธันวาคม':'12' };
  let s = String(value).trim().replace(/-/g, '/').replace(/\s+/g, ' ');
  const thai = s.match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{2,4})/);
  if (thai) s = `${thai[1]}/${months[thai[2]] || ''}/${thai[3]}`;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return value;
  let [, d, mo, y] = m;
  let year = Number(y);
  if (y.length === 2) year = 2500 + year;
  else if (year < 2400) year += 543;
  return `${String(Number(d)).padStart(2, '0')}/${String(Number(mo)).padStart(2, '0')}/${year}`;
}
function normalizeAmount(v) { if (v === null || v === undefined || v === '') return ''; return String(v).replace(/,/g, '').replace(/บาท/g, '').trim(); }
function cleanReceipt(data = {}) {
  const r = { ...emptyReceipt(), ...data };
  r.issue_date = normalizeDate(r.issue_date);
  r.transfer_datetime = normalizeDate(r.transfer_datetime);
  ['subtotal_amount','vat_amount','total_amount','transfer_amount'].forEach(k => r[k] = normalizeAmount(r[k]));
  if ((r.document_type || '').includes('slip') && !r.total_amount && r.transfer_amount) r.total_amount = r.transfer_amount;
  if ((r.document_type || '').includes('slip') && !r.payment_method) r.payment_method = 'โอนเงิน';
  return r;
}
async function postToN8n(url, body, options = {}) {
  const res = await fetch(url, { method: 'POST', body, ...options });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(json.message || json.error || `n8n error ${res.status}`);
  return json;
}

app.post('/api/ocr-preview', upload.single('receipt'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'กรุณาเลือกไฟล์' });
    const form = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    form.append('file', blob, req.file.originalname);
    form.append('uploaded_by', req.body.uploaded_by || 'web');
    form.append('client_request_id', nanoid());
    const out = await postToN8n(process.env.N8N_OCR_PREVIEW_URL, form);
    res.json({ ...out, data: cleanReceipt(out.data || out) });
  } catch (err) { next(err); }
});

app.post('/api/confirm-save', async (req, res, next) => {
  try {
    const payload = { ...req.body, data: cleanReceipt(req.body.data || req.body) };
    const out = await postToN8n(process.env.N8N_CONFIRM_SAVE_URL, JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
    res.json(out);
  } catch (err) { next(err); }
});

app.get('/api/transactions', async (_req, res, next) => {
  try {
    const r = await fetch(process.env.N8N_TRANSACTIONS_URL);
    const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = { rows: [] }; }
    if (!r.ok) throw new Error(json.message || `n8n error ${r.status}`);
    res.json(Array.isArray(json) ? { rows: json } : json);
  } catch (err) { next(err); }
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use((err, _req, res, _next) => res.status(500).json({ message: err.message || 'Server error' }));
app.listen(PORT, () => console.log(`thai-receipt-ocr-typhoon running on ${PORT}`));
