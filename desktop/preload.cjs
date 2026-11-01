const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('zubaydDesktop',{
 info:()=>ipcRenderer.invoke('zubayd:info'),
 chooseDataFolder:()=>ipcRenderer.invoke('zubayd:folder'),
 setup:input=>ipcRenderer.invoke('zubayd:setup',input),
 maintenance:()=>ipcRenderer.invoke('zubayd:maintenance'),
 backup:input=>ipcRenderer.invoke('zubayd:backup',input),
 restore:input=>ipcRenderer.invoke('zubayd:restore',input),
 connection:input=>ipcRenderer.invoke('zubayd:connection',input),
 savePdf:input=>ipcRenderer.invoke('zubayd:pdf',input),
});
