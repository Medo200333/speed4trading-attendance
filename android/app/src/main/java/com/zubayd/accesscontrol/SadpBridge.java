package com.zubayd.accesscontrol;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.webkit.JavascriptInterface;
import java.net.DatagramPacket;
import java.net.InetAddress;
import java.net.MulticastSocket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/** Read-only SADP-compatible discovery exposed to the trusted server page as window.ZubaydSadp. */
final class SadpBridge {
  private final Context context;
  SadpBridge(Context context) { this.context = context.getApplicationContext(); }

  static String tag(String xml, String name) {
    Matcher m = Pattern.compile("<" + name + ">([^<]*)</" + name + ">").matcher(xml);
    return m.find() ? m.group(1).trim() : "";
  }
  static boolean isPrivate(String ip) {
    String[] p = ip.split("\\.");
    if (p.length != 4) return false;
    try {
      int a = Integer.parseInt(p[0]), b = Integer.parseInt(p[1]);
      return a == 10 || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168) || (a == 100 && b >= 64 && b <= 127);
    } catch (NumberFormatException e) { return false; }
  }

  @JavascriptInterface
  public String scan() {
    Map<String, JSONObject> found = new LinkedHashMap<>();
    WifiManager wifi = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
    WifiManager.MulticastLock lock = wifi == null ? null : wifi.createMulticastLock("zubayd-sadp");
    MulticastSocket socket = null;
    try {
      if (lock != null) { lock.setReferenceCounted(false); lock.acquire(); }
      socket = new MulticastSocket();
      socket.setSoTimeout(400);
      InetAddress group = InetAddress.getByName("239.255.255.250");
      byte[] probe = ("<?xml version=\"1.0\" encoding=\"utf-8\"?><Probe><Uuid>" + UUID.randomUUID().toString().toUpperCase() + "</Uuid><Types>inquiry</Types></Probe>").getBytes(StandardCharsets.UTF_8);
      long end = System.currentTimeMillis() + 3000;
      boolean resent = false;
      socket.send(new DatagramPacket(probe, probe.length, group, 37020));
      byte[] buffer = new byte[8192];
      while (System.currentTimeMillis() < end) {
        if (!resent && System.currentTimeMillis() > end - 2300) { socket.send(new DatagramPacket(probe, probe.length, group, 37020)); resent = true; }
        DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
        try { socket.receive(packet); } catch (SocketTimeoutException e) { continue; }
        String xml = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);
        if (!xml.contains("<ProbeMatch")) continue;
        String ip = tag(xml, "IPv4Address");
        if (ip.isEmpty()) ip = packet.getAddress().getHostAddress();
        if (!isPrivate(ip)) continue;
        int port; try { port = Integer.parseInt(tag(xml, "HttpPort")); } catch (NumberFormatException e) { port = 80; }
        String act = tag(xml, "Activated").toLowerCase();
        JSONObject row = new JSONObject();
        String model = tag(xml, "DeviceDescription");
        row.put("source", "sadp").put("model", model.isEmpty() ? tag(xml, "DeviceType") : model).put("ip", ip)
          .put("httpPort", port > 0 && port < 65536 ? port : 80).put("mac", tag(xml, "MAC").toLowerCase())
          .put("serial", tag(xml, "DeviceSN")).put("firmware", tag(xml, "SoftwareVersion"))
          .put("activated", act.equals("true") ? Boolean.TRUE : act.equals("false") ? Boolean.FALSE : JSONObject.NULL);
        found.put(row.optString("mac", ip).isEmpty() ? ip : row.optString("mac"), row);
      }
    } catch (Exception ignored) {
    } finally {
      if (socket != null) socket.close();
      if (lock != null && lock.isHeld()) lock.release();
    }
    JSONArray out = new JSONArray();
    for (JSONObject row : found.values()) out.put(row);
    return out.toString();
  }
}
