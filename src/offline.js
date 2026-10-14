document.querySelector('#offline-retry').addEventListener('click', () => location.reload());
function connectionMessage() {
  document.querySelector('#offline-status').textContent = navigator.onLine
    ? 'When your connection is ready, tap Try again.'
    : 'You are currently offline.';
}
window.addEventListener('online', connectionMessage);
window.addEventListener('offline', connectionMessage);
connectionMessage();
