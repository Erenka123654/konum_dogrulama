/* Fixed ESP32 position supplied by the site owner. Distance is informational only. */
(() => {
  "use strict";
  const target = { latitude: 36.547098, longitude: 31.994394 };
  const button = document.getElementById("distanceButton");
  const value = document.getElementById("distanceValue");
  const detail = document.getElementById("distanceDetail");
  let watchId = null;
  let expiry = null;
  let generation = 0;

  function distanceMeters(latitude, longitude) {
    const rad = degrees => degrees * Math.PI / 180;
    const a = Math.sin(rad(target.latitude - latitude) / 2) ** 2 +
      Math.cos(rad(latitude)) * Math.cos(rad(target.latitude)) *
      Math.sin(rad(target.longitude - longitude) / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
  }

  function stop() {
    generation++;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    clearTimeout(expiry);
    button.textContent = "Mesafeyi göster";
  }

  function unavailable(message) {
    value.textContent = "Mesafe ölçülemedi";
    detail.textContent = message;
  }

  button.addEventListener("click", () => {
    if (watchId !== null) {
      stop();
      value.textContent = "Ölçüm durduruldu";
      detail.textContent = "Yeniden ölçmek için Mesafeyi göster düğmesine basın.";
      return;
    }
    if (!window.isSecureContext) {
      unavailable("Konum erişimi için sayfayı HTTPS üzerinden açın.");
      return;
    }
    if (!navigator.geolocation) {
      unavailable("Bu tarayıcı konum erişimini desteklemiyor.");
      return;
    }
    const session = ++generation;
    value.textContent = "Konum alınıyor…";
    detail.textContent = "Telefonunuzun konum erişimine izin verin.";
    button.textContent = "Ölçümü durdur";
    try {
      watchId = navigator.geolocation.watchPosition(position => {
        if (session !== generation) return;
        clearTimeout(expiry);
        const { latitude, longitude, accuracy } = position.coords;
        const age = Date.now() - position.timestamp;
        if (![latitude, longitude, accuracy, age].every(Number.isFinite) ||
            Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0 || age > 30000) {
          unavailable("Güncel ve geçerli konum bekleniyor…");
          return;
        }
        const meters = distanceMeters(latitude, longitude);
        value.textContent = "Yaklaşık " + Math.round(meters).toLocaleString("tr-TR") + " metre";
        detail.textContent = "Konum doğruluğu: ±" + Math.ceil(accuracy).toLocaleString("tr-TR") +
          " m · Güncelleme: " + new Date(position.timestamp).toLocaleTimeString("tr-TR") +
          (meters <= accuracy ? " · Mesafe, konum belirsizliği içinde; çok yakın mesafe ayırt edilemiyor." : "");
        expiry = setTimeout(() => {
          unavailable("Konum bilgisi güncelliğini yitirdi. Yeni ölçüm bekleniyor…");
        }, Math.max(0, 30000 - age));
      }, error => {
        if (session !== generation) return;
        stop();
        const messages = {
          1: "Konum izni verilmedi. Tarayıcı ayarlarından izin verip tekrar deneyin.",
          2: "Konum bulunamadı. Telefonun konumunu açıp tekrar deneyin.",
          3: "Konum alma süresi doldu. Açık bir alanda tekrar deneyin."
        };
        unavailable(messages[error.code] || "Konum alınamadı. Tekrar deneyin.");
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    } catch {
      stop();
      unavailable("Konum erişimi başlatılamadı. Tarayıcı izinlerini kontrol edin.");
    }
  });

  document.getElementById("resetButton")?.addEventListener("click", () => {
    stop();
    value.textContent = "Henüz ölçülmedi";
    detail.textContent = "Mesafeyi görmek için konum erişimine izin verin.";
  });
  window.addEventListener("pagehide", () => {
    stop();
    value.textContent = "Henüz ölçülmedi";
    detail.textContent = "Mesafeyi görmek için ölçümü başlatın.";
  });
})();
