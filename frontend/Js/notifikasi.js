//NOTIFIKASI — panel lonceng admin, tersambung ke /api/admin/notifications
(function () {
  "use strict";

  const bellBtn = document.getElementById("bellBtn");
  const notifPanel = document.getElementById("notifPanel");
  const notifCount = document.getElementById("notifCount");
  const bellDot = document.getElementById("bellDot");
  const markAll = document.getElementById("markAll");
  const notif = document.querySelector(".notif");
  if (!bellBtn || !notifPanel || !notif) return;

  const notifList = notifPanel.querySelector(".notif-list");
  const notifFoot = notifPanel.querySelector(".notif-foot");
  const STORAGE_KEY = "keyto_admin_read_notifs";
  let daftarNotif = [];

  function esc(teks) {
    return String(teks || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function getReadSet() {
    try {
      const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) {
      return new Set();
    }
  }

  function saveReadSet(set) {
    try {
      const arr = Array.from(set).slice(-100);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  function perbaruiJumlah() {
    const jumlah = notifPanel.querySelectorAll(".notif-item.unread").length;
    if (notifCount) notifCount.textContent = jumlah + " belum dibaca";
    if (bellDot) bellDot.classList.toggle("hide", jumlah === 0);
  }

  function renderNotifikasi() {
    if (!notifList) return;
    if (daftarNotif.length === 0) {
      notifList.innerHTML =
        '<div style="padding:24px 16px;text-align:center;color:#64748b;font-size:13px;">' +
        "Belum ada notifikasi aktivitas terbaru.</div>";
      perbaruiJumlah();
      return;
    }

    const readSet = getReadSet();
    notifList.innerHTML = daftarNotif.map(function (item) {
      const unread = !readSet.has(item.key);
      const tone = ["blue", "gray", "red"].indexOf(item.tone) !== -1 ? item.tone : "blue";
      const pageAttr = item.page ? ' data-page="' + esc(item.page) + '"' : "";
      const hrefAttr = item.page ? 'admin?page=' + esc(item.page) : "#";

      return '<a href="' + hrefAttr + '"' + pageAttr +
        ' class="notif-item' + (unread ? " unread" : "") + '"' +
        ' data-key="' + esc(item.key) + '">' +
          '<span class="notif-icon ' + tone + '"><i data-lucide="' + esc(item.icon || "bell") + '"></i></span>' +
          '<div class="notif-text">' +
            "<b>" + esc(item.title) + "</b>" +
            "<small>" + esc(item.detail) + "</small>" +
          "</div>" +
          '<div class="notif-meta">' +
            "<span>" + esc(item.time) + "</span>" +
            (unread ? '<i class="notif-dot"></i>' : "") +
          "</div>" +
        "</a>";
    }).join("");

    if (window.lucide) window.lucide.createIcons();
    perbaruiJumlah();
  }

  async function muatNotifikasi() {
    try {
      const res = await fetch("/api/admin/notifications");
      if (!res.ok) return;
      const data = await res.json().catch(function () { return {}; });
      if (Array.isArray(data.notifications)) {
        daftarNotif = data.notifications;
        renderNotifikasi();
      }
    } catch (e) {
      console.warn("Gagal memuat notifikasi:", e);
    }
  }

  bellBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    const akanBuka = !notifPanel.classList.contains("show");
    notifPanel.classList.toggle("show");
    if (akanBuka) muatNotifikasi();
  });

  document.addEventListener("click", function (e) {
    if (!notif.contains(e.target)) {
      notifPanel.classList.remove("show");
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") notifPanel.classList.remove("show");
  });

  if (markAll) {
    markAll.addEventListener("click", function () {
      const readSet = getReadSet();
      daftarNotif.forEach(function (item) { readSet.add(item.key); });
      saveReadSet(readSet);
      notifPanel.querySelectorAll(".notif-item.unread").forEach(function (el) {
        el.classList.remove("unread");
        const dot = el.querySelector(".notif-dot");
        if (dot) dot.remove();
      });
      perbaruiJumlah();
    });
  }

  if (notifList) {
    notifList.addEventListener("click", function (e) {
      const item = e.target.closest(".notif-item");
      if (!item) return;
      const key = item.dataset.key;
      if (key) {
        const readSet = getReadSet();
        readSet.add(key);
        saveReadSet(readSet);
      }
      item.classList.remove("unread");
      const dot = item.querySelector(".notif-dot");
      if (dot) dot.remove();
      perbaruiJumlah();
      notifPanel.classList.remove("show");
    });
  }

  if (notifFoot) {
    notifFoot.setAttribute("href", "admin?page=peminjaman");
    notifFoot.dataset.page = "peminjaman";
    notifFoot.addEventListener("click", function () {
      notifPanel.classList.remove("show");
    });
  }

  muatNotifikasi();
})();