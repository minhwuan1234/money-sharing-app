/**
 * session.js — Logic trang thành viên: load phiên, render QR + STK,
 * tìm tên, tick "đã chuyển" / bỏ báo. KHÔNG có quyền xác nhận (confirmed).
 */

let SESSION = null;
let MEMBERS = [];

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.style.opacity = "1";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = "0"; }, 2000);
}

function showError(msg) {
  document.getElementById("loading").classList.add("hidden");
  document.getElementById("content").classList.add("hidden");
  document.getElementById("error").classList.remove("hidden");
  document.getElementById("errorMsg").textContent = msg;
}

async function load() {
  applyTheme(); // tôn trọng theme đã chọn (nếu mở chung máy)
  const id = getParam("id");
  if (!id) return showError("Link không hợp lệ (thiếu mã phiên).");

  const res = await apiGetSession(id);
  if (!res.ok) return showError(res.error || "Không tìm thấy phiên.");

  SESSION = res.session;
  MEMBERS = res.members || [];
  renderSession();
}

function renderSession() {
  document.getElementById("loading").classList.add("hidden");
  document.getElementById("content").classList.remove("hidden");

  document.getElementById("eventTitle").textContent = SESSION.event_name || "Thu tiền nhóm";
  document.getElementById("eventDate").textContent = SESSION.date || "";
  document.getElementById("amount").textContent = formatMoney(SESSION.amount_per_person);
  document.getElementById("adjNote").textContent = SESSION.adjustment_note
    ? "* " + SESSION.adjustment_note : "";

  document.getElementById("bankName").textContent = SESSION.bank_name || "";
  document.getElementById("bankAccount").textContent = SESSION.bank_account || "";
  document.getElementById("collector").textContent = SESSION.collector_name || "";

  // Nội dung CK chuẩn (dùng tên người thu làm gốc; mỗi TV sẽ ghi tên mình khi CK)
  const content = SESSION.event_name
    ? removeDiacritics(SESSION.event_name).toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim().slice(0, 20)
    : "THANH TOAN";
  document.getElementById("transferContent").textContent = content;

  // QR VietQR
  document.getElementById("qr").src = buildVietQrUrl({
    bankCode: SESSION.bank_code,
    accountNo: SESSION.bank_account,
    amount: SESSION.amount_per_person,
    content: content,
    accountName: SESSION.collector_name,
  });

  // Copy buttons
  document.getElementById("copyAcc").onclick = async () => { await copyText(SESSION.bank_account); toast("Đã copy số TK."); };
  document.getElementById("copyContent").onclick = async () => { await copyText(content); toast("Đã copy nội dung."); };

  // Search
  document.getElementById("search").oninput = (e) => renderMembers(e.target.value.trim().toLowerCase());
  renderMembers("");
}

function renderMembers(keyword) {
  const list = document.getElementById("memberList");
  const filtered = MEMBERS.filter(m =>
    !keyword ||
    removeDiacritics(m.name).toLowerCase().includes(removeDiacritics(keyword)) ||
    String(m.phone || "").includes(keyword)
  );

  if (filtered.length === 0) {
    list.innerHTML = `<p class="text-sm text-slate-400 text-center py-4">Không tìm thấy tên này.</p>`;
    return;
  }

  list.innerHTML = filtered.map(m => {
    const meta = STATUS_META[m.status] || STATUS_META.unpaid;
    const reported = m.status === STATUS.REPORTED || m.status === STATUS.CONFIRMED;
    const locked = m.status === STATUS.CONFIRMED; // đã được collect xác nhận -> TV không sửa
    return `
      <div class="flex items-center justify-between gap-2 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5">
        <div class="min-w-0">
          <p class="font-medium truncate">${esc(m.name)}</p>
          <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${meta.badge}">
            <span class="w-1.5 h-1.5 rounded-full ${meta.dot}"></span>${meta.label}
          </span>
        </div>
        <button data-id="${esc(m.member_id)}" data-reported="${reported}"
          class="btn-tick shrink-0 px-3 py-2 rounded-lg text-sm font-medium ${
            locked ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 cursor-default"
            : reported ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15"
            : "bg-indigo-600 text-white"}"
          ${locked ? "disabled" : ""}>
          ${locked ? "✓ Đã nhận" : reported ? "↩ Bỏ báo" : "Tôi đã chuyển"}
        </button>
      </div>`;
  }).join("");

  list.querySelectorAll(".btn-tick").forEach(btn => {
    btn.onclick = () => onTick(btn.dataset.id, btn.dataset.reported === "true");
  });
}

async function onTick(memberId, isReported) {
  const newStatus = isReported ? STATUS.UNPAID : STATUS.REPORTED;
  // Optimistic update
  const m = MEMBERS.find(x => x.member_id === memberId);
  if (!m) return;
  const prev = m.status;
  m.status = newStatus;
  renderMembers(document.getElementById("search").value.trim().toLowerCase());

  const res = await apiSetStatus(memberId, newStatus); // không gửi token -> chỉ tới reported/unpaid
  if (!res.ok) {
    m.status = prev; // rollback
    renderMembers(document.getElementById("search").value.trim().toLowerCase());
    return toast("Lỗi: " + res.error);
  }
  toast(newStatus === STATUS.REPORTED ? "Đã báo chuyển tiền! 🎉" : "Đã bỏ báo.");
}

document.addEventListener("DOMContentLoaded", load);
