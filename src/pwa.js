const root = document.querySelector('#pwa-root');
const installedDisplay = window.matchMedia('(display-mode: standalone)');
const isInstalled = () => installedDisplay.matches || navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const DISMISSED_KEY = 'fleettap-install-dismissed-at';
const REMIND_AFTER = 7 * 24 * 60 * 60 * 1000;
let deferredPrompt = null;
let automaticOfferShown = false;
let manualPanel = false;
let opener = null;
let registration;
let installedThisVisit = false;

function wasDismissed() {
  try { return Date.now() - Number(localStorage.getItem(DISMISSED_KEY) || 0) < REMIND_AFTER; }
  catch { return false; }
}
function dismiss() {
  try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch {}
  root.replaceChildren();
  manualPanel = false;
  if (opener?.isConnected) opener.focus();
  opener = null;
}
function syncInstalled() {
  const installed = installedThisVisit || isInstalled();
  document.body.classList.toggle('pwa-installed', installed);
  if (installed) root.replaceChildren();
  return installed;
}
function showInstall(manual = false) {
  if (syncInstalled()) return;
  manualPanel = manual;
  const instructions = deferredPrompt
    ? 'Add FleetTap to your home screen for quick access to your garage.'
    : isIOS
      ? 'Open FleetTap in Safari. Tap Share, then Add to Home Screen. If shown, leave Open as Web App on, then tap Add.'
      : 'Open your browser menu and choose Install FleetTap, Install app or Add to Home screen. If no install option appears, use Chrome or Edge.';
  root.innerHTML = `<section class="install-prompt" aria-labelledby="install-title"><div class="pwa-install-heading"><img src="/assets/icons/icon-192.png" width="44" height="44" alt=""><strong id="install-title" tabindex="-1">Install FleetTap</strong></div><p>${instructions}</p><div class="install-buttons">${deferredPrompt ? '<button type="button" data-pwa-confirm>Install app</button>' : ''}<button type="button" class="secondary" data-pwa-dismiss>${manual ? 'Close' : 'Not now'}</button></div><p class="pwa-install-status" role="status"></p></section>`;
  if (manual) root.querySelector('#install-title').focus();
}
function maybeOfferInstall() {
  const route = location.hash.slice(1);
  if (syncInstalled() || automaticOfferShown || wasDismissed() || (!deferredPrompt && !isIOS) || !['', 'home', 'login'].includes(route)) return;
  if (document.activeElement?.matches('input,textarea,select')) return;
  automaticOfferShown = true;
  showInstall();
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredPrompt = event;
  if (manualPanel) showInstall(true);
  else maybeOfferInstall();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  installedThisVisit = true;
  syncInstalled();
});
installedDisplay.addEventListener('change', syncInstalled);
window.addEventListener('hashchange', () => {
  root.replaceChildren();
  manualPanel = false;
  maybeOfferInstall();
});
document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-pwa-install')) { opener = button; showInstall(true); }
  if (button.hasAttribute('data-pwa-dismiss')) dismiss();
  if (button.hasAttribute('data-pwa-confirm') && deferredPrompt) {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    button.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') root.replaceChildren();
      else dismiss();
    } catch {
      showInstall(true);
      root.querySelector('.pwa-install-status').textContent = 'Use your browser menu to install FleetTap.';
    }
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && root.childElementCount) dismiss();
});
function updateConnection() {
  const status = document.querySelector('#connection-status');
  status.hidden = navigator.onLine;
  status.textContent = navigator.onLine ? '' : 'You’re offline. Keep this screen open and reconnect before saving.';
}
window.addEventListener('online', () => { updateConnection(); registration?.update().catch(() => {}); });
window.addEventListener('offline', updateConnection);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') registration?.update().catch(() => {});
});
syncInstalled();
updateConnection();
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js', {scope: '/', updateViaCache: 'none'})
    .then(value => { registration = value; })
    .catch(() => {}); // The online app remains usable if installation is unavailable.
}
setTimeout(maybeOfferInstall, 1500);
