/* Kerangka admin: sidebar, topbar, footer tetap; isi ditukar lewat ?page= tanpa reload */
(function () {
  "use strict";

  const DEFAULT_PAGE = "home";
  const BRAND = "Keyto Perpustakaan";

  // nilai ?page= -> file isi + judul. Halaman baru = tambah satu baris di sini.
  const PAGES = {
    home:        { file: "/Pages/home",        title: "Home",       scripts: ["/Js/kalender.js", "/Js/script.js", "/Js/admin-dashboard.js"] },
    anggota:     { file: "/Pages/anggota",     title: "Anggota",    scripts: ["/Js/anggota.js"] },
    bukustorage: { file: "/Pages/bukustorage", title: "Buku",       scripts: ["/Js/buku.js"] },
    peminjaman:  { file: "/Pages/peminjaman",  title: "Peminjaman", scripts: ["/Js/peminjaman.js"] },
    pengunjung:  { file: "/Pages/pengunjung",  title: "Pengunjung", scripts: ["/Js/pengunjung.js"] },
    laporan:     { file: "/Pages/laporan",     title: "Laporan",    scripts: ["/Js/laporan.js"] },
    pengaturan:  { file: "/Pages/pengaturan",  title: "Pengaturan", scripts: ["/Js/pengaturan.js"] }
  };

  const view = document.getElementById("pageView");
  const crumb = document.querySelector(".crumb");
  let currentLoad = 0;

  const hasPage = (key) => Object.prototype.hasOwnProperty.call(PAGES, key);

  function keyFromUrl() {
    const key = new URLSearchParams(window.location.search).get("page");
    return hasPage(key) ? key : DEFAULT_PAGE;
  }

  function showNotice(text) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = text;
    view.replaceChildren(p);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = src + "?v=" + Date.now();
      script.dataset.pageScript = "1";
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  async function loadPage(key) {
    const page = PAGES[key];
    const myLoad = ++currentLoad;

    document.querySelectorAll(".menu a[data-page]").forEach(function (a) {
      a.classList.toggle("active", a.dataset.page === key);
    });
    if (crumb) crumb.textContent = "Workspace / " + page.title;
    document.title = BRAND + " - " + page.title;
    document.querySelectorAll("script[data-page-script]").forEach(function (s) { s.remove(); });
    showNotice("Memuat...");

    try {
      const response = await fetch(page.file);
      if (myLoad !== currentLoad) return;
      if (response.redirected) { window.location.href = "/Pages/index"; return; }
      if (response.status === 404) return showNotice("Halaman ini belum tersedia.");
      if (response.status === 403) return showNotice("Anda tidak punya akses ke halaman ini.");
      if (!response.ok) return showNotice("Tidak bisa memuat halaman.");

      const html = await response.text();
      if (myLoad !== currentLoad) return;
      view.innerHTML = html;
      if (window.lucide) window.lucide.createIcons();
      window.scrollTo(0, 0);

      for (const src of page.scripts || []) {
        if (myLoad !== currentLoad) return;
        try {
          await loadScript(src);
        } catch (err) {
          // satu script yang hilang tidak boleh menghapus halaman yang sudah tampil
          console.warn("Script gagal dimuat:", src);
        }
      }
    } catch (error) {
      if (myLoad === currentLoad) showNotice("Tidak bisa terhubung ke server.");
    }
  }

  // Klik menu: ganti isi dan alamat tanpa reload
  document.addEventListener("click", function (e) {
    const link = e.target.closest("a[data-page]");
    if (!link || e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const key = link.dataset.page;
    if (!hasPage(key)) return;
    e.preventDefault();
    if (key !== keyFromUrl()) {
      history.pushState({}, "", "?page=" + key);
      loadPage(key);
    }
  });

  window.addEventListener("popstate", function () { loadPage(keyFromUrl()); });

  const logout = document.getElementById("btnLogout");
  if (logout) {
    logout.addEventListener("click", async function (e) {
      e.preventDefault();
      try { await fetch("/api/auth/logout", { method: "POST" }); } catch (error) {}
      window.location.href = "/Pages/index";
    });
  }

  const first = keyFromUrl();
  if (new URLSearchParams(window.location.search).get("page") !== first) {
    history.replaceState({}, "", "?page=" + first);
  }
  loadPage(first);
})();
