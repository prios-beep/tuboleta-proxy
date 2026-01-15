import express from "express";
import puppeteer from "puppeteer-core";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Si defines API_KEY en Cloud Run, el endpoint queda protegido.
// Si NO defines API_KEY, queda abierto (no recomendado).
const API_KEY = process.env.API_KEY || "";

function requireKey(req, res, next) {
  if (!API_KEY) return next();
  const key = req.header("x-api-key") || req.header("X-Api-Key") || "";
  if (key !== API_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
}

function norm(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function isValidHttpUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "http:" || x.protocol === "https:";
  } catch (_) {
    return false;
  }
}

// Heurística flexible para detectar links de eventos
function looksLikeEventHref(href) {
  const h = (href || "").toLowerCase();
  return h.includes("/event/") || h.includes("/events/") || h.includes("event=");
}

app.get("/health", (_, res) => res.json({ ok: true }));

/**
 * GET /tuboleta/events?url=<url listado>
 * Devuelve { sourceUrl, count, events: [{name, city, venue, rawDateText, urlOfficial}] }
 */
app.get("/tuboleta/events", requireKey, async (req, res) => {
  const listUrl = req.query.url;

  if (!listUrl || typeof listUrl !== "string" || !isValidHttpUrl(listUrl)) {
    return res.status(400).json({ error: "missing or invalid ?url=" });
  }

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROME_BIN ||
    "/usr/bin/chromium";

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process"
    ],
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    );

    // Timeouts razonables
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(30000);

    await page.goto(listUrl, { waitUntil: "networkidle2" });
    await page.waitForTimeout(2000);

    // Extrae eventos desde el DOM (heurístico, ajustable)
    const events = await page.evaluate(() => {
      const norm2 = (s) => String(s || "").replace(/\s+/g, " ").trim();

      const looksLikeEventHref2 = (href) => {
        const h = String(href || "").toLowerCase();
        return h.includes("/event/") || h.includes("/events/") || h.includes("event=");
      };

      const anchors = Array.from(document.querySelectorAll("a[href]"))
        .filter(a => looksLikeEventHref2(a.getAttribute("href")));

      const items = anchors.map(a => {
        const href = a.href;
        const card = a.closest("article, li, div, section") || a.parentElement;
        const text = norm2(card?.innerText || a.innerText || "");
        const lines = text.split("\n").map(norm2).filter(Boolean);

        // Heurísticas (muy generales)
        const cityGuess = lines.find(l => l.length <= 40) || "";
        const titleGuess =
          lines.find(l => l.length >= 3 && l.length <= 120 && !/^\d/.test(l)) ||
          lines[0] || "";

        const dateGuess =
          lines.find(l =>
            /\b(20\d{2})\b/.test(l) &&
            /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(l)
          ) || "";

        const venueGuess = lines.length >= 2 ? lines[lines.length - 1] : "";

        return {
          urlOfficial: href,
          name: norm2(titleGuess),
          city: norm2(cityGuess),
          rawDateText: norm2(dateGuess),
          venue: norm2(venueGuess)
        };
      });

      // Dedupe por url
      const seen = new Set();
      return items.filter(x => {
        if (!x.urlOfficial || x.urlOfficial.length < 8) return false;
        if (seen.has(x.urlOfficial)) return false;
        seen.add(x.urlOfficial);
        return true;
      });
    });

    res.json({
      sourceUrl: listUrl,
      count: Array.isArray(events) ? events.length : 0,
      events: Array.isArray(events) ? events : []
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  } finally {
    await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});

\
app.listen(PORT, () => console.log(`Listening on $\{PORT\}`));\
}
