const { contextBridge } = require("electron");

// Expor APIs seguras para o renderer se necessário no futuro
contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
});
