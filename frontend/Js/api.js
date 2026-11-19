/* =========================================================
   api.js — "kurir" antara browser dan server Python (REST API)
   Dipasang SEBELUM app.js di tiap halaman member.
   ========================================================= */
(function () {
  "use strict";

  // Gambar bawaan kalau kolom cover di database masih kosong
  const DEFAULT_COVER = "/assets/Book%20cover.png";

  // Ubah isi kolom cover (mis. "Book cover.png") jadi alamat yang bisa dibuka browser
  function coverUrl(cover) {
    if (!cover) return DEFAULT_COVER;
    if (cover.indexOf("/") !== -1) {
      return encodeURI(cover.charAt(0) === "/" ? cover : "/" + cover);
    }
    return "/assets/" + encodeURIComponent(cover);
  }

  // Panggil server. Kalau gagal, lempar error yang membawa kode status (401, 404, ...)
  async function request(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      const error = new Error(body.message || "Permintaan gagal");
      error.status = response.status;
      throw error;
    }
    return body;
  }

  // Terjemahkan 1 buku dari server ke bentuk yang dipahami app.js
  function toCatalogBook(row) {
    return {
      id: String(row.id),            // app.js memakai id berupa teks (untuk ?id=... di alamat)
      databaseId: row.id,            // id asli di database, dikirim saat meminjam
      title: row.title,
      author: row.author,
      category: row.category || "Lainnya",
      copies: row.stock,
      cover: coverUrl(row.cover),
      synopsis: "Deskripsi buku belum tersedia."
    };
  }

  async function getBooks() {
    const body = await request("/api/books");
    return body.books.map(toCatalogBook);
  }

  window.LibraryApi = { request: request, getBooks: getBooks };
})();