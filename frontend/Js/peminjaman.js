//PEMINJAMAN — halaman admin, tersambung ke database lewat /api/admin/loans
lucide.createIcons();

(function () {
  "use strict";

  const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const BULAN_PENUH = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
                       "Agustus", "September", "Oktober", "November", "Desember"];
  const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const STATUS = {
    pending:   { teks: "Tunggu konfirmasi", kelas: "status-pending" },
    borrowed:  { teks: "Dipinjam",          kelas: "status-loan" },
    overdue:   { teks: "Terlambat",         kelas: "status-overdue" },
    returned:  { teks: "Dikembalikan",      kelas: "status-returned" },
    cancelled: { teks: "Dibatalkan",        kelas: "status-cancelled" },
    expired:   { teks: "Hangus",            kelas: "status-expired" }
  };

  // ---------------- alat bantu kecil ----------------
  function dua(n) { return String(n).padStart(2, "0"); }
  function angka(n) { return Number(n).toLocaleString("id-ID"); }
  function isi(el, teks) { if (el) el.textContent = teks; }
  function kodePN(id) { return "PN-" + String(id).padStart(4, "0"); }

  function esc(teks) {
    return String(teks).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // "2026-11-22" atau "2026-11-22 16:02:29" -> objek tanggal
  function parseTanggal(teks) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(teks || ""));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  function keIso(d) { return d.getFullYear() + "-" + dua(d.getMonth() + 1) + "-" + dua(d.getDate()); }
  function tglPanjang(d) { return dua(d.getDate()) + " " + BULAN[d.getMonth()] + " " + d.getFullYear(); }

  // pemberitahuan kecil di pojok kanan bawah (halaman admin belum punya toast)
  function toast(teks, galat) {
    let kotak = document.getElementById("admin-toast");
    if (!kotak) {
      kotak = document.createElement("div");
      kotak.id = "admin-toast";
      kotak.style.cssText = "position:fixed;right:24px;bottom:24px;z-index:9999;padding:12px 18px;" +
        "border-radius:12px;font-size:13px;font-weight:600;color:#fff;max-width:360px;" +
        "box-shadow:0 8px 24px rgba(15,23,42,.25);transition:opacity .25s;opacity:0;";
      document.body.appendChild(kotak);
    }
    kotak.style.background = galat ? "#dc2626" : "#16325c";
    kotak.textContent = teks;
    kotak.style.opacity = "1";
    clearTimeout(kotak._timer);
    kotak._timer = setTimeout(function () { kotak.style.opacity = "0"; }, 3500);
  }

  // memanggil server; kalau gagal, lempar error berisi pesan dari server
  async function panggil(url, opsi) {
    const respons = await fetch(url, opsi);
    const data = await respons.json().catch(function () { return {}; });
    if (respons.status === 401) {
      window.location.href = "/Pages/index";
      throw new Error("Sesi berakhir, silakan login lagi");
    }
    if (!respons.ok) {
      const galat = new Error(data.message || "Permintaan gagal");
      galat.status = respons.status;
      throw galat;
    }
    return data;
  }

  function kirimJson(data) {
    return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
  }

  // ---------------- elemen halaman ----------------
  const badan = document.getElementById("loanBody");
  const formCari = document.querySelector(".toolbar");
  const inputCari = formCari.querySelector('input[name="q"]');
  const pilihStatus = formCari.querySelector('select[name="status"]');
  const pilihTanggal = formCari.querySelector('select[name="tanggal"]');
  const pager = document.querySelector(".table-foot .pager");
  const tombolSebelum = pager.querySelectorAll("button")[0];
  const tombolBerikut = pager.querySelectorAll("button")[1];
  const pilPager = pager.querySelector(".pill");

  // filter status ditambah dengan status baru (HTML temanmu tidak diubah)
  pilihStatus.insertBefore(new Option("Tunggu konfirmasi", "pending"), pilihStatus.options[1]);
  pilihStatus.appendChild(new Option("Dibatalkan", "cancelled"));
  pilihStatus.appendChild(new Option("Hangus", "expired"));
  // onchange bawaan memuat ulang halaman; kita ganti dengan pemuatan data saja
  pilihStatus.removeAttribute("onchange");
  pilihTanggal.removeAttribute("onchange");

  const state = { q: "", status: "all", tanggal: "all", page: 1 };
  let daftar = [];   // transaksi yang sedang tampil

  // ---------------- alamat (?q=...&status=...) ----------------
  function bacaUrl() {
    const p = new URLSearchParams(window.location.search);
    state.q = p.get("q") || "";
    state.status = p.get("status") || "all";
    state.tanggal = p.get("tanggal") || "all";
    const hal = Number(p.get("page"));
    state.page = hal > 0 ? hal : 1;

    inputCari.value = state.q;
    pilihStatus.value = state.status;
    pilihTanggal.value = state.tanggal;
    if (!pilihStatus.value) { pilihStatus.value = "all"; state.status = "all"; }
    if (!pilihTanggal.value) { pilihTanggal.value = "all"; state.tanggal = "all"; }
  }

  function simpanUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.status !== "all") p.set("status", state.status);
    if (state.tanggal !== "all") p.set("tanggal", state.tanggal);
    if (state.page > 1) p.set("page", String(state.page));
    const qs = p.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
  }

  // ---------------- menggambar tabel ----------------
  function ikon(kelas, aksi, judul, nama) {
    return '<button type="button" class="icon-act ' + kelas + '" data-aksi="' + aksi + '" title="' +
      judul + '" aria-label="' + judul + '"><i data-lucide="' + nama + '"></i></button>';
  }

  function aksiHtml(p) {
    const tombol = [];
    if (p.status === "pending") {
      tombol.push(ikon("icon-confirm", "confirm", "Konfirmasi peminjaman", "check"));
    }
    if (p.status === "borrowed") {
      tombol.push(ikon("icon-return", "return", "Terima pengembalian", "book-check"));
      tombol.push(ikon("icon-edit", "edit", "Ubah jatuh tempo", "pencil"));
    }
    if (tombol.length === 0) return '<td class="dash">&mdash;</td>';
    return '<td><div class="row-actions">' + tombol.join("") + "</div></td>";
  }

  function sel(teks) {
    return teks ? "<td>" + teks + "</td>" : '<td class="dash">&mdash;</td>';
  }

  function barisHtml(p) {
    const st = STATUS[p.display_status] || { teks: p.display_status, kelas: "" };
    const pinjam = parseTanggal(p.confirmed_at || p.borrowed_at);
    const tempo = parseTanggal(p.due_date);
    const kembali = parseTanggal(p.returned_at);
    return '<tr data-id="' + p.id + '">' +
      '<td class="muted">' + esc(p.code) + "</td>" +
      '<td><div class="person"><span class="av-lg">' + esc(p.borrower.initials) + "</span><b>" +
        esc(p.borrower.name) + "</b></div></td>" +
      "<td>" + esc(p.title) + "</td>" +
      sel(pinjam ? tglPanjang(pinjam) : "") +
      sel(tempo ? tglPanjang(tempo) : "") +
      sel(kembali ? tglPanjang(kembali) : "") +
      '<td><span class="status ' + st.kelas + '">' + st.teks + "</span></td>" +
      aksiHtml(p) +
      "</tr>";
  }

  function nonaktifkanTombol(tombol, mati) {
    tombol.disabled = mati;
    tombol.style.opacity = mati ? "0.5" : "";
    tombol.style.cursor = mati ? "not-allowed" : "";
  }

  function gambarTabel(data) {
    const rows = data.loans;
    badan.innerHTML = rows.length === 0
      ? '<tr><td colspan="8" class="muted">Tidak ada transaksi yang cocok.</td></tr>'
      : rows.map(barisHtml).join("");
    lucide.createIcons();

    const awal = rows.length ? (data.page - 1) * data.per_page + 1 : 0;
    const akhir = rows.length ? awal + rows.length - 1 : 0;
    const sekarang = new Date();
    isi(document.querySelector(".section-sub"),
      "Data per " + sekarang.getDate() + " " + BULAN_PENUH[sekarang.getMonth()] + " " +
      sekarang.getFullYear() + " • diurutkan menurut tanggal pinjam terbaru");
    isi(document.querySelector(".section-row > .muted"), rows.length + " dari " + angka(data.total) + " transaksi");
    isi(document.querySelector(".table-foot > .muted"),
      "Menampilkan " + awal + "-" + akhir + " dari " + angka(data.total) + " transaksi • " +
      data.per_page + " transaksi per halaman");
    isi(pilPager, data.page + " / " + data.pages);
    nonaktifkanTombol(tombolSebelum, data.page <= 1);
    nonaktifkanTombol(tombolBerikut, data.page >= data.pages);
  }

  // ---------------- tiga kartu angka di atas ----------------
  function cariKartu(judul) {
    return Array.from(document.querySelectorAll(".stat")).find(function (k) {
      const s = k.querySelector(".stat-top span");
      return s && s.textContent.trim() === judul;
    });
  }

  function isiKartu(r) {
    const sekarang = new Date();
    const aktif = cariKartu("Peminjaman aktif");
    if (aktif) {
      isi(aktif.querySelector(".stat-number"), angka(r.borrowed));
      isi(aktif.querySelector(".stat-note"),
        "Termasuk " + r.overdue + " pinjaman terlambat" +
        (r.pending > 0 ? " • " + r.pending + " menunggu konfirmasi" : ""));
    }
    const kembali = cariKartu("Dikembalikan hari ini");
    if (kembali) {
      isi(kembali.querySelector(".stat-number"), angka(r.returned_today));
      isi(kembali.querySelector(".stat-note"),
        NAMA_HARI[sekarang.getDay()] + ", " + tglPanjang(sekarang));
    }
    const lambat = cariKartu("Pinjaman terlambat");
    if (lambat) isi(lambat.querySelector(".stat-number"), angka(r.overdue));

    // kartu info di bagian bawah halaman
    const kartuInfo = Array.from(document.querySelectorAll(".info-cards .card")).find(function (k) {
      const h = k.querySelector("h3");
      return h && h.textContent.indexOf("Pengingat ramah") === 0;
    });
    if (kartuInfo) isi(kartuInfo.querySelector(".meta"), r.overdue + " pinjaman terlambat perlu ditangani hari ini.");
  }

  // ---------------- mengambil data ----------------
  async function muat() {
    const params = new URLSearchParams({ status: state.status, period: state.tanggal, page: String(state.page) });
    if (state.q) params.set("q", state.q);
    try {
      const data = await panggil("/api/admin/loans?" + params.toString());
      if (data.page > data.pages) {            // mis. halaman terakhir kosong setelah data berkurang
        state.page = data.pages;
        simpanUrl();
        return muat();
      }
      daftar = data.loans;
      gambarTabel(data);
      isiKartu(data.summary);
    } catch (galat) {
      if (galat.status === 403) { window.location.href = "/Pages/dashboard"; return; }
      console.warn("Gagal memuat peminjaman:", galat);
      toast("Gagal memuat data peminjaman dari server.", true);
    }
  }

  // ---------------- cari, filter, halaman ----------------
  function terapkanFilter() {
    state.q = inputCari.value.trim();
    state.status = pilihStatus.value;
    state.tanggal = pilihTanggal.value;
    state.page = 1;
    simpanUrl();
    muat();
  }
  formCari.addEventListener("submit", function (e) { e.preventDefault(); terapkanFilter(); });
  pilihStatus.addEventListener("change", terapkanFilter);
  pilihTanggal.addEventListener("change", terapkanFilter);

  tombolSebelum.addEventListener("click", function () {
    if (state.page > 1) { state.page--; simpanUrl(); muat(); }
  });
  tombolBerikut.addEventListener("click", function () {
    if (!tombolBerikut.disabled) { state.page++; simpanUrl(); muat(); }
  });

  // ---------------- tombol aksi di baris tabel ----------------
  async function aksiServer(url, pesanSukses, tombol) {
    if (tombol) tombol.disabled = true;
    try {
      await panggil(url, { method: "POST" });
      toast(pesanSukses);
    } catch (galat) {
      toast(galat.message, true);
    }
    await muat();   // apa pun hasilnya, tampilkan data terbaru
  }

  badan.addEventListener("click", function (e) {
    const tombol = e.target.closest("button[data-aksi]");
    if (!tombol) return;
    const p = daftar.find(function (x) { return x.id === Number(tombol.closest("tr").dataset.id); });
    if (!p) return;

    if (tombol.dataset.aksi === "confirm") {
      if (!window.confirm("Konfirmasi " + p.code + "?\n" + p.title + " untuk " + p.borrower.name +
          ".\nMasa pinjam 14 hari dihitung mulai hari ini.")) return;
      aksiServer("/api/loans/" + p.id + "/confirm", p.code + " dikonfirmasi. Silakan serahkan bukunya.", tombol);
    } else if (tombol.dataset.aksi === "return") {
      if (!window.confirm("Terima pengembalian " + p.code + "?\n" + p.title + " dari " + p.borrower.name + ".")) return;
      aksiServer("/api/loans/" + p.id + "/return", p.code + " dikembalikan. Stok buku bertambah.", tombol);
    } else if (tombol.dataset.aksi === "edit") {
      bukaUbah(p);
    }
  });

  // ---------------- jendela: tambah peminjaman ----------------
  const modalTambah = document.getElementById("loanModal");
  const formTambah = document.getElementById("loanForm");

  function tutup(modal) { modal.classList.remove("show"); }

  document.getElementById("openAddLoan").addEventListener("click", function () {
    formTambah.reset();
    const hariIni = new Date();
    const tempo = new Date();
    tempo.setDate(tempo.getDate() + 14);

    const lPinjam = document.getElementById("lPinjam");
    lPinjam.value = keIso(hariIni);
    lPinjam.readOnly = true;                        // tanggal pinjam selalu hari ini
    document.getElementById("lTempo").value = keIso(tempo);
    document.getElementById("lStatus").value = "borrowed";
    document.getElementById("lStatus").disabled = true;   // pinjaman baru selalu "Dipinjam"
    document.getElementById("lKembali").disabled = true;
    document.getElementById("lPeminjam").placeholder = "NPM, ID anggota (MB-0008), atau nama lengkap";
    document.getElementById("lBuku").placeholder = "Judul buku (persis) atau kode BK-007";
    modalTambah.classList.add("show");
  });

  formTambah.addEventListener("submit", async function (e) {
    e.preventDefault();
    const tombol = formTambah.querySelector('button[type="submit"]');
    tombol.disabled = true;
    try {
      const data = await panggil("/api/admin/loans", kirimJson({
        member: document.getElementById("lPeminjam").value,
        book: document.getElementById("lBuku").value,
        due_date: document.getElementById("lTempo").value
      }));
      tutup(modalTambah);
      toast("Peminjaman " + kodePN(data.loan.id) + " dicatat.");
      state.page = 1;
      simpanUrl();
      await muat();
    } catch (galat) {
      toast(galat.message, true);   // jendela tetap terbuka supaya bisa diperbaiki
    } finally {
      tombol.disabled = false;
    }
  });

  // ---------------- jendela: ubah jatuh tempo ----------------
  const modalUbah = document.getElementById("editLoanModal");
  const formUbah = document.getElementById("editLoanForm");
  let idDiubah = null;

  function kunci(id, nilai) {
    const el = document.getElementById(id);
    el.value = nilai;
    if (el.tagName === "SELECT") el.disabled = true; else el.readOnly = true;
  }

  function bukaUbah(p) {
    idDiubah = p.id;
    document.getElementById("editLoanSub").textContent = p.code + " \u2022 " + p.borrower.name;
    kunci("elId", p.code);
    kunci("elPeminjam", p.borrower.name);
    kunci("elBuku", p.title);
    kunci("elPinjam", keIso(parseTanggal(p.confirmed_at || p.borrowed_at)));
    kunci("elStatus", p.display_status === "overdue" ? "overdue" : "borrowed");
    document.getElementById("elKembali").value = "";
    document.getElementById("elKembali").disabled = true;

    const tempo = document.getElementById("elTempo");   // satu-satunya kolom yang boleh diubah
    tempo.value = p.due_date ? p.due_date.slice(0, 10) : "";
    tempo.readOnly = false;
    modalUbah.classList.add("show");
  }

  formUbah.addEventListener("submit", async function (e) {
    e.preventDefault();
    const tombol = formUbah.querySelector('button[type="submit"]');
    tombol.disabled = true;
    try {
      await panggil("/api/loans/" + idDiubah + "/due-date",
        kirimJson({ due_date: document.getElementById("elTempo").value }));
      tutup(modalUbah);
      toast("Jatuh tempo diperbarui.");
      await muat();
    } catch (galat) {
      toast(galat.message, true);
    } finally {
      tombol.disabled = false;
    }
  });

  // ---------------- menutup jendela ----------------
  [modalTambah, modalUbah].forEach(function (modal) {
    modal.querySelectorAll("[data-close]").forEach(function (t) {
      t.addEventListener("click", function () { tutup(modal); });
    });
    modal.addEventListener("click", function (e) { if (e.target === modal) tutup(modal); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { tutup(modalTambah); tutup(modalUbah); }
  });

  // ---------------- mulai ----------------
  bacaUrl();
  muat();
})();