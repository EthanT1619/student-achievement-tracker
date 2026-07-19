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

  SAT.clampPercent = function clampPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  };

  SAT.safeCount = function safeCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  };

  SAT.percentFromRatio = function percentFromRatio(correct, total) {
    const t = SAT.safeCount(total);
    if (t === 0) return 0;
    const c = SAT.safeCount(correct);
    return SAT.clampPercent(Math.round((c / t) * 100));
  };

  SAT.formatDate = function formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return SAT.escapeHtml(String(iso));
      return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return SAT.escapeHtml(String(iso));
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

  SAT.choiceDialog = function choiceDialog(message, { title = '선택', choices = [] } = {}) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('modal-overlay');
      const modal = document.getElementById('confirm-modal');
      if (!overlay || !modal) {
        resolve(null);
        return;
      }

      modal.querySelector('.modal-title').textContent = title;
      modal.querySelector('.modal-body').textContent = message;
      const footer = modal.querySelector('.modal-footer');
      const originalFooterHtml = footer.innerHTML;

      footer.innerHTML = [
        ...choices.map((c) => {
          const cls = c.primary ? 'btn btn-primary' : 'btn btn-secondary';
          const disabled = c.disabled ? ' disabled' : '';
          return `<button type="button" class="${cls}" data-choice="${SAT.escapeHtml(c.id)}"${disabled}>${SAT.escapeHtml(c.label)}</button>`;
        }),
        '<button type="button" class="btn btn-secondary" data-choice="__cancel">닫기</button>',
      ].join('');

      const cleanup = (result) => {
        overlay.classList.add('hidden');
        modal.classList.add('hidden');
        footer.innerHTML = originalFooterHtml;
        footer.querySelectorAll('[data-choice]').forEach((btn) => {
          btn.removeEventListener('click', onChoice);
        });
        overlay.removeEventListener('click', onCancel);
        resolve(result);
      };

      const onChoice = (e) => {
        const id = e.currentTarget.dataset.choice;
        if (id === '__cancel' || e.currentTarget.disabled) {
          cleanup(null);
          return;
        }
        cleanup(id);
      };

      const onCancel = () => cleanup(null);

      footer.querySelectorAll('[data-choice]').forEach((btn) => {
        btn.addEventListener('click', onChoice);
      });
      overlay.addEventListener('click', onCancel);

      overlay.classList.remove('hidden');
      modal.classList.remove('hidden');
    });
  };
})(window.SAT = window.SAT || {});
