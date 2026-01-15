const express = require("express");
const puppeteer = require("puppeteer-core");
const fs = require("fs");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY || "";

// auth opcional
function requireKey(req, res, next) {
  if (!API_KEY) return next();
  const key = req.header("x-api-key") || req.header("X-Api-Key") || "";
  if (key !== API_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
}

function pickChromePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
}

app.get("/health", (_, res) => res.json({ ok: true }));

app.get("/tuboleta/events", requireKey, async (req, res) => {
  const listUrl = String(req.query.url || "");
  if (!listUrl || !/^https?:\/\//i.test(listUrl)) {
    return res.status(400).json({ error: "missing or invalid ?url=" });
  }

  const executablePath = pickChromePath();
  if (!executablePath) {
    return res.status(500).json({ error: "No Chrome/Chromium executable found in container." });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    );

    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(30000);

    await page.goto(listUrl, { waitUntil: "networkidle2" });
    await page.waitForTimeout(1500);

    const events = await page.evaluate(() => {
      const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
      const looksLikeEventHref = (href) => {
        const h = String(href || "").toLowerCase();
        return h.includes("/event/") || h.includes("/events/") || h.includes("event=");
      };

      const anchors = Array.from(document.querySelectorAll("a[href]")).filter((a) =>
        looksLikeEventHref(a.getAttribute("href"))
      );

      const items = anchors.map((a) => {
        const href = a.href;
        const card = a.closest("article, li, div, section") || a.parentElement;
        const text = norm(card?.innerText || a.innerText || "");
        const lines = text.split("\n").map(norm).filter(Boolean);

        const city = lines.find((l) => l.length <= 40) || "";
        const name = lines.find((l) => l.length >= 3 && l.length <= 120) || lines[0] || "";
        const rawDateText =
          lines.find((l) => /\b(20\d{2})\b/.test(l) && /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/i.test(l)) || "";
        const venue = lines.length ? lines[lines.length - 1] : "";

        return { urlOfficial: href, name, city, rawDateText, venue };
      });

      const seen = new Set();
      return items.filter((x) => x.urlOfficial && !seen.has(x.urlOfficial) && (seen.add(x.urlOfficial), true));
    });

    res.json({ sourceUrl: listUrl, count: events.length, events });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Listening on ${PORT}`);
});
