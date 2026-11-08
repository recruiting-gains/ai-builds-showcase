type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Home-screen install. The service worker is skipped for automated browsers so tests can stub the camera worker. */
export function installPwa(button: HTMLButtonElement, help: HTMLElement): void {
  let deferred: InstallPrompt | null = null;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferred = event as InstallPrompt;
    button.textContent = 'Install app';
  });
  button.addEventListener('click', async () => {
    if (!deferred) {
      help.hidden = false;
      help.textContent = 'On iPhone, open Share and choose Add to Home Screen. In Chrome or Edge, use the browser menu and choose Install app or Add to Home screen. The camera still stays on this device.';
      return;
    }
    await deferred.prompt();
    deferred = null;
    help.hidden = false;
    help.textContent = 'If you confirmed install, GhostFrame can open from your home screen.';
  });
  if ('serviceWorker' in navigator && navigator.webdriver !== true) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    });
  }
}
