import { registerSW } from "virtual:pwa-register";

const SW_UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let isReloading = false;

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true);
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) {
      return;
    }

    const checkForUpdate = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) {
        return;
      }

      void registration.update();
    };

    checkForUpdate();
    window.addEventListener("focus", checkForUpdate);
    window.addEventListener("online", checkForUpdate);
    document.addEventListener("visibilitychange", checkForUpdate);
    window.setInterval(checkForUpdate, SW_UPDATE_INTERVAL_MS);
  },
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (isReloading) {
      return;
    }

    isReloading = true;
    window.location.reload();
  });
}
