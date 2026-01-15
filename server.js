{\rtf1\ansi\ansicpg1252\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\margl1440\margr1440\vieww16800\viewh9060\viewkind0
\pard\tx566\tx1133\tx1700\tx2267\tx2834\tx3401\tx3968\tx4535\tx5102\tx5669\tx6236\tx6803\pardirnatural\partightenfactor0

\f0\fs24 \cf0 import express from "express";\
import puppeteer from "puppeteer";\
\
const app = express();\
const PORT = process.env.PORT || 8080;\
\
// Si pones API_KEY en Cloud Run, quedar\'e1 protegido\
const API_KEY = process.env.API_KEY || "";\
\
function requireKey(req, res, next) \{\
  if (!API_KEY) return next(); // si no configuras API_KEY, queda abierto\
  const key = req.header("x-api-key") || "";\
  if (key !== API_KEY) return res.status(401).json(\{ error: "unauthorized" \});\
  next();\
\}\
\
app.get("/health", (_, res) => res.json(\{ ok: true \}));\
\
app.get("/tuboleta/events", requireKey, async (req, res) => \{\
  const url = req.query.url;\
  if (!url || typeof url !== "string") \{\
    return res.status(400).json(\{ error: "missing ?url=" \});\
  \}\
\
  const browser = await puppeteer.launch(\{\
    headless: "new",\
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],\
  \});\
\
  try \{\
    const page = await browser.newPage();\
    await page.setUserAgent(\
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"\
    );\
\
    await page.goto(url, \{ waitUntil: "networkidle2", timeout: 60000 \});\
    await page.waitForTimeout(2000);\
\
    const events = await page.evaluate(() => \{\
      const norm = (s) => (s || "").replace(/\\s+/g, " ").trim();\
\
      const links = Array.from(document.querySelectorAll("a[href]"))\
        .filter(a => /\\/event\\//i.test(a.getAttribute("href") || "") || /events\\/view/i.test(a.getAttribute("href") || ""));\
\
      const items = links.map(a => \{\
        const card = a.closest("article, li, div, section") || a.parentElement;\
        const text = norm(card?.innerText || a.innerText || "");\
        const lines = text.split("\\n").map(norm).filter(Boolean);\
\
        const cityGuess = lines.find(l => l.length <= 30) || "";\
        const titleGuess =\
          lines.find(l => l.length >= 3 && l.length <= 80 && !/^\\d/.test(l) &&\
            !/lunes|martes|mi\'e9rcoles|miercoles|jueves|viernes|s\'e1bado|sabado|domingo/i.test(l)) ||\
          lines[0] || "";\
\
        const dateGuess =\
          lines.find(l => /\\b(20\\d\{2\})\\b/.test(l) &&\
            /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/i.test(l)) ||\
          "";\
\
        const venueGuess = lines.length >= 2 ? lines[lines.length - 1] : "";\
\
        return \{\
          urlOfficial: a.href,\
          name: norm(titleGuess),\
          city: norm(cityGuess),\
          rawDateText: norm(dateGuess),\
          venue: norm(venueGuess)\
        \};\
      \});\
\
      const seen = new Set();\
      return items.filter(x => \{\
        if (!x.urlOfficial) return false;\
        if (seen.has(x.urlOfficial)) return false;\
        seen.add(x.urlOfficial);\
        return true;\
      \});\
    \});\
\
    res.json(\{ sourceUrl: url, count: events.length, events \});\
  \} catch (e) \{\
    res.status(500).json(\{ error: e.message || String(e) \});\
  \} finally \{\
    await browser.close();\
  \}\
\});\
\
app.listen(PORT, () => console.log(`Listening on $\{PORT\}`));\
}