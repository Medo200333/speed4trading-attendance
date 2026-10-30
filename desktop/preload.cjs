const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("speed", {
  probe: (link) => ipcRenderer.invoke("speed:probe", link),
  pull: (link) => ipcRenderer.invoke("speed:pull", link),
  door: (link) => ipcRenderer.invoke("speed:door", link),
});
