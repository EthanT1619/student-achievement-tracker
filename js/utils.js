/**
 * Shared utilities.
 */
(function (SAT) {
  SAT.generateId = function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  SAT.escapeHtml = function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  SAT.formatDate = function formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  SAT.formatPercent = function formatPercent(value) {
    if (value == null || Number.isNaN(value)) return '데이터 없음';
    return `${Math.round(value * 100)}%`;
  };

  SAT.formatRatio = function formatRatio(correct, total) {
    if (total === 0) return '데이터 없음';
    return `${SAT.formatPercent(correct / total)} · ${correct}/${total}`;
  };

  SAT.nowIso = function nowIso() {
    return new Date().toISOString();
  };

  SAT.daysSince = function daysSince(iso) {
    if (!iso) return Infinity;
    const then = new Date(iso).getTime();
    const now = Date.now();
    return Math.floor((now - then) / (1000 * 60 * 60 * 24));
  };

  SAT.showToast = function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast--visible'));
    setTimeout(() => {
      el.classList.remove('toast--visible');
      setTimeout(() => el.remove(), 300);
    }, 3500);
  };

  SAT.confirmDialog = function confirmDialog(message, { title = '확인', confirmLabel = '확인', danger = false } = {}) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('modal-overlay');
      const modal = document.getElementById('confirm-modal');
      if (!overlay || !modal) {
        resolve(window.confirm(message));
        return;
      }
      modal.querySelector('.modal-title').textContent = title;
      modal.querySelector('.modal-body').textContent = message;
      const confirmBtn = modal.querySelector('[data-action="confirm"]');
      confirmBtn.textContent = confirmLabel;
      confirmBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

      const cleanup = (result) => {
        overlay.classList.add('hidden');
        modal.classList.add('hidden');
        confirmBtn.removeEventListener('click', onConfirm);
        modal.querySelector('[data-action="cancel"]').removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onCancel);
        resolve(result);
      };

      const onConfirm = () => cleanup(true);
      const onCancel = () => cleanup(false);

      confirmBtn.addEventListener('click', onConfirm);
      modal.querySelector('[data-action="cancel"]').addEventListener('click', onCancel);
      overlay.addEventListener('click', onCancel);

      overlay.classList.remove('hidden');
      modal.classList.remove('hidden');
    });
  };
})(window.SAT = window.SAT || {});
