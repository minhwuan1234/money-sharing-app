/**
 * index.js — Logic trang Collect: tạo phiên, preview chia tiền,
 * lịch sử phiên, cài đặt mặc định, theme.
 */

/* ---------- Toast ---------- */
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = "0"; }, 2000);
}

/* ---------- Khởi tạo dropdown ngân hàng ---------- */
function fillBankOptions(selectEl, selectedCode) {
  selectEl.innerHTML = '<option value="">-- Chọn ngân hàng --</option>' +
    BANKS.map(b => `<option value="${b.code}" ${b.code === selectedCode ? "selected" : ""}>${esc(b.name)}</option>`).join("");
}

/* ---------- Thành viên (form) ---------- */
function addMemberRow(name = "", phone = "") {
  const row = document.createElement("div");
  row.className = "flex gap-2 member-row";
  row.innerHTML = `
    <input class="inp m-name" placeholder="Tên thành viên" value="${esc(name)}" />
    <input class="inp m-phone w-36" placeholder="SĐT (tùy chọn)" inputmode="numeric" value="${esc(phone)}" />
    <button class="px-3 rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-500/15 shrink-0 m-del">✕</button>`;
  row.querySelector(".m-del").onclick = () => { row.remove(); updatePreview(); };
  row.querySelector(".m-name").oninput = updatePreview;
  document.getElementById("memberList").appendChild(row);
  updatePreview();
}

function readMembers() {
  return Array.from(document.querySelectorAll(".member-row")).map(r => ({
    name: r.querySelector(".m-name").value.trim(),
    phone: r.querySelector(".m-phone").value.trim(),
  })).filter(m => m.name);
}

/* ---------- Preview chia tiền ---------- */
function updatePreview() {
  const bill = Number(document.getElementById("totalBill").value) || 0;
  const adj = Number(document.getElementById("adjustment").value) || 0;
  const members = readMembers();
  const box = document.getElementById("splitPreview");
  if (members.length === 0 || (bill + adj) <= 0) { box.classList.add("hidden"); return; }
  const total = bill + adj;
  const per = Math.ceil(total / members.length);
  box.classList.remove("hidden");
  box.innerHTML = `Tổng chia: <b>${formatMoney(total)}</b> ÷ ${members.length} người =
    <b class="text-indigo-600 dark:text-indigo-400">${formatMoney(per)}</b>/người
    <span class="text-slate-400">(đã làm tròn lên)</span>`;
}

/* ---------- Tạo phiên ---------- */
async function createSession() {
  const eventName = document.getElementById("eventName").value.trim();
  const totalBill = Number(document.getElementById("totalBill").value) || 0;
  const collectorName = document.getElementById("collectorName").value.trim();
  const bankAccount = document.getElementById("bankAccount").value.trim();
  const bankCode = document.getElementById("bankCode").value;
  const members = readMembers();

  // Validate
  if (!eventName) return toast("Nhập tên sự kiện.");
  if (totalBill <= 0) return toast("Tổng bill phải lớn hơn 0.");
  if (!collectorName || !bankAccount || !bankCode) return toast("Điền đủ thông tin nhận tiền.");
  if (members.length === 0) return toast("Thêm ít nhất 1 thành viên.");

  const bankName = (BANKS.find(b => b.code === bankCode) || {}).name || "";
  const btn = document.getElementById("btnCreate");
  btn.disabled = true; btn.textContent = "Đang tạo...";

  const res = await apiCreateSession({
    event_name: eventName,
    date: document.getElementById("eventDate").value,
    total_bill: totalBill,
    adjustment: Number(document.getElementById("adjustment").value) || 0,
    adjustment_note: document.getElementById("adjustmentNote").value.trim(),
    collector_name: collectorName,
    bank_code: bankCode,
    bank_account: bankAccount,
    bank_name: bankName,
    members,
  });

  btn.disabled = false; btn.textContent = "Tạo phiên & sinh link";

  if (!res.ok) return toast("Lỗi: " + res.error);

  // Lưu ref phiên vào localStorage
  saveSessionRef({
    session_id: res.session_id,
    manage_token: res.manage_token,
    event_name: eventName,
    date: document.getElementById("eventDate").value,
    created_at: new Date().toISOString(),
  });

  showResult(res.session_id, res.manage_token);
  renderHistory();
}

/* ---------- Modal kết quả ---------- */
function buildShareUrl(id) {
  return location.origin + location.pathname.replace(/index\.html$/, "") + "session.html?id=" + id;
}
function buildManageUrl(id, token) {
  return location.origin + location.pathname.replace(/index\.html$/, "") + "manage.html?id=" + id + "&t=" + token;
}

