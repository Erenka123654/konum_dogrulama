const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Vary": "Origin",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // API sağlık kontrolü
    if (method === "GET" && url.pathname === "/") {
      return json({
        ok: true,
        service: "esp32-checkin-backend",
        version: "1.0.0",
      });
    }

    // Check-in oluştur
    if (method === "POST" && url.pathname === "/checkin") {
      try {
        let body;

        try {
          body = JSON.parse(await request.text());
        } catch {
          return json(
            { ok: false, error: "Geçersiz JSON verisi" },
            400
          );
        }

        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return json(
            { ok: false, error: "JSON verisi bir nesne olmalıdır" },
            400
          );
        }

        const employeeName =
          typeof body.employeeName === "string"
            ? body.employeeName.trim()
            : "";

        const locationId =
          typeof body.locationId === "string"
            ? body.locationId.trim()
            : "";

        const source =
          typeof body.source === "string" && body.source.trim()
            ? body.source.trim()
            : "unknown";

        if (!employeeName) {
          return json(
            { ok: false, error: "employeeName zorunludur" },
            400
          );
        }

        if (!locationId) {
          return json(
            { ok: false, error: "locationId zorunludur" },
            400
          );
        }

        if (!env.DB) {
          return json(
            { ok: false, error: "D1 veritabanı bağlantısı eksik: DB" },
            500
          );
        }

        await env.DB.prepare(`
          INSERT INTO checkins (
            employee_name,
            location_id,
            source,
            created_at
          )
          VALUES (?, ?, ?, datetime('now'))
        `)
          .bind(employeeName, locationId, source)
          .run();

        return json({
          ok: true,
          message: "Check-in başarıyla kaydedildi",
          employeeName,
          locationId,
          source,
        });
      } catch (error) {
        console.error("CHECKIN ERROR:", error);

        return json(
          { ok: false, error: "Check-in kaydedilemedi" },
          500
        );
      }
    }

    // Check-in kayıtlarını getir
    if (method === "GET" && url.pathname === "/checkins") {
      try {
        if (!env.DB) {
          return json(
            { ok: false, error: "D1 veritabanı bağlantısı eksik: DB" },
            500
          );
        }

        const locationId = url.searchParams.get("location_id");
        let result;

        if (locationId) {
          result = await env.DB.prepare(`
            SELECT
              id,
              employee_name,
              location_id,
              source,
              created_at
            FROM checkins
            WHERE location_id = ?
            ORDER BY created_at DESC
            LIMIT 200
          `)
            .bind(locationId)
            .all();
        } else {
          result = await env.DB.prepare(`
            SELECT
              id,
              employee_name,
              location_id,
              source,
              created_at
            FROM checkins
            ORDER BY created_at DESC
            LIMIT 200
          `).all();
        }

        return json({
          ok: true,
          count: result.results?.length || 0,
          checkins: result.results || [],
        });
      } catch (error) {
        console.error("CHECKINS ERROR:", error);

        return json(
          { ok: false, error: "Check-in kayıtları alınamadı" },
          500
        );
      }
    }

    return json(
      {
        ok: false,
        error: "Endpoint bulunamadı",
        method,
        path: url.pathname,
      },
      404
    );
  },
};
