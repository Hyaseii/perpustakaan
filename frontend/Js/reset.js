/* Halaman Reset Password. showToast dan togglePassword dipinjam dari auth.js (dimuat lebih dulu). */
(function () {
  "use strict";

  const MIN_PASSWORD = 8;   // sama dengan auth_controller.py
  const MAX_PASSWORD = 128;
  const LOGIN_PAGE = "/Pages/index";

  const token = new URLSearchParams(window.location.search).get("token") || "";

  const boxes = {
    loading: document.getElementById("reset-loading"),
    invalid: document.getElementById("reset-invalid"),
    form: document.getElementById("reset-form-wrap")
  };

  function show(name) {
    Object.keys(boxes).forEach(function (key) {
      boxes[key].classList.toggle("hidden", key !== name);
    });
  }

  async function postJSON(url, data) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, body: body };
  }

  // Saat halaman dibuka: periksa dulu apakah tautannya masih valid
  async function checkToken() {
    if (!token) {
      show("invalid");
      return;
    }
    try {
      const { ok } = await postJSON("/api/auth/reset/check", { token: token });
      show(ok ? "form" : "invalid");
    } catch (error) {
      document.getElementById("reset-invalid-text").textContent =
        "Tidak bisa terhubung ke server. Muat ulang halaman ini.";
      show("invalid");
    }
  }

  window.handleReset = async function (e) {
    e.preventDefault();
    const button = document.getElementById("reset-submit");
    const pass = document.getElementById("reset-password").value;
    const confirm = document.getElementById("reset-confirm").value;

    if (pass.length < MIN_PASSWORD || pass.length > MAX_PASSWORD) {
      showToast("Password harus " + MIN_PASSWORD + "-" + MAX_PASSWORD + " karakter.");
      return;
    }
    if (pass !== confirm) {
      showToast("Konfirmasi password tidak cocok.");
      return;
    }

    button.disabled = true;
    let done = false;
    try {
      const { ok, body } = await postJSON("/api/auth/reset", { token: token, password: pass });
      if (!ok) {
        showToast(body.message || "Terjadi kesalahan. Coba lagi.");
        if ((body.message || "").indexOf("Tautan") === 0) show("invalid");
        return;
      }
      done = true;
      showToast(body.message);
      setTimeout(function () { window.location.href = LOGIN_PAGE; }, 1800);
    } catch (error) {
      showToast("Tidak bisa terhubung ke server.");
    } finally {
      if (!done) button.disabled = false;
    }
  };

  checkToken();
})();