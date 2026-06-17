/**
 * config.js — Cấu hình chung + hằng số dùng toàn app.
 */

// ⚠️ DÁN URL WEB APP TỪ APPS SCRIPT VÀO ĐÂY sau khi deploy Code.gs.
// Vd: "https://script.google.com/macros/s/AKfyc..../exec"
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz6h_t9bo1hAJ_bwdnnR2KbuMS-HtlArxH_Nh5G5XIf-OSARpwAxyoJE76Wb3yjiAsx/exec";

// Số trạng thái của thành viên (khớp với Code.gs)
const STATUS = { UNPAID: "unpaid", REPORTED: "reported", CONFIRMED: "confirmed" };

// Nhãn + màu cho từng trạng thái (Tailwind class)
const STATUS_META = {
  unpaid:    { label: "Chưa trả",   dot: "bg-rose-500",    badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  reported:  { label: "Đã báo",     dot: "bg-amber-500",   badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  confirmed: { label: "Đã nhận",    dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
};

// Tốc độ polling dashboard (ms) — fix cứng ở Phase 1
const POLL_INTERVAL = 5000;

// Key localStorage
const LS_KEYS = {
  SETTINGS: "ttn_settings",   // hồ sơ collect mặc định + prefix + template
  SESSIONS: "ttn_sessions",   // lịch sử phiên đã tạo trên máy này
  THEME:    "ttn_theme",      // "light" | "dark"
};

// Template nhắc nợ mặc định (có biến {ten}/{so_tien}/{su_kien}/{stk})
const DEFAULT_REMIND_TEMPLATE =
`💰 {su_kien} — Còn {so_nguoi} bạn chưa chuyển:
{danh_sach}
👉 STK: {stk}`;

// Danh sách ngân hàng VietQR phổ biến (code = BIN dùng cho img.vietqr.io)
const BANKS = [
  { code: "970436", name: "Vietcombank (VCB)" },
  { code: "970415", name: "VietinBank (CTG)" },
  { code: "970418", name: "BIDV" },
  { code: "970405", name: "Agribank" },
  { code: "970407", name: "Techcombank (TCB)" },
  { code: "970422", name: "MB Bank (MB)" },
  { code: "970416", name: "ACB" },
  { code: "970432", name: "VPBank" },
  { code: "970423", name: "TPBank" },
  { code: "970403", name: "Sacombank (STB)" },
  { code: "970437", name: "HDBank" },
  { code: "970441", name: "VIB" },
  { code: "970443", name: "SHB" },
  { code: "970431", name: "Eximbank (EIB)" },
  { code: "970448", name: "OCB" },
  { code: "970426", name: "MSB" },
  { code: "970454", name: "VietCapital Bank (BVB)" },
  { code: "970409", name: "BacABank" },
  { code: "970412", name: "PVcomBank" },
  { code: "970438", name: "BaoVietBank" },
  { code: "546034", name: "Cake by VPBank" },
  { code: "963388", name: "Timo" },
  { code: "970400", name: "SaigonBank (SGB)" },
  { code: "970429", name: "SCB" },
];
