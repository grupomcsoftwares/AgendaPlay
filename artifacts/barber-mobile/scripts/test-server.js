const http = require("http");
const PORT = parseInt(process.env.PORT || "23260", 10);
console.log("ENV PORT =", process.env.PORT, "=> binding", PORT);
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ok");
});
server.listen(PORT, () => {
  console.log(`[test] listening on port ${PORT}`);
});
server.on("error", (err) => {
  console.error("Server error:", err.message);
  process.exit(1);
});
