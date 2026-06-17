/**
 * ============================================================
 *  Code.gs — Backend Apps Script cho App Thu Tiền Nhóm
 * ============================================================
 *
 *  CÁCH DEPLOY (làm 1 lần):
 *  1. Tạo 1 Google Sheet trống → Extensions > Apps Script → dán file này vào.
 *  2. Deploy > New deployment > chọn type "Web app".
 *       - Execute as:        Me
 *       - Who has access:    Anyone
 *  3. Copy "Web app URL" → dán vào js/config.js  (biến APPS_SCRIPT_URL).
 *  4. Mỗi lần sửa Code.gs phải Deploy > Manage deployments > Edit > New version.
 *
 *  GHI CHÚ CORS:
 *  - GitHub Pages gọi Apps Script bị chặn nếu request có "preflight".
 *  - Vì vậy phía client gọi bằng POST với Content-Type: text/plain
 *    (đây là "simple request" → không preflight). Body là JSON string,
 *    ta tự parse trong doPost qua e.postData.contents.
 *  - doGet để sẵn cho việc test nhanh trên trình duyệt (?action=getSession&id=...).
 * ============================================================
 */

// Để trống "" vì script gắn liền với Sheet (container-bound) -> tự lấy active spreadsheet.
// Nếu muốn trỏ tới 1 Sheet khác, dán ID của sheet đó vào đây.
const SHEET_ID = "";

const SESSIONS_SHEET = "Sessions";
const MEMBERS_SHEET  = "Members";

const SESSIONS_HEADERS = [
  "session_id", "event_name", "date", "total_bill", "adjustment",
  "adjustment_note", "amount_per_person", "collector_name", "bank_code",
  "bank_account", "bank_name", "manage_token", "created_at"
];

const MEMBERS_HEADERS = [
  "member_id", "session_id", "name", "phone", "amount",
  "status", "reported_at", "confirmed_at"
];

// Trạng thái hợp lệ của 1 thành viên
const STATUS = { UNPAID: "unpaid", REPORTED: "reported", CONFIRMED: "confirmed" };

/* ============================================================
 *  ENTRY POINTS
 * ============================================================ */

function doGet(e) {
  // Cho phép test nhanh bằng URL. Vd: ?action=getSession&id=xxx
  const params = (e && e.parameter) || {};
  if (!params.action) {
    return jsonOut_({ ok: true, message: "Thu Tien Nhom API is running." });
  }
  return handleRequest_(params);
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return jsonOut_({ ok: false, error: "Body không phải JSON hợp lệ." });
  }
  return handleRequest_(body);
}

/**
 * Router chung cho cả GET lẫn POST.
 * Toàn bộ ghi/đọc Sheets bọc trong LockService để tránh 2 người tick cùng lúc.
 */
