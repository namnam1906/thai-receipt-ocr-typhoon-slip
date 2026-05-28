# thai-receipt-ocr-typhoon

เว็บแอพอัพโหลดใบเสร็จ/ใบกำกับภาษีไทย/สลิปโอนเงิน → n8n → Google Drive → Typhoon OCR → Preview ให้แก้ไข → Confirm save → Google Sheets → Dashboard

Typhoon OCR รองรับ PNG, JPEG และ PDF และเอกสารปัจจุบันแนะนำ model `typhoon-ocr` สำหรับงานใหม่

## Project structure

```txt
thai-receipt-ocr-typhoon/
├─ package.json
├─ server.js
├─ railway.json
├─ .env.example
├─ .gitignore
├─ public/
│  ├─ index.html
│  ├─ dashboard.html
│  ├─ style.css
│  └─ app.js
└─ n8n/
   ├─ n8n-ocr-preview-typhoon.json
   ├─ n8n-confirm-save.json
   └─ n8n-dashboard-transactions.json
```

## Google Sheet columns

สร้างชีตชื่อ `Transactions` แล้วใส่ header แถวแรกตามนี้:

```txt
id,created_at,uploaded_by,document_type,expense_category,issuer_name,issuer_tax_id,receipt_no,issue_date,issue_time,customer_name,customer_tax_id,subtotal_amount,vat_amount,total_amount,payment_method,bank_name,sender_name,sender_account,receiver_name,receiver_account,transfer_datetime,transaction_ref,transfer_amount,file_url,ocr_text,status
```

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

## Railway environment variables

```env
N8N_OCR_PREVIEW_URL=https://YOUR-N8N-DOMAIN/webhook/receipt-ocr-preview
N8N_CONFIRM_SAVE_URL=https://YOUR-N8N-DOMAIN/webhook/receipt-confirm-save
N8N_TRANSACTIONS_URL=https://YOUR-N8N-DOMAIN/webhook/transactions
MAX_FILE_SIZE_MB=10
NODE_ENV=production
```

## n8n environment variables / credentials

ตั้งค่า env ใน n8n:

```env
TYPHOON_API_KEY=YOUR_TYPHOON_API_KEY
GOOGLE_SHEET_ID=YOUR_GOOGLE_SHEET_ID
GOOGLE_DRIVE_FOLDER_ID=YOUR_GOOGLE_DRIVE_FOLDER_ID
```

จากนั้นสร้าง credentials:

- Google Drive OAuth2
- Google Sheets OAuth2

หลัง import workflow ให้เปิดแต่ละ node Google Drive / Google Sheets แล้วเลือก credential จริงของคุณแทน `REPLACE_ME`

## Import n8n workflows

1. เข้า n8n → Workflows → Import from File
2. import `n8n/n8n-ocr-preview-typhoon.json`
3. import `n8n/n8n-confirm-save.json`
4. import `n8n/n8n-dashboard-transactions.json`
5. ตั้ง credential ใน node Google Drive / Google Sheets
6. Activate ทั้ง 3 workflows
7. copy Production Webhook URL ไปใส่ Railway env

## Typhoon OCR prompt

```txt
อ่านข้อความจากเอกสารการเงินไทยนี้ ซึ่งอาจเป็นใบเสร็จรับเงิน ใบกำกับภาษี หรือสลิปโอนเงิน แล้ว extract ข้อมูลออกมาเป็น JSON เท่านั้น ห้ามใส่ markdown ห้ามใส่คำอธิบาย

ต้องการ field:
document_type
issuer_name
issuer_tax_id
receipt_no
issue_date
issue_time
customer_name
customer_tax_id
subtotal_amount
vat_amount
total_amount
payment_method
bank_name
sender_name
sender_account
receiver_name
receiver_account
transfer_datetime
transaction_ref
transfer_amount

เงื่อนไข:
- document_type ให้ตอบเป็น receipt, tax_invoice หรือ transfer_slip เท่านั้น
- ถ้าเป็นสลิปโอนเงิน ให้ issuer_name เป็นชื่อธนาคารหรือผู้ให้บริการ ถ้าเห็นชัด
- issue_date และ transfer_datetime ให้ตอบเป็น dd/mm/yyyy หรือ dd/mm/yyyy HH:mm และใช้ปี พ.ศ.
- ถ้าวันที่เป็น ค.ศ. ให้แปลงเป็น พ.ศ.
- ถ้าปีเป็น 2 หลัก เช่น 63 ให้ถือว่าเป็น พ.ศ. 2563
- amount ให้ตอบเป็นตัวเลขเท่านั้น ไม่ต้องมี comma ไม่ต้องมีคำว่า บาท
- สำหรับสลิปโอนเงิน ให้ total_amount และ transfer_amount เป็นยอดเงินเดียวกันถ้าพบ
- payment_method สำหรับสลิปโอนเงินให้ตอบ "โอนเงิน"
- ถ้าไม่พบข้อมูลให้ใส่ค่าว่าง ""
- response ต้องเป็น valid JSON เท่านั้น
```

## Deploy step-by-step

### 1) สร้าง GitHub repo

```bash
git init
git add .
git commit -m "Initial thai receipt OCR Typhoon app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/thai-receipt-ocr-typhoon.git
git push -u origin main
```

### 2) Deploy บน Railway

1. Railway → New Project → Deploy from GitHub repo
2. เลือก repo `thai-receipt-ocr-typhoon`
3. ใส่ environment variables ตามหัวข้อ Railway
4. Deploy
5. เปิด generated domain แล้วทดสอบ `/health`

### 3) ตั้งค่า n8n

1. import ทั้ง 3 workflows
2. ตั้ง `TYPHOON_API_KEY`, `GOOGLE_SHEET_ID`, `GOOGLE_DRIVE_FOLDER_ID`
3. เลือก Google Drive/Sheets credentials ใน node ที่เกี่ยวข้อง
4. Activate workflow
5. copy Production webhook URL มาใส่ใน Railway

### 4) ทดสอบ

1. เปิดหน้า `/`
2. อัพโหลด JPG/PNG/PDF ใบเสร็จ ใบกำกับภาษี หรือสลิปโอนเงิน
3. ตรวจฟอร์ม OCR preview
4. กด “ยืนยันบันทึก”
5. เปิด Google Sheets ดู row ใหม่
6. เปิด `/dashboard.html` แล้วกด Refresh

## หมายเหตุสำคัญ

- Workflow OCR ใช้ HTTP Request ไป `https://api.opentyphoon.ai/v1/chat/completions` พร้อม model `typhoon-ocr`
- ถ้า n8n เวอร์ชันของคุณ map binary หลัง Google Drive upload ไม่เหมือนกัน ให้ต่อ node จาก Webhook ไป Code โดยตรง หรือเพิ่ม Merge เพื่อเก็บ binary file ก่อนอัพโหลด
- ถ้าต้องการแยกหมวดค่าใช้จ่ายอัตโนมัติ เพิ่ม field `expense_category` ใน prompt หรือทำ node Code/AI เพิ่มหลัง Parse OCR JSON


## รองรับสลิปโอนเงิน

เพิ่ม field สำหรับสลิปโอนเงินแล้ว ได้แก่ `bank_name`, `sender_name`, `sender_account`, `receiver_name`, `receiver_account`, `transfer_datetime`, `transaction_ref`, `transfer_amount` โดย `document_type` จะเป็น `transfer_slip` และ `payment_method` จะเป็น `โอนเงิน`
