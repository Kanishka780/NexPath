require("dotenv").config();
const fetch = require("node-fetch");

const key = process.env.GEMINI_API_KEY;
console.log("Key loaded:", key ? key.slice(0, 10) + "..." : "MISSING");

const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" + key;

fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    contents: [{ parts: [{ text: "Say hello in one sentence." }] }],
  }),
})
  .then((r) => r.text())
  .then((text) => {
    console.log("RAW RESPONSE:");
    console.log(text);
  })
  .catch((err) => {
    console.error("FETCH FAILED:", err);
  });