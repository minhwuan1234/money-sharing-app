/**
 * utils.js — Hàm tiện ích dùng chung: tiền tệ, dấu tiếng Việt,
 * nội dung CK, VietQR, clipboard, localStorage, theme.
 */

/* ---------- Tiền tệ ---------- */

// 150000 -> "150.000đ"
function formatMoney(n) {
  const num = Math.round(Number(n) || 0);
  return num.toLocaleString("vi-VN") + "đ";
}

/* ---------- Tiếng Việt -> ASCII (cho nội dung CK) ---------- */

function removeDiacritics(str) {
  return String(str || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D");
}

/**
 * Sinh nội dung chuyển khoản chuẩn để Collect đối soát.
 * Vd: prefix "NHAU", date "2026-06-16", name "An Nguyễn" -> "NHAU0616 AN NGUYEN"
 */
function buildTransferContent(prefix, dateStr, name) {
  let ddmm = "";
  const d = new Date(dateStr);
  if (dateStr && !isNaN(d)) {
    ddmm = String(d.getDate()).padStart(2, "0") + String(d.getMonth() + 1).padStart(2, "0");
  }
  const p = removeDiacritics(prefix).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const nm = removeDiacritics(name).toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim();
  return [p + ddmm, nm].filter(Boolean).join(" ").trim();
}

/* ---------- VietQR ---------- */

/**
 * Sinh URL ảnh QR VietQR (không cần API key).
 * compact2 = mẫu có sẵn số tiền + nội dung + tên chủ TK.
 */
function buildVietQrUrl({ bankCode, accountNo, amount, content, accountName }) {
  if (!bankCode || !accountNo) return "";
  const base = `https://img.vietqr.io/image/${bankCode}-${encodeURIComponent(accountNo)}-compact2.png`;
  const q = new URLSearchParams();
  if (amount)      q.set("amount", Math.round(amount));
  if (content)     q.set("addInfo", content);
  if (accountName) q.set("accountName", accountName);
  return `${base}?${q.toString()}`;
}

/* ---------- Clipboard ---------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Fallback cho trình duyệt cũ / không cấp quyền clipboard
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) {}
    document.body.removeChild(ta);
    return ok;
  }
}

/* ---------- localStorage helpers ---------- */

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) { return fallback; }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

/* ---------- Settings (hồ sơ collect mặc định) ---------- */

function getSettings() {
  return lsGet(LS_KEYS.SETTINGS, {
    collector_name: "",
    bank_code: "",
    bank_account: "",
    bank_name: "",
    transfer_prefix: "",
    remind_template: DEFAULT_REMIND_TEMPLATE,
  });
}

function saveSettings(obj) {
  lsSet(LS_KEYS.SETTINGS, Object.assign(getSettings(), obj));
}

/* ---------- Lịch sử phiên (localStorage trên máy collect) ---------- */

function getSavedSessions() {
  return lsGet(LS_KEYS.SESSIONS, []);
}

function saveSessionRef(ref) {
  // ref = { session_id, manage_token, event_name, date, created_at }
  const list = getSavedSessions().filter(s => s.session_id !== ref.session_id);
  list.unshift(ref);
  lsSet(LS_KEYS.SESSIONS, list);
}

function removeSessionRef(sessionId) {
  lsSet(LS_KEYS.SESSIONS, getSavedSessions().filter(s => s.session_id !== sessionId));
}

/* ---------- Theme (dark mode) ---------- */

function applyTheme(theme) {
  const t = theme || lsGet(LS_KEYS.THEME, "light");
  document.documentElement.classList.toggle("dark", t === "dark");
  lsSet(LS_KEYS.THEME, t);
  return t;
}

function toggleTheme() {
  const next = (lsGet(LS_KEYS.THEME, "light") === "dark") ? "light" : "dark";
  return applyTheme(next);
}

/* ---------- URL params ---------- */

function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

/* ---------- HTML escape (chống vỡ layout khi tên có ký tự lạ) ---------- */

function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
