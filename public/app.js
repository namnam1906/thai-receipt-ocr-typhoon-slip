const fields = [
  ['document_type','ประเภทเอกสาร', 'select'], ['expense_category','หมวดค่าใช้จ่าย'],
  ['issuer_name','ผู้ออกเอกสาร / ธนาคาร / ร้านค้า'], ['issuer_tax_id','เลขผู้เสียภาษีผู้ออก'],
  ['receipt_no','เลขที่เอกสาร'], ['issue_date','วันที่ออกเอกสาร'], ['issue_time','เวลา'],
  ['customer_name','ลูกค้า'], ['customer_tax_id','เลขผู้เสียภาษีลูกค้า'],
  ['subtotal_amount','ก่อน VAT'], ['vat_amount','VAT'], ['total_amount','รวมทั้งสิ้น'], ['payment_method','วิธีชำระเงิน'],
  ['bank_name','ธนาคาร/แอปที่ใช้โอน'], ['sender_name','ชื่อผู้โอน'], ['sender_account','บัญชีผู้โอน'],
  ['receiver_name','ชื่อผู้รับเงิน'], ['receiver_account','บัญชีผู้รับเงิน'], ['transfer_datetime','วันที่/เวลาโอน'],
  ['transaction_ref','เลขอ้างอิงรายการ'], ['transfer_amount','ยอดเงินโอน']
];
let current = { data: {}, file_url: '', ocr_text: '' };
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function esc(v){ return String(v ?? '').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function show(el, msg) { if (el) el.textContent = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2); }
function renderForm(data = {}) {
  const form = $('previewForm'); if (!form) return;
  form.innerHTML = fields.map(([key, label, type]) => {
    const wide = ['issuer_name','customer_name','receiver_name','sender_name'].includes(key) ? 'wide' : '';
    if (type === 'select') {
      const v = data[key] || 'receipt';
      return `<label class="${wide}">${label}<select name="${key}">
        <option value="receipt" ${v==='receipt'?'selected':''}>ใบเสร็จรับเงิน</option>
        <option value="tax_invoice" ${v==='tax_invoice'?'selected':''}>ใบกำกับภาษี</option>
        <option value="transfer_slip" ${v==='transfer_slip'?'selected':''}>สลิปโอนเงิน</option>
      </select></label>`;
    }
    return `<label class="${wide}">${label}<input name="${key}" value="${esc(data[key])}" /></label>`;
  }).join('') + `<label class="wide">OCR text<textarea name="ocr_text">${esc(current.ocr_text || '')}</textarea></label>`;
}
async function jsonFetch(url, options) {
  const res = await fetch(url, options); const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed'); return data;
}
if ($('receipt')) {
  $('receipt').addEventListener('change', e => $('fileName').textContent = e.target.files?.[0]?.name || 'เลือกไฟล์ PNG, JPG หรือ PDF');
  $('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('saveBtn').disabled = true; show($('uploadStatus'), 'กำลังส่งไฟล์ไป n8n และ Typhoon OCR...');
    try {
      const data = await jsonFetch('/api/ocr-preview', { method: 'POST', body: new FormData(e.target) });
      current = { ...data, data: data.data || data };
      renderForm({ document_type: current.data.document_type || data.document_type || 'receipt', expense_category: data.expense_category || '', ...current.data });
      if (data.file_url) { $('fileLink').href = data.file_url; $('fileLink').classList.remove('hidden'); }
      $('saveBtn').disabled = false; show($('uploadStatus'), 'OCR สำเร็จ กรุณาตรวจข้อมูลด้านขวา');
    } catch (err) { show($('uploadStatus'), `ผิดพลาด: ${err.message}`); }
  });
  $('saveBtn').addEventListener('click', async () => {
    const fd = new FormData($('previewForm')); const data = Object.fromEntries(fd.entries());
    const ocr_text = data.ocr_text; delete data.ocr_text;
    show($('saveStatus'), 'กำลังบันทึกลง Google Sheets...');
    try {
      const out = await jsonFetch('/api/confirm-save', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ ...current, data, ocr_text, file_url: current.file_url, status: 'confirmed' }) });
      show($('saveStatus'), out.message || 'บันทึกสำเร็จ');
    } catch (err) { show($('saveStatus'), `ผิดพลาด: ${err.message}`); }
  });
  renderForm();
}
async function loadDashboard() {
  if (!$('rows')) return; $('rows').innerHTML = '<tr><td colspan="8">Loading...</td></tr>';
  try {
    const out = await jsonFetch('/api/transactions'); const rows = out.rows || out.data || [];
    window.__rows = rows; renderRows(rows);
    $('count').textContent = rows.length; $('sum').textContent = fmt(rows.reduce((a,r)=>a+Number(r.total_amount||r.transfer_amount||0),0)); $('vat').textContent = fmt(rows.reduce((a,r)=>a+Number(r.vat_amount||0),0)); $('latest').textContent = rows[0]?.issue_date || rows[0]?.transfer_datetime || '-';
  } catch (err) { $('rows').innerHTML = `<tr><td colspan="8">${err.message}</td></tr>`; }
}
function renderRows(rows) {
  const q = ($('search')?.value || '').toLowerCase();
  const filtered = rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
  $('rows').innerHTML = filtered.map(r => `<tr><td>${r.issue_date||r.transfer_datetime||''}</td><td><span class="pill">${r.document_type||'receipt'}</span></td><td>${r.issuer_name||r.bank_name||r.receiver_name||''}</td><td>${r.receipt_no||r.transaction_ref||''}</td><td>${r.expense_category||''}</td><td>${fmt(r.total_amount||r.transfer_amount)}</td><td>${r.file_url ? `<a class="link" href="${r.file_url}" target="_blank">ดูไฟล์</a>` : '-'}</td><td><span class="pill">${r.status||'saved'}</span></td></tr>`).join('') || '<tr><td colspan="8">ไม่พบข้อมูล</td></tr>';
}
$('refreshBtn')?.addEventListener('click', loadDashboard);
$('search')?.addEventListener('input', () => renderRows(window.__rows || []));
loadDashboard();
