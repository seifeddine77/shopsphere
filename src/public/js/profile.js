/* ShopSphere - profile page (info, password, addresses) */

(function () {
  'use strict';

  /* ------------------------- Personal information ------------------------- */

  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = profileForm.querySelector('.js-submit-profile');
      button.disabled = true;
      try {
        await window.app.api('/api/users/me', {
          method: 'PUT',
          body: JSON.stringify({
            firstName: profileForm.firstName.value.trim(),
            lastName: profileForm.lastName.value.trim(),
            phone: profileForm.phone.value.trim(),
          }),
        });
        window.app.showToast('Profile updated', 'success');
      } catch (error) {
        window.app.showToast(error.message, 'danger');
      } finally {
        button.disabled = false;
      }
    });
  }

  /* ----------------------------- Change password --------------------------- */

  const passwordForm = document.getElementById('password-form');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!passwordForm.reportValidity()) return;

      if (passwordForm.newPassword.value !== passwordForm.confirmPassword.value) {
        window.app.showToast('Passwords do not match.', 'danger');
        return;
      }

      const button = passwordForm.querySelector('.js-submit-password');
      button.disabled = true;
      try {
        await window.app.api('/api/users/me/password', {
          method: 'PUT',
          body: JSON.stringify({
            currentPassword: passwordForm.currentPassword.value,
            newPassword: passwordForm.newPassword.value,
            confirmPassword: passwordForm.confirmPassword.value,
          }),
        });
        window.app.showToast('Password updated!', 'success');
        passwordForm.reset();
      } catch (error) {
        window.app.showToast(error.message, 'danger');
      } finally {
        button.disabled = false;
      }
    });
  }

  /* ------------------------------- Addresses ------------------------------- */

  const addressForm = document.getElementById('address-add-form');
  if (addressForm) {
    addressForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!addressForm.reportValidity()) return;

      const button = addressForm.querySelector('.js-address-add');
      button.disabled = true;
      try {
        const payload = {};
        new FormData(addressForm).forEach((value, key) => { payload[key] = value.trim(); });
        payload.isDefault = true; // newest becomes default (service demotes others)

        await window.app.api('/api/users/me/addresses', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        window.app.showToast('Address saved', 'success');
        setTimeout(() => window.location.reload(), 500);
      } catch (error) {
        button.disabled = false;
        window.app.showToast(error.message, 'danger');
      }
    });

    document.querySelectorAll('.js-address-delete').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!window.confirm('Delete this address?')) return;
        button.disabled = true;
        try {
          await window.app.api(`/api/users/me/addresses/${button.dataset.addressId}`, { method: 'DELETE' });
          window.location.reload();
        } catch (error) {
          button.disabled = false;
          window.app.showToast(error.message, 'danger');
        }
      });
    });
  }
})();
