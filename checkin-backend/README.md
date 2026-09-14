# Cloudflare referans sunucu

Kurulum ve devir talimatları üst dizindeki [README](../README.md) ve [Bilgi İşlem teslim belgesindedir](../docs/BILGI_ISLEM_TESLIM.md).

`schema.sql` yalnızca eski test sürümünün tablosudur. Yeni uygulama için `migrations/0001_secure_checkin.sql` Wrangler migration ile uygulanır. Eski `/checkin` ve `/checkins` yolları kapalıdır. Yeni `/api/*` uçları oturum doğrulaması gerektirir. Anahtarlar Worker secret olarak `DEVICE_KEYS` içinde tutulur; kaynak dosyaya eklenmez.
