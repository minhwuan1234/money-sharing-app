/**
 * manage.js — Logic dashboard Collect: polling 5s, tiến độ thu,
 * xác nhận đã nhận (cần token), copy text nhắc nợ.
 */

let SESSION = null;
let MEMBERS = [];
let TOKEN = null;
let pollTimer = null;

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

/* ---------- Load + polling ---------- */
async function load(firstTime) {
  const id = getParam("id");
  TOKEN = getParam("t");
  if (!id) return showError("Link không hợp lệ (thiếu mã phiên).");

  const res = await apiGetSession(id);
  if (!res.ok) {
    if (firstTime) return showError(res.error || "Không tìm thấy phiên.");
    setLive(false); // lỗi mạng giữa chừng -> giữ data cũ, chỉ tắt đèn live
    return;
  }
  setLive(true);
  SESSION = res.session;
  MEMBERS = res.members || [];
  render();
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (document.hidden) return; // tab ẩn -> không poll cho đỡ tốn quota
    load(false);
  }, POLL_INTERVAL);
}

function setLive(ok) {
  const dot = document.querySelector("#liveDot span");
  if (dot) dot.className = "w-2 h-2 rounded-full " + (ok ? "bg-emerald-500" : "bg-rose-500");
}

/* ---------- Render ---------- */
function render() {
  document.getElementById("loading").classList.add("hidden");
  document.getElementById("content").classList.remove("hidden");

  document.getElementById("eventTitle").textContent = SESSION.event_name || "Thu tiền nhóm";
  document.getElementById("eventDate").textContent = SESSION.date || "";

  const per = Number(SESSION.amount_per_person) || 0;
  const total = per * MEMBERS.length;
  // "Đã nhận" chỉ tính những người đã được Collect xác nhận (confirmed)
  const confirmedCount = MEMBERS.filter(m => m.status === STATUS.CONFIRMED).length;
  const collected = per * confirmedCount;
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0;
  const unpaidCount = MEMBERS.length - confirmedCount;

  document.getElementById("collected").textContent = formatMoney(collected);
  document.getElementById("total").textContent = formatMoney(total);
  document.getElementById("progressBar").style.width = pct + "%";
  document.getElementById("progressText").textContent = `${confirmedCount}/${MEMBERS.length} người đã nhận (${pct}%)`;
  document.getElementById("remainText").textContent = unpaidCount > 0
    ? `Còn thiếu ${formatMoney(total - collected)}` : "Đã thu đủ 🎉";

  renderMembers();

  const btnRemind = document.getElementById("btnRemind");
  btnRemind.disabled = unpaidCount === 0;
  btnRemind.textContent = unpaidCount === 0 ? "✅ Đã thu đủ" : "📋 Copy text nhắc nợ";
}

function renderMembers() {
  // Sắp xếp: chưa trả -> đã báo -> đã nhận, để collect dễ nhìn việc cần làm
  const order = { unpaid: 0, reported: 1, confirmed: 2 };
  const sorted = [...MEMBERS].sort((a, b) => (order[a.status] ?? 0) - (order[b.status] ?? 0));

  document.getElementById("memberList").innerHTML = sorted.map(m => {
    const meta = STATUS_META[m.status] || STATUS_META.unpaid;
    let actionBtn = "";
    if (m.status === STATUS.CONFIRMED) {
      actionBtn = `<button data-id="${esc(m.member_id)}" data-act="unconfirm"
        class="act px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-sm">Hủy xác nhận</button>`;
    } else {
      actionBtn = `<button data-id="${esc(m.member_id)}" data-act="confirm"
        class="act px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm">Xác nhận đã nhận</button>`;
    }
    return `
      <div class="flex items-center justify-between gap-2 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5">
        <div class="min-w-0">
          <p class="font-medium truncate">${esc(m.name)}${m.phone ? ` <span class="text-xs text-slate-400">${esc(m.phone)}</span>` : ""}</p>
          <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${meta.badge}">
            <span class="w-1.5 h-1.5 rounded-full ${meta.dot}"></span>${meta.label} · ${formatMoney(m.amount)}
          </span>
        </div>
        ${actionBtn}
      </div>`;
  }).join("");

  document.getElementById("memberList").querySelectorAll(".act").forEach(btn => {
    btn.onclick = () => onAction(btn.dataset.id, btn.dataset.act);
  });
}

/* ---------- Xác nhận / hủy (cần token) ---------- */
async function onAction(memberId, act) {
  if (!TOKEN) return toast("Thiếu mã quản lý trong link.");
  const newStatus = act === "confirm" ? STATUS.CONFIRMED : STATUS.UNPAID;

  const m = MEMBERS.find(x => x.member_id === memberId);
  const prev = m ? m.status : null;
  if (m) { m.status = newStatus; render(); } // optimistic

  const res = await apiSetStatus(memberId, newStatus, TOKEN);
  if (!res.ok) {
    if (m) { m.status = prev; render(); }
    return toast("Lỗi: " + res.error);
  }
  toast(act === "confirm" ? "Đã xác nhận nhận tiền ✅" : "Đã hủy xác nhận.");
}

/* ---------- Nhắc nợ ---------- */
async function copyRemind() {
  const unpaid = MEMBERS.filter(m => m.status !== STATUS.CONFIRMED);
  if (unpaid.length === 0) return toast("Đã thu đủ, không cần nhắc.");

  const tpl = getSettings().remind_template || DEFAULT_REMIND_TEMPLATE;
  const danhSach = unpaid.map(m => `• ${m.name}: ${formatMoney(m.amount)}`).join("\n");
  const stk = `${SESSION.bank_account} - ${SESSION.bank_name} - ${SESSION.collector_name}`;

  const text = tpl
    .replace(/{su_kien}/g, SESSION.event_name || "")
    .replace(/{so_nguoi}/g, unpaid.length)
    .replace(/{danh_sach}/g, danhSach)
    .replace(/{stk}/g, stk);

  const ok = await copyText(text);
  toast(ok ? "Đã copy text nhắc nợ 📋" : "Không copy được, thử lại.");
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  document.getElementById("btnTheme").textContent = (lsGet(LS_KEYS.THEME, "light") === "dark") ? "☀️" : "🌙";
  document.getElementById("btnTheme").onclick = () => {
    const t = toggleTheme();
    document.getElementById("btnTheme").textContent = t === "dark" ? "☀️" : "🌙";
  };
  document.getElementById("btnRemind").onclick = copyRemind;

  load(true).then(startPolling);
});
