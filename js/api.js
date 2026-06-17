/**
 * api.js — Wrapper gọi Apps Script.
 *
 * Mọi request đều POST với Content-Type: text/plain để tránh CORS preflight
 * (GitHub Pages -> Apps Script). Body là JSON string, Code.gs tự parse.
 */

async function callApi(action, payload = {}) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf("DÁN_") === 0) {
    return { ok: false, error: "Chưa cấu hình APPS_SCRIPT_URL trong js/config.js." };
  }
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      // KHÔNG dùng application/json -> giữ "simple request" -> không preflight
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action }, payload)),
      redirect: "follow", // Apps Script trả 302 -> phải follow
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return { ok: false, error: "Lỗi mạng: " + (err && err.message ? err.message : err) };
  }
}

/* ---------- Các API cụ thể ---------- */

// Tạo phiên mới -> { ok, session_id, manage_token, amount_per_person }
function apiCreateSession(data) {
  return callApi("createSession", data);
}

// Lấy phiên + danh sách thành viên -> { ok, session, members }
function apiGetSession(sessionId) {
  return callApi("getSession", { id: sessionId });
}

// Đổi trạng thái 1 thành viên -> { ok, member }
//  - TV báo đã chuyển:   setMemberStatus(id, "reported")
//  - TV bỏ báo:          setMemberStatus(id, "unpaid")
//  - Collect xác nhận:   setMemberStatus(id, "confirmed", token)
function apiSetStatus(memberId, status, manageToken) {
  const payload = { member_id: memberId, status };
  if (manageToken) payload.manage_token = manageToken;
  return callApi("setStatus", payload);
}