function showResult(id, token) {
  const share = buildShareUrl(id);
  const manage = buildManageUrl(id, token);
  document.getElementById("shareLink").value = share;
  document.getElementById("manageLink").value = manage;
  document.getElementById("goManage").href = manage;
  document.getElementById("btnCopyShare").onclick = async () => { await copyText(share); toast("Đã copy link chia sẻ."); };
  document.getElementById("btnCopyManage").onclick = async () => { await copyText(manage); toast("Đã copy link quản lý."); };
  openModal("resultModal");
}

/* ---------- Lịch sử ---------- */
function renderHistory() {
  const list = getSavedSessions();
  const el = document.getElementById("historyList");
  if (list.length === 0) {
    el.innerHTML = `<p class="text-sm text-slate-400">Chưa có phiên nào.</p>`;
    return;
  }
  el.innerHTML = list.map(s => `
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between">
      <div>
        <p class="font-medium">${esc(s.event_name || "(không tên)")}</p>
        <p class="text-xs text-slate-400">${esc(s.date || "")}</p>
      </div>
      <div class="flex gap-2">
        <a href="${buildManageUrl(s.session_id, s.manage_token)}" class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm">Quản lý</a>
        <button data-id="${esc(s.session_id)}" class="del-hist px-2 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-sm">🗑</button>
      </div>
    </div>`).join("");
  el.querySelectorAll(".del-hist").forEach(b => {
    b.onclick = () => {
      if (confirm("Xóa phiên này khỏi lịch sử trên máy? (Dữ liệu trên Sheets vẫn còn)")) {
        removeSessionRef(b.dataset.id); renderHistory();
      }
    };
  });
}

/* ---------- Settings ---------- */
function openSettings() {
  const s = getSettings();
  document.getElementById("setCollector").value = s.collector_name || "";
  document.getElementById("setAccount").value = s.bank_account || "";
  fillBankOptions(document.getElementById("setBank"), s.bank_code);
  document.getElementById("setPrefix").value = s.transfer_prefix || "";
  document.getElementById("setTemplate").value = s.remind_template || DEFAULT_REMIND_TEMPLATE;
  openModal("settingsModal");
}
function saveSettingsFromForm() {
  const bankCode = document.getElementById("setBank").value;
  saveSettings({
    collector_name: document.getElementById("setCollector").value.trim(),
    bank_account: document.getElementById("setAccount").value.trim(),
    bank_code: bankCode,
    bank_name: (BANKS.find(b => b.code === bankCode) || {}).name || "",
    transfer_prefix: document.getElementById("setPrefix").value.trim(),
    remind_template: document.getElementById("setTemplate").value,
  });
  closeModal("settingsModal");
  applyDefaultsToForm();
  toast("Đã lưu cài đặt.");
}

// Đổ settings mặc định vào form tạo phiên (nếu các ô đang trống)
function applyDefaultsToForm() {
  const s = getSettings();
  if (s.collector_name && !document.getElementById("collectorName").value)
    document.getElementById("collectorName").value = s.collector_name;
  if (s.bank_account && !document.getElementById("bankAccount").value)
    document.getElementById("bankAccount").value = s.bank_account;
  if (s.bank_code && !document.getElementById("bankCode").value)
    document.getElementById("bankCode").value = s.bank_code;
}

/* ---------- Modal helpers ---------- */
function openModal(id) { const m = document.getElementById(id); m.classList.remove("hidden"); m.classList.add("flex"); }
function closeModal(id) { const m = document.getElementById(id); m.classList.add("hidden"); m.classList.remove("flex"); }

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  fillBankOptions(document.getElementById("bankCode"));
  document.getElementById("eventDate").valueAsDate = new Date();

  // Vài dòng thành viên trống cho sẵn
  addMemberRow(); addMemberRow(); addMemberRow();
  applyDefaultsToForm();
  renderHistory();

  // Events
  document.getElementById("btnAddMember").onclick = () => addMemberRow();
  document.getElementById("btnCreate").onclick = createSession;
  document.getElementById("totalBill").oninput = updatePreview;
  document.getElementById("adjustment").oninput = updatePreview;
  document.getElementById("btnCloseModal").onclick = () => closeModal("resultModal");
  document.getElementById("btnSettings").onclick = openSettings;
  document.getElementById("btnSaveSettings").onclick = saveSettingsFromForm;
  document.getElementById("btnCloseSettings").onclick = () => closeModal("settingsModal");
  document.getElementById("btnTheme").onclick = () => {
    const t = toggleTheme();
    document.getElementById("btnTheme").textContent = t === "dark" ? "☀️" : "🌙";
  };
  document.getElementById("btnTheme").textContent = (lsGet(LS_KEYS.THEME, "light") === "dark") ? "☀️" : "🌙";
});
