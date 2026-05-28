const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const FormData = require("form-data");
const axios = require("axios");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

const N8N_OCR_PREVIEW_URL = process.env.N8N_OCR_PREVIEW_URL;
const N8N_CONFIRM_SAVE_URL = process.env.N8N_CONFIRM_SAVE_URL;
const N8N_TRANSACTIONS_URL = process.env.N8N_TRANSACTIONS_URL;

const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 10);

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(
        new Error("รองรับเฉพาะไฟล์ JPG, PNG, WEBP หรือ PDF เท่านั้น")
      );
    }

    cb(null, true);
  },
});

function getFileExtension(file) {
  const extFromName = path.extname(file.originalname || "").toLowerCase();

  if (extFromName) return extFromName;

  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
  };

  return map[file.mimetype] || "";
}

function formatBangkokTimestampForFile() {
  const now = new Date();

  const bangkok = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" })
  );

  const yyyy = bangkok.getFullYear();
  const mm = String(bangkok.getMonth() + 1).padStart(2, "0");
  const dd = String(bangkok.getDate()).padStart(2, "0");
  const hh = String(bangkok.getHours()).padStart(2, "0");
  const mi = String(bangkok.getMinutes()).padStart(2, "0");
  const ss = String(bangkok.getSeconds()).padStart(2, "0");

  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

function getSafeUploadFilename(file, documentType) {
  const ext = getFileExtension(file);

  const typeMap = {
    receipt: "receipt",
    tax_invoice: "tax_invoice",
    transfer_slip: "slip",
  };

  const prefix = typeMap[documentType] || "document";
  const timestamp = formatBangkokTimestampForFile();
  const random = Math.random().toString(36).slice(2, 8);

  return `${prefix}_${timestamp}_${random}${ext}`;
}

function normalizeAmount(value) {
  if (value === null || value === undefined) return "";

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();

  if (!cleaned) return "";

  const number = Number(cleaned);

  return Number.isFinite(number) ? number : "";
}

function normalizeThaiDate(value) {
  if (!value) return "";

  let text = String(value).trim();

  const thaiMonths = {
    "ม.ค.": "01",
    "มกราคม": "01",
    "ก.พ.": "02",
    "กุมภาพันธ์": "02",
    "มี.ค.": "03",
    "มีนาคม": "03",
    "เม.ย.": "04",
    "เมษายน": "04",
    "พ.ค.": "05",
    "พฤษภาคม": "05",
    "มิ.ย.": "06",
    "มิถุนายน": "06",
    "ก.ค.": "07",
    "กรกฎาคม": "07",
    "ส.ค.": "08",
    "สิงหาคม": "08",
    "ก.ย.": "09",
    "กันยายน": "09",
    "ต.ค.": "10",
    "ตุลาคม": "10",
    "พ.ย.": "11",
    "พฤศจิกายน": "11",
    "ธ.ค.": "12",
    "ธันวาคม": "12",
  };

  for (const [th, month] of Object.entries(thaiMonths)) {
    if (text.includes(th)) {
      text = text.replace(th, month);
      break;
    }
  }

  text = text.replace(/-/g, "/").replace(/\s+/g, "/");

  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);

  if (!match) return value;

  let day = Number(match[1]);
  let month = Number(match[2]);
  let year = Number(match[3]);

  if (!day || !month || !year) return value;

  if (year < 100) {
    year = 2500 + year;
  } else if (year < 2400) {
    year = year + 543;
  }

  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");

  return `${dd}/${mm}/${year}`;
}

function normalizePayload(data = {}) {
  return {
    ...data,

    issue_date: normalizeThaiDate(data.issue_date),
    transfer_datetime: data.transfer_datetime || "",

    subtotal_amount: normalizeAmount(data.subtotal_amount),
    vat_amount: normalizeAmount(data.vat_amount),
    total_amount: normalizeAmount(data.total_amount),
    transfer_amount: normalizeAmount(data.transfer_amount),
  };
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "thai-receipt-ocr-typhoon",
  });
});

app.post("/api/ocr-preview", upload.single("file"), async (req, res) => {
  try {
    if (!N8N_OCR_PREVIEW_URL) {
      return res.status(500).json({
        ok: false,
        message: "Missing N8N_OCR_PREVIEW_URL",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: "กรุณาอัพโหลดไฟล์",
      });
    }

    const documentType = req.body.document_type || "receipt";
    const expenseCategory = req.body.expense_category || "";
    const uploadedBy = req.body.uploaded_by || "";

    const originalFilename = req.file.originalname || "";
    const safeFilename = getSafeUploadFilename(req.file, documentType);

    const form = new FormData();

    form.append("file", req.file.buffer, {
      filename: safeFilename,
      contentType: req.file.mimetype,
    });

    form.append("original_filename", originalFilename);
    form.append("safe_filename", safeFilename);
    form.append("mime_type", req.file.mimetype);
    form.append("document_type", documentType);
    form.append("expense_category", expenseCategory);
    form.append("uploaded_by", uploadedBy);

    const response = await axios.post(N8N_OCR_PREVIEW_URL, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 120000,
    });

    const result = response.data || {};
    const normalized = normalizePayload(result.data || result);

    res.json({
      ok: true,
      data: {
        ...normalized,
        document_type: normalized.document_type || documentType,
        expense_category: normalized.expense_category || expenseCategory,
        uploaded_by: normalized.uploaded_by || uploadedBy,
        original_filename: normalized.original_filename || originalFilename,
        safe_filename: normalized.safe_filename || safeFilename,
      },
    });
  } catch (error) {
    console.error("OCR Preview Error:", error.response?.data || error.message);

    res.status(500).json({
      ok: false,
      message: "OCR preview failed",
      error: error.response?.data || error.message,
    });
  }
});

app.post("/api/confirm-save", async (req, res) => {
  try {
    if (!N8N_CONFIRM_SAVE_URL) {
      return res.status(500).json({
        ok: false,
        message: "Missing N8N_CONFIRM_SAVE_URL",
      });
    }

    const normalized = normalizePayload(req.body);

    const response = await axios.post(N8N_CONFIRM_SAVE_URL, normalized, {
      timeout: 60000,
    });

    res.json({
      ok: true,
      data: response.data,
    });
  } catch (error) {
    console.error("Confirm Save Error:", error.response?.data || error.message);

    res.status(500).json({
      ok: false,
      message: "Confirm save failed",
      error: error.response?.data || error.message,
    });
  }
});

app.get("/api/transactions", async (req, res) => {
  try {
    if (!N8N_TRANSACTIONS_URL) {
      return res.status(500).json({
        ok: false,
        message: "Missing N8N_TRANSACTIONS_URL",
      });
    }

    const response = await axios.get(N8N_TRANSACTIONS_URL, {
      timeout: 60000,
    });

    res.json({
      ok: true,
      data: response.data?.data || response.data || [],
    });
  } catch (error) {
    console.error("Transactions Error:", error.response?.data || error.message);

    res.status(500).json({
      ok: false,
      message: "Load transactions failed",
      error: error.response?.data || error.message,
    });
  }
});

app.use((error, req, res, next) => {
  console.error("App Error:", error);

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      ok: false,
      message: error.message,
    });
  }

  res.status(500).json({
    ok: false,
    message: error.message || "Internal Server Error",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
