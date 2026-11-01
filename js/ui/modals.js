// Finestre modali definite in index.html (classe .fullscreen-modal).
// Qualsiasi pulsante con l'attributo data-close-modal chiude la sua modale.

export function initModals() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.fullscreen-modal').classList.add('hidden'));
  });
}

export function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

export function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}
