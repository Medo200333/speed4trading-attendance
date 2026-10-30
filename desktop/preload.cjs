const { contextBridge, ipcRenderer } = require("electron");
const zlib = require("zlib");

function unpack(payload) {
  if (!payload || typeof payload.gzip !== "string") return payload;
  return JSON.parse(zlib.gunzipSync(Buffer.from(payload.gzip, "base64")).toString("utf8"));
}

contextBridge.exposeInMainWorld("speed", {
  probe: (link) => ipcRenderer.invoke("speed:probe", link),
  pull: (link) => ipcRenderer.invoke("speed:pull", link),
  door: (link) => ipcRenderer.invoke("speed:door", link),
  cloudLogin: (input) => ipcRenderer.invoke("speed:cloudLogin", input),
  openSite: () => ipcRenderer.invoke("speed:openSite"),
  takeSite: () => ipcRenderer.invoke("speed:takeSite"),
  cloudMap: async (input) => unpack(await ipcRenderer.invoke("speed:cloudMap", input)),
  cloudPull: async (input) => unpack(await ipcRenderer.invoke("speed:cloudPull", input)),
});