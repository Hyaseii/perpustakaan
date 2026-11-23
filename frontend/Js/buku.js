//BUKU — halaman admin, tersambung ke database lewat /api/admin/books
lucide.createIcons();

(function () {
  "use strict";

  // nama kategori di layar (Indonesia) <-> nama baku di database (sama dengan filter halaman member)
  const KATEGORI = {
    "Fiksi": "Fiction", "Seni": "Arts", "Pengembangan diri": "Self-growth",
    "Sejarah": "History", "Alam": "Nature", "Desain": "Design"
  };
  const KATEGORI_LAYAR = {};
  Object.keys(KATEGORI).forEach(function (label) { KATEGORI_LAYAR[KATEGORI[label]] = label; });
  const WARNA = ["#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"];   // warna garis di samping judul

  // ---------------- alat bantu kecil ----------------
  function angka(n) { return Number(n).toLocaleString("en-US"); }
  function isi(el, teks) { if (el) el.textContent = teks; }

  function esc(teks) {
    return String(teks).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

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

    // ---------------- sampul ----------------
  function urlSampul(cover) {
    if (!cover) return "";
    if (cover.indexOf("/") !== -1) return encodeURI(cover.charAt(0) === "/" ? cover : "/" + cover);
    return "/assets/" + encodeURIComponent(cover);
  }

  // kolom "Sampul" ditambahkan lewat JS ke bagian bawah form (HTML temanmu tidak diubah)
  function buatKolomSampul(form, kunci) {
    const kolom = document.createElement("div");
    kolom.className = "field";
    kolom.innerHTML =
      '<label for="' + kunci + 'Sampul">Sampul (opsional)</label>' +
      '<input type="file" id="' + kunci + 'Sampul" accept="image/png,image/jpeg,image/webp">' +
      '<img alt="Pratinjau sampul" style="display:none;margin-top:10px;max-height:120px;border-radius:8px;">';
    (form.querySelector(".modal-body") || form).appendChild(kolom);

    const input = kolom.querySelector("input");
    const gambar = kolom.querySelector("img");
    function tampil(url) {
      gambar.style.display = url ? "block" : "none";
      if (url) gambar.src = url;
    }
    input.addEventListener("change", function () {
      tampil(input.files.length ? URL.createObjectURL(input.files[0]) : "");
    });
    return { input: input, tampil: tampil, reset: function () { input.value = ""; tampil(""); } };
  }

  // memperkecil gambar di browser (maks 480x640) lalu mengubahnya jadi teks (data URL, JPEG)
  function kecilkanGambar(file) {
    return new Promise(function (selesai, gagal) {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        gagal(new Error("Sampul harus berformat JPG, PNG, atau WEBP"));
        return;
      }
      const pembaca = new FileReader();
      pembaca.onerror = function () { gagal(new Error("Gagal membaca berkas gambar")); };
      pembaca.onload = function () {
        const gambar = new Image();
        gambar.onerror = function () { gagal(new Error("Berkas bukan gambar yang valid")); };
        gambar.onload = function () {
          const skala = Math.min(1, 480 / gambar.width, 640 / gambar.height);
          const kanvas = document.createElement("canvas");
          kanvas.width = Math.round(gambar.width * skala);
          kanvas.height = Math.round(gambar.height * skala);
          const ctx = kanvas.getContext("2d");
          ctx.fillStyle = "#ffffff";          // latar putih untuk PNG transparan
          ctx.fillRect(0, 0, kanvas.width, kanvas.height);
          ctx.drawImage(gambar, 0, 0, kanvas.width, kanvas.height);
          selesai(kanvas.toDataURL("image/jpeg", 0.85));
        };
        gambar.src = pembaca.result;
      };
      pembaca.readAsDataURL(file);
    });
  }

  async function unggahSampul(idBuku, kolom) {
    if (!kolom.input.files || kolom.input.files.length === 0) return;
    const gambar = await kecilkanGambar(kolom.input.files[0]);
    await panggil("/api/admin/books/" + idBuku + "/cover", kirimJson({ image: gambar }));
  }

  // ---------------- elemen halaman ----------------
  const badan = document.getElementById("bookBody");
  const formCari = document.querySelector(".toolbar");
  const inputCari = document.getElementById("searchBook");
  const pilihKategori = document.getElementById("categoryFilter");
  const pilihStatus = document.getElementById("bookStatusFilter");
  const pager = document.querySelector(".table-foot .pager");
  const tombolSebelum = pager.querySelectorAll("button")[0];
  const tombolBerikut = pager.querySelectorAll("button")[1];
  const pilPager = pager.querySelector(".pill");

  // "Perawatan" belum punya data di database: sembunyikan dari filter
  const opsiPerawatan = pilihStatus.querySelector('option[value="maintenance"]');
  if (opsiPerawatan) opsiPerawatan.remove();
  // onchange bawaan memuat ulang halaman; kita ganti dengan pemuatan data saja
  pilihKategori.removeAttribute("onchange");
  pilihStatus.removeAttribute("onchange");

  const state = { q: "", category: "all", status: "all", page: 1 };
  let daftar = [];   // buku yang sedang tampil

  // ---------------- alamat (?q=...&category=...&status=...&page=...) ----------------
  function setKontrol() {
    inputCari.value = state.q;
    pilihKategori.value = state.category;
    pilihStatus.value = state.status;
    if (!pilihKategori.value) { pilihKategori.value = "all"; state.category = "all"; }
    if (!pilihStatus.value) { pilihStatus.value = "all"; state.status = "all"; }
  }

  function bacaUrl() {
    const p = new URLSearchParams(window.location.search);
    state.q = p.get("q") || "";
    state.category = p.get("category") || "all";
    state.status = p.get("status") || "all";
    const hal = Number(p.get("page"));
    state.page = hal > 0 ? hal : 1;
    setKontrol();
  }

  function simpanUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.category !== "all") p.set("category", state.category);
    if (state.status !== "all") p.set("status", state.status);
    if (state.page > 1) p.set("page", String(state.page));
    const qs = p.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
  }

  function kosongkanFilter() {
    state.q = ""; state.category = "all"; state.status = "all"; state.page = 1;
    setKontrol();
    simpanUrl();
  }

  // ---------------- menggambar tabel ----------------
  function barisHtml(b) {
    const tersedia = b.status === "available";
    return '<tr data-id="' + b.id + '">' +
      '<td class="muted">' + esc(b.code) + "</td>" +
      '<td><div class="book-title"><span class="bar" style="background:' + WARNA[b.id % WARNA.length] +
        '"></span><b>' + esc(b.title) + "</b></div></td>" +
      '<td class="muted">' + esc(b.author) + "</td>" +
      "<td>" + esc(KATEGORI_LAYAR[b.category] || b.category || "\u2014") + "</td>" +
      "<td>" + b.total + "</td>" +
      '<td class="num-blue">' + b.available + "</td>" +
      '<td><span class="status ' + (tersedia ? "status-active" : "status-loan") + '">' +
        (tersedia ? "Tersedia" : "Dipinjam") + "</span></td>" +
      '<td><div class="actions">' +
        '<button type="button" class="icon-act icon-edit" data-aksi="edit" aria-label="Ubah"><i data-lucide="pencil"></i></button>' +
        '<button type="button" class="icon-act icon-delete" data-aksi="delete" aria-label="Hapus"><i data-lucide="trash-2"></i></button>' +
      "</div></td></tr>";
  }

  function nonaktifkanTombol(tombol, mati) {
    tombol.disabled = mati;
    tombol.style.opacity = mati ? "0.5" : "";
    tombol.style.cursor = mati ? "not-allowed" : "";
  }

  function cariKartu(judul) {
    return Array.from(document.querySelectorAll(".stat")).find(function (k) {
      const s = k.querySelector(".stat-top span");
      return s && s.textContent.trim() === judul;
    });
  }

  function isiKartu(r) {
    const total = r.available + r.borrowed + r.pending;
    const judul = cariKartu("Semua Judul Buku");
    if (judul) {
      isi(judul.querySelector(".stat-number"), angka(r.titles));
      isi(judul.querySelector(".stat-note"), "Dari " + r.categories + " kategori");
    }
    const tersedia = cariKartu("Golongan tersedia");
    if (tersedia) {
      isi(tersedia.querySelector(".stat-number"), angka(r.available));
      isi(tersedia.querySelector(".stat-note"), "Dari " + angka(total) + " total golongan");
    }
    const dipinjam = cariKartu("Golongan dipinjam");
    if (dipinjam) {
      isi(dipinjam.querySelector(".stat-number"), angka(r.borrowed + r.pending));
      isi(dipinjam.querySelector(".stat-note"),
        r.pending > 0 ? r.pending + " menunggu konfirmasi" : "Tidak ada yang menunggu konfirmasi");
    }
  }

  function gambarTabel(data) {
    const rows = data.books;
    badan.innerHTML = rows.length === 0
      ? '<tr><td colspan="8" class="muted">Tidak ada buku yang cocok.</td></tr>'
      : rows.map(barisHtml).join("");
    lucide.createIcons();

    const awal = rows.length ? (data.page - 1) * data.per_page + 1 : 0;
    const akhir = rows.length ? awal + rows.length - 1 : 0;
    isi(document.querySelector(".section-row > .muted"), rows.length + " dari " + angka(data.total) + " judul");
    isi(document.querySelector(".table-foot > .muted"),
      "Menampilkan " + awal + "-" + akhir + " dari " + angka(data.total) + " judul \u2022 " +
      data.per_page + " judul per halaman");
    isi(pilPager, data.page + " / " + data.pages);
    nonaktifkanTombol(tombolSebelum, data.page <= 1);
    nonaktifkanTombol(tombolBerikut, data.page >= data.pages);
  }

  // ---------------- mengambil data ----------------
  async function muat() {
    const params = new URLSearchParams({ category: state.category, status: state.status, page: String(state.page) });
    if (state.q) params.set("q", state.q);
    try {
      const data = await panggil("/api/admin/books?" + params.toString());
      if (data.page > data.pages) {            // mis. halaman terakhir kosong setelah buku dihapus
        state.page = data.pages;
        simpanUrl();
        return muat();
      }
      daftar = data.books;
      gambarTabel(data);
      isiKartu(data.summary);
    } catch (galat) {
      if (galat.status === 403) { window.location.href = "/Pages/dashboard"; return; }
      console.warn("Gagal memuat buku:", galat);
      toast("Gagal memuat data buku dari server.", true);
    }
  }

  // ---------------- cari, filter, halaman ----------------
  function terapkanFilter() {
    state.q = inputCari.value.trim();
    state.category = pilihKategori.value;
    state.status = pilihStatus.value;
    state.page = 1;
    simpanUrl();
    muat();
  }
  formCari.addEventListener("submit", function (e) { e.preventDefault(); terapkanFilter(); });
  pilihKategori.addEventListener("change", terapkanFilter);
  pilihStatus.addEventListener("change", terapkanFilter);

  tombolSebelum.addEventListener("click", function () {
    if (state.page > 1) { state.page--; simpanUrl(); muat(); }
  });
  tombolBerikut.addEventListener("click", function () {
    if (!tombolBerikut.disabled) { state.page++; simpanUrl(); muat(); }
  });

  // ---------------- jendela (modal) ----------------
  const modalTambah = document.getElementById("bookModal");
  const modalUbah = document.getElementById("editBookModal");
  const modalHapus = document.getElementById("deleteModal");
  const formTambah = document.getElementById("bookForm");
  const formUbah = document.getElementById("editBookForm");
  const formHapus = modalHapus.querySelector("form");
  const sampulTambah = buatKolomSampul(formTambah, "b");
  const sampulUbah = buatKolomSampul(formUbah, "e");

  function buka(modal) { modal.classList.add("show"); }
  function tutup(modal) { modal.classList.remove("show"); }

  [modalTambah, modalUbah, modalHapus].forEach(function (modal) {
    modal.querySelectorAll("[data-close]").forEach(function (t) {
      t.addEventListener("click", function () { tutup(modal); });
    });
    modal.addEventListener("click", function (e) { if (e.target === modal) tutup(modal); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { tutup(modalTambah); tutup(modalUbah); tutup(modalHapus); }
  });

  // ---------------- tambah buku ----------------
  const bStok = document.getElementById("bStok");
  const bTersedia = document.getElementById("bTersedia");

  document.getElementById("openAddBook").addEventListener("click", function () {
    formTambah.reset();
    document.getElementById("bStatus").value = "Tersedia";
    document.getElementById("bStatus").disabled = true;   // buku baru selalu tersedia
    bTersedia.readOnly = true;
    bTersedia.value = bStok.value;
    sampulTambah.reset();
    buka(modalTambah);
  });
  bStok.addEventListener("input", function () { bTersedia.value = bStok.value; });

  formTambah.addEventListener("submit", async function (e) {
    e.preventDefault();
    const tombol = formTambah.querySelector('button[type="submit"]');
    tombol.disabled = true;
    try {
      const data = await panggil("/api/admin/books", kirimJson({
        title: document.getElementById("bJudul").value,
        author: document.getElementById("bPenulis").value,
        category: KATEGORI[document.getElementById("bKategori").value],
        total: Number(bStok.value)
      }));

      let galatSampul = "";
      try {
        await unggahSampul(data.book.id, sampulTambah);
      } catch (g) {
        galatSampul = " Tetapi sampul gagal diunggah: " + g.message;
      }

      tutup(modalTambah);
      toast('"' + data.book.title + '" ditambahkan sebagai ' + data.book.code + "." + galatSampul,
        galatSampul !== "");
      kosongkanFilter();
      await muat();
    } catch (galat) {
      toast(galat.message, true);
    } finally {
      tombol.disabled = false;
    }
  });

  // ---------------- ubah dan hapus (tombol di baris) ----------------
  let bukuDiubah = null;   // { id, aktif } -> aktif = eksemplar yang sedang keluar

  badan.addEventListener("click", function (e) {
    const tombol = e.target.closest("button[data-aksi]");
    if (!tombol) return;
    const b = daftar.find(function (x) { return x.id === Number(tombol.closest("tr").dataset.id); });
    if (!b) return;

    if (tombol.dataset.aksi === "edit") {
      bukuDiubah = { id: b.id, aktif: b.total - b.available };
      document.getElementById("eId").value = b.code;
      document.getElementById("editBookSub").textContent = b.code + " \u2022 " + b.title;
      document.getElementById("eJudul").value = b.title;
      document.getElementById("ePenulis").value = b.author;
      document.getElementById("eKategori").value = KATEGORI_LAYAR[b.category] || "";
      document.getElementById("eStok").value = b.total;
      const eTersedia = document.getElementById("eTersedia");
      eTersedia.value = b.available;
      eTersedia.readOnly = true;                         // dihitung otomatis dari stok
      document.getElementById("eStatus").value = b.status === "available" ? "Tersedia" : "Dipinjam";
      document.getElementById("eStatus").disabled = true;
      sampulUbah.reset();
      sampulUbah.tampil(urlSampul(b.cover));   // tampilkan sampul yang sekarang
      buka(modalUbah);
    } else {
      document.getElementById("deleteId").value = b.id;
      document.getElementById("deleteSub").textContent = b.code + " \u2022 " + b.title;
      buka(modalHapus);
    }
  });

  // pratinjau: mengubah Stok langsung menghitung Tersedia
  document.getElementById("eStok").addEventListener("input", function (e) {
    if (!bukuDiubah) return;
    document.getElementById("eTersedia").value = Math.max(0, Number(e.target.value) - bukuDiubah.aktif);
  });

  formUbah.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!bukuDiubah) return;
    const tombol = formUbah.querySelector('button[type="submit"]');
    tombol.disabled = true;
    try {
      await panggil("/api/admin/books/" + bukuDiubah.id, kirimJson({
        title: document.getElementById("eJudul").value,
        author: document.getElementById("ePenulis").value,
        category: KATEGORI[document.getElementById("eKategori").value],
        total: Number(document.getElementById("eStok").value)
      }));

      let galatSampul = "";
      try {
        await unggahSampul(bukuDiubah.id, sampulUbah);
      } catch (g) {
        galatSampul = " Tetapi sampul gagal diunggah: " + g.message;
      }

      tutup(modalUbah);
      toast("Perubahan buku disimpan." + galatSampul, galatSampul !== "");
      await muat();
    } catch (galat) {
      toast(galat.message, true);
    } finally {
      tombol.disabled = false;
    }
  });

  formHapus.addEventListener("submit", async function (e) {
    e.preventDefault();
    const id = document.getElementById("deleteId").value;
    const tombol = formHapus.querySelector('button[type="submit"]');
    tombol.disabled = true;
    try {
      await panggil("/api/admin/books/" + id + "/delete", { method: "POST" });
      tutup(modalHapus);
      toast("Buku dihapus dari katalog.");
      await muat();
    } catch (galat) {
      tutup(modalHapus);
      toast(galat.message, true);
    } finally {
      tombol.disabled = false;
    }
  });

  // ---------------- mulai ----------------
  bacaUrl();
  muat();
})();