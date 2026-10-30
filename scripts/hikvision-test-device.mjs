import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";

// Synthetic fixture only. Never reads or writes the physical terminal.
export const fixtureLogin = {
  username: "fixture-admin",
  password: "fixture-only-secret",
};
const md5 = (text) => createHash("md5").update(text).digest("hex");

export async function createTestDevice({ userCount = 123, extension } = {}) {
  const realm = "Hikvision fixture";
  const nonce = randomUUID();
  const requests = [];
  const users = Array.from({ length: userCount }, (_, index) => ({
    employeeNo: String(index + 1),
    name: index === 0 ? "mk" : index === 1 ? "yousef" : `fixture-${index + 1}`,
  }));
  const events = Array.from({ length: 57 }, (_, index) => ({
    major: index < 30 ? 3 : 5,
    minor: index < 30 ? 113 : index === 50 ? 3 : index === 51 ? 113 : 38,
    employeeNoString: String((index % 2) + 1),
    time: `2026-10-21T08:${String(index).padStart(2, "0")}:15+02:00`,
  }));
  events[56] = { ...events[55] };
  const server = createServer(async (req, res) => {
    try {
      const auth = req.headers.authorization || "";
      const fields = Object.fromEntries(
        [...auth.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)].map((m) => [
          m[1],
          m[2] ?? m[3],
        ]),
      );
      const ha1 = md5(
        `${fixtureLogin.username}:${realm}:${fixtureLogin.password}`,
      );
      const ha2 = md5(`${req.method}:${req.url}`);
      const expected = md5(
        `${ha1}:${nonce}:${fields.nc}:${fields.cnonce}:auth:${ha2}`,
      );
      if (
        !auth.startsWith("Digest ") ||
        fields.username !== fixtureLogin.username ||
        fields.nonce !== nonce ||
        fields.uri !== req.url ||
        fields.response !== expected
      ) {
        res.writeHead(401, {
          "WWW-Authenticate": `Digest realm="${realm}", nonce="${nonce}", qop="auth", algorithm=MD5`,
        });
        res.end();
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const rawBody = Buffer.concat(chunks);
      const text = rawBody.toString("utf8");
      const body = text
        ? text.trim().startsWith("{")
          ? JSON.parse(text)
          : { xml: text }
        : {};
      requests.push({ method: req.method, path: req.url, body });
      res.setHeader("Content-Type", "application/json");
      if (
        extension &&
        (await extension({ req, res, body, rawBody, users, events, requests }))
      )
        return;
      if (req.method === "GET" && req.url === "/ISAPI/System/deviceInfo") {
        res.end(
          JSON.stringify({
            DeviceInfo: {
              deviceName: "جهاز اختبار محلي",
              model: "DS-K1A340WX fixture",
            },
          }),
        );
      } else if (
        req.method === "POST" &&
        req.url === "/ISAPI/AccessControl/UserInfo/Search?format=json"
      ) {
        const { searchResultPosition: pos, maxResults } =
          body.UserInfoSearchCond;
        const page = users.slice(pos, pos + maxResults);
        res.end(
          JSON.stringify({
            UserInfoSearch: {
              responseStatusStrg:
                pos + page.length < users.length ? "MORE" : "OK",
              numOfMatches: page.length,
              totalMatches: users.length,
              UserInfo: page,
            },
          }),
        );
      } else if (
        req.method === "POST" &&
        req.url === "/ISAPI/AccessControl/AcsEvent?format=json"
      ) {
        const { searchResultPosition: pos, maxResults } = body.AcsEventCond;
        const page = events.slice(pos, pos + maxResults);
        res.end(
          JSON.stringify({
            AcsEvent: {
              responseStatusStrg:
                pos + page.length < events.length ? "MORE" : "OK",
              numOfMatches: page.length,
              totalMatches: events.length,
              InfoList: page,
            },
          }),
        );
      } else {
        res.statusCode = 405;
        res.end(JSON.stringify({ statusString: "Unexpected fixture request" }));
      }
    } catch {
      res.statusCode = 500;
      res.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "0.0.0.0", resolve);
  });
  const host = Object.values(networkInterfaces())
    .flat()
    .find((item) => item && !item.internal && item.family === "IPv4")?.address;
  if (!host) {
    server.close();
    throw new Error("No LAN interface for Digest fixture test");
  }
  return {
    link: { host, port: server.address().port, https: false, ...fixtureLogin },
    requests,
    users,
    events,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
