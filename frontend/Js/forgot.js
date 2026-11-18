/* Halaman Lupa Password. showToast dipinjam dari auth.js (harus dimuat lebih dulu). */
(function () {
  "use strict";

  const COOLDOWN = 60; // detik, sama dengan FORGOT_COOLDOWN di auth_controller.py
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  async function postJSON(url, data) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, body: body };
  }

  // Kunci tombol selama COOLDOWN detik dengan hitungan mundur
  function startCountdown(button, originalText) {
    let left = COOLDOWN;
    button.disabled = true;
    button.textContent = "Kirim ulang (" + left + "s)";
    const timer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        button.disabled = false;
        button.textContent = originalText;
      } else {
        button.textContent = "Kirim ulang (" + left + "s)";
      }
    }, 1000);
  }

  window.handleForgot = async function (e) {
    e.preventDefault();
    const button = document.getElementById("forgot-submit");
    const email = document.getElementById("forgot-email").value.trim();
    const originalText = button.textContent;

    if (!EMAIL_RE.test(email)) {
      showToast("Format email tidak valid.");
      return;
    }

    button.disabled = true;
    let started = false;
    try {
      const { ok, body } = await postJSON("/api/auth/forgot", { email: email });
      if (!ok) {
        showToast(body.message || "Terjadi kesalahan. Coba lagi.");
        return;
      }
      showToast(body.message);
      started = true;
      startCountdown(button, originalText);
    } catch (error) {
      showToast("Tidak bisa terhubung ke server.");
    } finally {
      if (!started) button.disabled = false;
    }
  };
})();