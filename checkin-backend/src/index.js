/**
 * ESP32 Konum Doğrulama - Check-in Backend
 * ------------------------------------------
 * Endpoints:
 *   POST /checkin        -> yeni check-in kaydı ekler (ESP32'den gelir)
 *   GET  /checkins        -> tüm kayıtları listeler (yönetici görünümü)
 *   GET  /checkins?location_id=SUBE_1 -> konuma göre filtreler
 *
 * D1 binding adı: DB (wrangler.toml içinde tanımlı)
 */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // ---- POST /checkin ----
    if (url.pathname === "/checkin" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ ok: false, error: "Geçersiz JSON" }, 400);
      }

      const employeeName = (body.employeeName || "").trim();
      const locationId = (body.locationId || "").trim();
      const source = (body.source || "unknown").trim();

      if (!employeeName || !locationId) {
        return json({ ok: false, error: "employeeName ve locationId zorunlu" }, 400);
      }

      try {
        await env.DB.prepare(
          "INSERT INTO checkins (employee_name, location_id, source) VALUES (?, ?, ?)"
        )
          .bind(employeeName, locationId, source)
          .run();

        return json({ ok: true });
      } catch (e) {
        return json({ ok: false, error: "Veritabanı hatası: " + e.message }, 500);
      }
    }

    // ---- GET /checkins ----
    if (url.pathname === "/checkins" && request.method === "GET") {
      const locationId = url.searchParams.get("location_id");

      try {
        let result;
        if (locationId) {
          result = await env.DB.prepare(
            "SELECT * FROM checkins WHERE location_id = ? ORDER BY created_at DESC LIMIT 200"
          )
            .bind(locationId)
            .all();
        } else {
          result = await env.DB.prepare(
            "SELECT * FROM checkins ORDER BY created_at DESC LIMIT 200"
          ).all();
        }

        return json({ ok: true, checkins: result.results });
      } catch (e) {
        return json({ ok: false, error: "Veritabanı hatası: " + e.message }, 500);
      }
    }

    return json({ ok: false, error: "Bulunamadı" }, 404);
  },
};
