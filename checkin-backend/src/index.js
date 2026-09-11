/**
 * ESP32 Konum Doğrulama - Check-in Backend
 * ------------------------------------------
 *
 * POST /checkin
 * Yeni check-in kaydı oluşturur.
 *
 * GET /checkins
 * Tüm check-in kayıtlarını listeler.
 *
 * GET /checkins?location_id=SUBE_1
 * Belirli konuma ait kayıtları listeler.
 *
 * GET /
 * API sağlık kontrolü.
 *
 * Cloudflare:
 * - Worker
 * - D1 Database
 * - D1 binding: DB
 */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Vary": "Origin",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      ...corsHeaders(),
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * ---------------------------------------------------------
     * CORS PREFLIGHT
     * ---------------------------------------------------------
     */
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    /*
     * ---------------------------------------------------------
     * GET /
     * API HEALTH CHECK
     * ---------------------------------------------------------
     */
    if (url.pathname === "/" && request.method === "GET") {
      return json({
        ok: true,
        service: "esp32-checkin-backend",
      });
    }

    /*
     * ---------------------------------------------------------
     * POST /checkin
     * ---------------------------------------------------------
     */
    if (url.pathname === "/checkin" && request.method === "POST") {
      let body;

      try {
        const raw = await request.text();

        if (!raw) {
          return json(
            {
              ok: false,
              error: "İstek gövdesi boş",
            },
            400
          );
        }

        body = JSON.parse(raw);
      } catch (error) {
        return json(
          {
            ok: false,
            error: "Geçersiz JSON",
          },
          400
        );
      }

      const employeeName = String(
        body?.employeeName || ""
      ).trim();

      const locationId = String(
        body?.locationId || ""
      ).trim();

      const source = String(
        body?.source || "unknown"
      ).trim();

      /*
       * Zorunlu alan kontrolü
       */
      if (!employeeName || !locationId) {
        return json(
          {
            ok: false,
            error:
              "employeeName ve locationId zorunlu",
          },
          400
        );
      }

      /*
       * D1'e kayıt
       */
      try {
        await env.DB.prepare(
          `
          INSERT INTO checkins
          (
            employee_name,
            location_id,
            source
          )
          VALUES (?, ?, ?)
          `
        )
          .bind(
            employeeName,
            locationId,
            source
          )
          .run();

        return json({
          ok: true,
          message: "Check-in başarıyla kaydedildi",
          employeeName,
          locationId,
          source,
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error:
              "Veritabanı hatası: " +
              error.message,
          },
          500
        );
      }
    }

    /*
     * ---------------------------------------------------------
     * GET /checkins
     * ---------------------------------------------------------
     */
    if (
      url.pathname === "/checkins" &&
      request.method === "GET"
    ) {
      const locationId =
        url.searchParams.get("location_id");

      try {
        let result;

        if (locationId) {
          result = await env.DB.prepare(
            `
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
            `
          )
            .bind(locationId)
            .all();
        } else {
          result = await env.DB.prepare(
            `
            SELECT
              id,
              employee_name,
              location_id,
              source,
              created_at
            FROM checkins
            ORDER BY created_at DESC
            LIMIT 200
            `
          ).all();
        }

        return json({
          ok: true,
          count: result.results.length,
          checkins: result.results,
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error:
              "Veritabanı hatası: " +
              error.message,
          },
          500
        );
      }
    }

    /*
     * ---------------------------------------------------------
     * 404
     * ---------------------------------------------------------
     */
    return json(
      {
        ok: false,
        error: "Endpoint bulunamadı",
        path: url.pathname,
        method: request.method,
      },
      404
    );
  },
};
