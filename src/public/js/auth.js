/* ShopSphere - authentication pages (login, register, forgot, reset) */

(function () {
  'use strict';

  /* ------------------------- Shared helpers ----------------------------- */

  function clearFieldErrors(scope) {
    scope.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
    scope.querySelectorAll('[data-error-for]').forEach((el) => {
      el.textContent = '';
      el.classList.remove('show');
    });
    const alert = scope.querySelector('#forgot-success');
    if (alert) alert.classList.add('d-none');
  }

  function showFieldErrors(scope, errors) {
    (errors || []).forEach(({ field, message }) => {
      const input = scope.querySelector(`[name="${field}"]`);
      const feedback = scope.querySelector(`[data-error-for="${field}"]`);
      if (input) {
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
      }
      if (feedback) {
        feedback.textContent = message;
        feedback.classList.add('show');
      }
    });
  }

  async function submitForm(url, scope, payload, onSuccess) {
    try {
      return onSuccess(await window.app.api(url, {
        method: 'POST',
        body: JSON.stringify(payload),
      }));
    } catch (error) {
      const fieldErrors = (error.payload && error.payload.errors) || [];
      if (fieldErrors.length) showFieldErrors(scope, fieldErrors);
      window.app.showToast(error.message, 'danger');
      return null;
    }
  }

  function safeRedirectPath(candidate, fallback) {
    if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
      return fallback;
    }
    return candidate;
  }

  /* --------------------------- Password toggle -------------------------- */

  document.querySelectorAll('.password-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.target);
      if (!input) return;
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      button.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
      const icon = button.querySelector('i');
      if (icon) icon.classList.toggle('bi-eye-slash', !visible);
    });
  });

  /* -------------------------------- Logout ------------------------------ */

  document.querySelectorAll('[data-action="logout"]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await window.app.api('/api/auth/logout', { method: 'POST' });
      } finally {
        window.location.href = '/';
      }
    });
  });

  /* -------------------------------- Login ------------------------------- */

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(loginForm);

      await submitForm('/api/auth/login', loginForm, {
        email: loginForm.email.value.trim(),
        password: loginForm.password.value,
      }, () => {
        window.location.href = safeRedirectPath(
          new URLSearchParams(window.location.search).get('redirect'),
          '/',
        );
      });
    });
  }

  /* ------------------------------ Register ------------------------------ */

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(registerForm);

      if (registerForm.password.value !== registerForm.confirmPassword.value) {
        showFieldErrors(registerForm, [
          { field: 'confirmPassword', message: 'Passwords do not match' },
        ]);
        return;
      }

      await submitForm('/api/auth/register', registerForm, {
        firstName: registerForm.firstName.value.trim(),
        lastName: registerForm.lastName.value.trim(),
        email: registerForm.email.value.trim(),
        password: registerForm.password.value,
        confirmPassword: registerForm.confirmPassword.value,
        phone: registerForm.phone.value.trim(),
      }, () => {
        window.location.href = '/';
      });
    });
  }

  /* --------------------------- Forgot password --------------------------- */

  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(forgotForm);

      await submitForm('/api/auth/forgot-password', forgotForm, {
        email: forgotForm.email.value.trim(),
      }, (result) => {
        const alert = document.getElementById('forgot-success');
        alert.textContent = result.message;
        alert.classList.remove('d-none');
        forgotForm.reset();
      });
    });
  }

  /* ---------------------------- Reset password --------------------------- */

  const resetPage = document.getElementById('reset-page');
  const resetForm = document.getElementById('reset-form');
  if (resetPage && resetForm) {
    resetForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(resetForm);

      if (resetForm.password.value !== resetForm.confirmPassword.value) {
        showFieldErrors(resetForm, [
          { field: 'confirmPassword', message: 'Passwords do not match' },
        ]);
        return;
      }

      await submitForm('/api/auth/reset-password', resetForm, {
        token: resetPage.dataset.resetToken,
        password: resetForm.password.value,
        confirmPassword: resetForm.confirmPassword.value,
      }, () => {
        window.app.showToast('Password updated! Redirecting to login...', 'success');
        setTimeout(() => {
          window.location.href = '/auth/login';
        }, 1500);
      });
    });
  }
})();
