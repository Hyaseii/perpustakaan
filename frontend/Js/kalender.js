/* kalender.js — maksimal hari ini + kirim sinyal ke admin-dashboard.js */
(function () {
  "use strict";

  const picker = document.querySelector(".date-picker");
  const tombolTanggal = document.getElementById("dateBtn");
  const kalender = document.getElementById("calendar");
  const judulBulan = document.getElementById("calTitle");
  const gridTanggal = document.getElementById("calGrid");
  const labelTanggal = document.getElementById("dateLabel");
  const btnNext = document.getElementById("calNext");

  if (!picker || !tombolTanggal || !kalender || !judulBulan || !gridTanggal || !labelTanggal) {
    return;
  }

  const namaBulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const bulanPendek = [
    "JAN", "FEB", "MAR", "APR", "MEI", "JUN",
    "JUL", "AGU", "SEP", "OKT", "NOV", "DES"
  ];

  const sekarang = new Date();
  const hariIni = new Date(sekarang.getFullYear(), sekarang.getMonth(), sekarang.getDate());

  let terpilih = new Date(hariIni);
  let sementara = new Date(terpilih);
  let tahunTampil = terpilih.getFullYear();
  let bulanTampil = terpilih.getMonth();

  labelTanggal.textContent = formatLabel(terpilih);

  function samaHari(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function lebihDariHariIni(tgl) {
    const cek = new Date(tgl.getFullYear(), tgl.getMonth(), tgl.getDate());
    return cek > hariIni;
  }

  function formatLabel(tgl) {
    const hari = String(tgl.getDate()).padStart(2, "0");
    return hari + " " + bulanPendek[tgl.getMonth()] + " " + tgl.getFullYear();
  }

  function gambarKalender() {
    judulBulan.textContent = namaBulan[bulanTampil] + " " + tahunTampil;
    gridTanggal.innerHTML = "";
    const geser = new Date(tahunTampil, bulanTampil, 1).getDay();

    if (btnNext) {
      const sudahBulanIni =
        tahunTampil > hariIni.getFullYear() ||
        (tahunTampil === hariIni.getFullYear() && bulanTampil >= hariIni.getMonth());
      btnNext.disabled = sudahBulanIni;
      btnNext.style.opacity = sudahBulanIni ? "0.35" : "1";
      btnNext.style.pointerEvents = sudahBulanIni ? "none" : "auto";
    }

    for (let i = 0; i < 42; i++) {
      const tgl = new Date(tahunTampil, bulanTampil, 1 - geser + i);
      const lewatHariIni = lebihDariHariIni(tgl);

      const tombol = document.createElement("button");
      tombol.type = "button";
      tombol.className = "cal-day";
      tombol.textContent = tgl.getDate();

      if (tgl.getMonth() !== bulanTampil) tombol.classList.add("other");
      if (samaHari(tgl, hariIni)) tombol.classList.add("today");
      if (samaHari(tgl, sementara)) tombol.classList.add("selected");

      if (lewatHariIni) {
        tombol.disabled = true;
        tombol.classList.add("disabled");
        tombol.style.opacity = "0.35";
        tombol.style.cursor = "not-allowed";
      } else {
        tombol.addEventListener("click", function () {
          pilihTanggal(tgl);
        });
      }

      gridTanggal.appendChild(tombol);
    }
  }

  function pilihTanggal(tgl) {
    if (lebihDariHariIni(tgl)) return;
    sementara = new Date(tgl);
    tahunTampil = tgl.getFullYear();
    bulanTampil = tgl.getMonth();
    gambarKalender();
  }

  function bukaKalender() {
    sementara = new Date(terpilih);
    tahunTampil = terpilih.getFullYear();
    bulanTampil = terpilih.getMonth();
    gambarKalender();
    kalender.classList.add("show");
  }

  function tutupKalender() {
    kalender.classList.remove("show");
  }

  picker.addEventListener("click", function (e) {
    if (e.target.closest("#dateBtn")) {
      if (kalender.classList.contains("show")) {
        tutupKalender();
      } else {
        bukaKalender();
      }
      return;
    }

    if (e.target.closest("#calPrev")) {
      bulanTampil--;
      if (bulanTampil < 0) {
        bulanTampil = 11;
        tahunTampil--;
      }
      gambarKalender();
      return;
    }

    if (e.target.closest("#calNext")) {
      if (btnNext && btnNext.disabled) return;
      bulanTampil++;
      if (bulanTampil > 11) {
        bulanTampil = 0;
        tahunTampil++;
      }
      gambarKalender();
      return;
    }

    const chip = e.target.closest("[data-quick]");
    if (chip) {
      const tgl = new Date(hariIni);
      if (chip.dataset.quick === "yesterday") {
        tgl.setDate(tgl.getDate() - 1);
      }
      if (chip.dataset.quick === "week") {
        const hari = tgl.getDay() === 0 ? 6 : tgl.getDay() - 1;
        tgl.setDate(tgl.getDate() - hari);
      }

      picker.querySelectorAll("[data-quick]").forEach(function (c) {
        c.classList.remove("active");
      });
      chip.classList.add("active");
      pilihTanggal(tgl);
      return;
    }

    if (e.target.closest("#calApply")) {
      terpilih = new Date(sementara);
      labelTanggal.textContent = formatLabel(terpilih);
      tutupKalender();

      document.dispatchEvent(
        new CustomEvent("kalender:terapkan", {
          detail: { tanggal: new Date(terpilih) }
        })
      );
    }
  });

  if (window._calOutsideClick) {
    document.removeEventListener("click", window._calOutsideClick);
  }
  window._calOutsideClick = function (e) {
    if (!document.body.contains(e.target)) return;
    if (!picker.contains(e.target)) tutupKalender();
  };
  document.addEventListener("click", window._calOutsideClick);

  if (window._calEscKey) {
    document.removeEventListener("keydown", window._calEscKey);
  }
  window._calEscKey = function (e) {
    if (e.key === "Escape") tutupKalender();
  };
  document.addEventListener("keydown", window._calEscKey);
})();
