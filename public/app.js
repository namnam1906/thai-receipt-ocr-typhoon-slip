let selectedFile = null;
let previewData = null;

const $ = (selector) => document.querySelector(selector);

const uploadForm = $("#uploadForm");
const fileInput = $("#fileInput");
const dropZone = $("#dropZone");
const fileNameEl = $("#fileName");
const uploadedByInput = $("#uploadedBy");
const uploadStatus = $("#uploadStatus");

const previewSection = $("#previewSection");
const previewForm = $("#previewForm");
const saveStatus = $("#saveStatus");

const previewFields = [
  "document_type",
  "expense_category",
  "uploaded_by",

  "issuer_name",
  "issuer_tax_id",
  "receipt_no",
  "issue_date",
  "issue_time",

  "customer_name",
  "customer_tax_id",

  "subtotal_amount",
  "vat_amount",
  "total_amount",
  "payment_method",

  "bank_name",
  "sender_name",
  "sender_account",
  "receiver_name",
  "receiver_account",
  "transfer_datetime",
  "transaction_ref",
  "transfer_amount",

  "file_url",
  "ocr_text",
  "original_filename",
  "safe_filename",
  "status",
];

function showStatus(el, message, type = "") {
  if (!el) return;

  el.textContent = message || "";
  el.className = "status";

  if (type) {
    el.classList.add(type);
  }
}

function getUploadedBy() {
  return uploadedByInput?.value?.trim() || "web";
}

function guessDocumentType(fileName = "") {
  const name = fileName.toLowerCase();

  if (
    name.includes("slip") ||
    name.includes("transfer") ||
    name.includes("โอน") ||
    name.includes("สลิป")
  ) {
    return "transfer_slip";
  }

  if (
    name.includes("tax") ||
    name.includes("invoice") ||
    name.includes("กำกับ")
  ) {
    return "tax_invoice";
  }

  return "receipt";
}

function formatFileSize(bytes) {
  if (!bytes) return "";

  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(2)} MB`;
}

function handleFile(file) {
  if (!file) return;

  selectedFile = file;

  if (fileNameEl) {
    fileNameEl.textContent = `${file.name} (${formatFileSize(file.size)})`;
  }

  showStatus(uploadStatus, "");
}

function createField(name, value = "") {
  const wrapper = document.createElement("div");
  wrapper.className = "field";

  const label = document.createElement("label");
  label.textContent = name;
  label.setAttribute("for", `field_${name}`);

  let input;

  if (name === "ocr_text") {
    input = document.createElement("textarea");
    input.rows = 5;
  } else {
    input = document.createElement("input");
    input.type = "text";
  }

  input.id = `field_${name}`;
  input.name = name;
  input.value = value ?? "";

  wrapper.appendChild(label);
  wrapper.appendChild(input);

  return wrapper;
}

function renderPreviewForm(data) {
  if (!previewForm) return;

  previewForm.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "preview-grid";

  previewFields.forEach((field) => {
    grid.appendChild(createField(field, data?.[field] ?? ""));
  });

  const actions = document.createElement("div");
  actions.className = "form-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "btn primary";
  saveButton.textContent = "ยืนยันบันทึก";

  actions.appendChild(saveButton);

  previewForm.appendChild(grid);
  previewForm.appendChild(actions);

  previewForm.onsubmit = onConfirmSave;

  if (previewSection) {
    previewSection.classList.remove("hidden");
  }
}

async function onUpload(event) {
  event.preventDefault();

  try {
    if (!selectedFile) {
      showStatus(uploadStatus, "กรุณาเลือกไฟล์ก่อน", "error");
      return;
    }

    showStatus(uploadStatus, "กำลังอ่านข้อความด้วย OCR...", "loading");

    const documentType = guessDocumentType(selectedFile.name);

    const formData = new FormData();

    // สำคัญมาก: ต้องชื่อ file ให้ตรงกับ backend upload.single("file")
    formData.append("file", selectedFile);

    formData.append("document_type", documentType);
    formData.append("expense_category", "");
    formData.append("uploaded_by", getUploadedBy());

    const response = await fetch("/api/ocr-preview", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : result.message || "OCR failed"
      );
    }

    previewData = {
      ...result.data,
      document_type: result.data?.document_type || documentType,
      expense_category: result.data?.expense_category || "",
      uploaded_by: result.data?.uploaded_by || getUploadedBy(),
      status: result.data?.status || "preview",
    };

    renderPreviewForm(previewData);

    showStatus(
      uploadStatus,
      "อ่านข้อความสำเร็จ กรุณาตรวจสอบข้อมูลด้านขวาก่อนบันทึก",
      "success"
    );
  } catch (error) {
    console.error(error);
    showStatus(uploadStatus, `ผิดพลาด: ${error.message}`, "error");
  }
}

async function onConfirmSave(event) {
  event.preventDefault();

  try {
    showStatus(saveStatus, "กำลังบันทึกลง Google Sheets...", "loading");

    const formData = new FormData(previewForm);
    const payload = {};

    for (const [key, value] of formData.entries()) {
      payload[key] = value;
    }

    payload.uploaded_by = payload.uploaded_by || getUploadedBy();
    payload.status = "confirmed";

    const response = await fetch("/api/confirm-save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : result.message || "Save failed"
      );
    }

    showStatus(saveStatus, "บันทึกสำเร็จ", "success");
  } catch (error) {
    console.error(error);
    showStatus(saveStatus, `ผิดพลาด: ${error.message}`, "error");
  }
}

function initFilePicker() {
  if (!fileInput) return;

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    handleFile(file);
  });

  if (dropZone) {
    dropZone.addEventListener("click", () => {
      fileInput.click();
    });

    dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("dragover");
    });

    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragover");

      const file = event.dataTransfer.files?.[0];

      if (file) {
        selectedFile = file;

        try {
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          fileInput.files = dataTransfer.files;
        } catch (e) {}

        handleFile(file);
      }
    });
  }
}

function init() {
  initFilePicker();

  if (uploadForm) {
    uploadForm.addEventListener("submit", onUpload);
  }
}

document.addEventListener("DOMContentLoaded", init);