function handleRequest_(req) {
  const action = req.action;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // chờ tối đa 15s nếu đang có request khác
  } catch (err) {
    return jsonOut_({ ok: false, error: "Hệ thống đang bận, thử lại sau." });
  }

  try {
    switch (action) {
      case "createSession": return jsonOut_(createSession_(req));
      case "getSession":    return jsonOut_(getSession_(req.id || req.session_id));
      case "setStatus":     return jsonOut_(setStatus_(req));
      default:
        return jsonOut_({ ok: false, error: "Action không hợp lệ: " + action });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
 *  ACTIONS
 * ============================================================ */

/**
 * Tạo phiên mới.
 * Input: { event_name, date, total_bill, adjustment, adjustment_note,
 *          collector_name, bank_code, bank_account, bank_name,
 *          members: [{ name, phone }] }
 * Output: { ok, session_id, manage_token, amount_per_person }
 */
function createSession_(req) {
  const members = Array.isArray(req.members) ? req.members.filter(m => m && String(m.name).trim()) : [];
  if (members.length === 0) {
    return { ok: false, error: "Phải có ít nhất 1 thành viên." };
  }

  const totalBill  = Number(req.total_bill) || 0;
  const adjustment = Number(req.adjustment) || 0;
  const grandTotal = totalBill + adjustment;
  if (grandTotal <= 0) {
    return { ok: false, error: "Tổng tiền phải lớn hơn 0." };
  }

  // Chia đều, làm tròn LÊN tới đồng để tổng thu không bị thiếu so với bill.
  const amountPerPerson = Math.ceil(grandTotal / members.length);

  const sessionId   = genId_("s");
  const manageToken = genToken_();
  const now         = new Date();

  // Ghi Sessions
  const sessionsSheet = getSheet_(SESSIONS_SHEET, SESSIONS_HEADERS);
  appendRow_(sessionsSheet, SESSIONS_HEADERS, {
    session_id:        sessionId,
    event_name:        String(req.event_name || "").trim(),
    date:              String(req.date || "").trim(),
    total_bill:        totalBill,
    adjustment:        adjustment,
    adjustment_note:   String(req.adjustment_note || "").trim(),
    amount_per_person: amountPerPerson,
    collector_name:    String(req.collector_name || "").trim(),
    bank_code:         String(req.bank_code || "").trim(),
    bank_account:      String(req.bank_account || "").trim(),
    bank_name:         String(req.bank_name || "").trim(),
    manage_token:      manageToken,
    created_at:        now.toISOString()
  });

  // Ghi Members (mỗi người 1 member_id riêng -> tên trùng vẫn phân biệt được)
  const membersSheet = getSheet_(MEMBERS_SHEET, MEMBERS_HEADERS);
  members.forEach(m => {
    appendRow_(membersSheet, MEMBERS_HEADERS, {
      member_id:    genId_("m"),
      session_id:   sessionId,
      name:         String(m.name).trim(),
      phone:        String(m.phone || "").trim(),
      amount:       amountPerPerson,
      status:       STATUS.UNPAID,
      reported_at:  "",
      confirmed_at: ""
    });
  });

  return { ok: true, session_id: sessionId, manage_token: manageToken, amount_per_person: amountPerPerson };
}

/**
 * Lấy toàn bộ thông tin 1 phiên + danh sách thành viên.
 * Lưu ý: KHÔNG trả manage_token ra ngoài để tránh lộ qua trang thành viên.
 * Output: { ok, session: {...}, members: [...] }
 */
function getSession_(sessionId) {
  if (!sessionId) return { ok: false, error: "Thiếu session_id." };

  const sessions = readAll_(getSheet_(SESSIONS_SHEET, SESSIONS_HEADERS));
  const session  = sessions.find(s => s.session_id === sessionId);
  if (!session) return { ok: false, error: "Không tìm thấy phiên." };

  delete session.manage_token; // không bao giờ lộ token ra client

  const members = readAll_(getSheet_(MEMBERS_SHEET, MEMBERS_HEADERS))
    .filter(m => m.session_id === sessionId);

  return { ok: true, session: session, members: members };
}

/**
 * Đổi trạng thái 1 thành viên.
 * Input: { member_id, status, manage_token? }
 *  - status = "reported"  : do TV tự bấm (không cần token)
 *  - status = "unpaid"    : do TV bỏ báo, hoặc Collect revert (không cần token nếu về từ reported)
 *  - status = "confirmed" : CHỈ Collect, bắt buộc đúng manage_token
 * Output: { ok, member: {...} }
 */
function setStatus_(req) {
  const memberId  = req.member_id;
  const newStatus = req.status;
  if (!memberId) return { ok: false, error: "Thiếu member_id." };
  if (![STATUS.UNPAID, STATUS.REPORTED, STATUS.CONFIRMED].includes(newStatus)) {
    return { ok: false, error: "Trạng thái không hợp lệ." };
  }

  const sheet = getSheet_(MEMBERS_SHEET, MEMBERS_HEADERS);
  const found = findRow_(sheet, MEMBERS_HEADERS, "member_id", memberId);
  if (!found) return { ok: false, error: "Không tìm thấy thành viên." };

  const member = found.obj;

  // Chuyển sang/ra khỏi "confirmed" -> phải là Collect (đúng token).
  const touchesConfirmed = newStatus === STATUS.CONFIRMED || member.status === STATUS.CONFIRMED;
  if (touchesConfirmed) {
    const session = readAll_(getSheet_(SESSIONS_SHEET, SESSIONS_HEADERS))
      .find(s => s.session_id === member.session_id);
    if (!session) return { ok: false, error: "Không tìm thấy phiên của thành viên." };
    if (!req.manage_token || req.manage_token !== session.manage_token) {
      return { ok: false, error: "Không có quyền xác nhận (sai mã quản lý)." };
    }
  }

  // Cập nhật mốc thời gian theo trạng thái mới.
  const nowIso = new Date().toISOString();
  member.status = newStatus;
  if (newStatus === STATUS.REPORTED)  { member.reported_at = nowIso; member.confirmed_at = ""; }
  if (newStatus === STATUS.CONFIRMED) { member.confirmed_at = nowIso; if (!member.reported_at) member.reported_at = nowIso; }
  if (newStatus === STATUS.UNPAID)    { member.reported_at = ""; member.confirmed_at = ""; }

  writeRow_(sheet, MEMBERS_HEADERS, found.rowIndex, member);
  return { ok: true, member: member };
}

/* ============================================================
 *  SHEET HELPERS
 * ============================================================ */

function getSpreadsheet_() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

// Lấy sheet theo tên; nếu chưa có thì tạo mới + ghi header.
function getSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Đọc toàn bộ sheet (trừ header) thành mảng object theo headers.
function readAll_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const obj = {};
    headers.forEach((h, c) => { obj[h] = values[r][c]; });
    if (String(obj[headers[0]]).trim() === "") continue; // bỏ dòng trống
    rows.push(obj);
  }
  return rows;
}

// Tìm 1 dòng theo cột = giá trị. Trả { rowIndex (1-based trên sheet), obj }.
function findRow_(sheet, headers, key, value) {
  const values = sheet.getDataRange().getValues();
  const keyCol = headers.indexOf(key);
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][keyCol]) === String(value)) {
      const obj = {};
      headers.forEach((h, c) => { obj[h] = values[r][c]; });
      return { rowIndex: r + 1, obj: obj };
    }
  }
  return null;
}

// Thêm 1 dòng mới từ object (theo đúng thứ tự headers).
function appendRow_(sheet, headers, obj) {
  const row = headers.map(h => (obj[h] !== undefined ? obj[h] : ""));
  sheet.appendRow(row);
}

// Ghi đè 1 dòng đã có (rowIndex 1-based) từ object.
function writeRow_(sheet, headers, rowIndex, obj) {
  const row = headers.map(h => (obj[h] !== undefined ? obj[h] : ""));
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
}

/* ============================================================
 *  UTILS
 * ============================================================ */

// ID ngắn, đủ chống trùng cho quy mô nhóm bạn bè.
function genId_(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Token quản lý (khó đoán) cho link dashboard.
function genToken_() {
  return Utilities.getUuid().replace(/-/g, "").slice(0, 16);
}

// Trả JSON chuẩn cho client.
function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
