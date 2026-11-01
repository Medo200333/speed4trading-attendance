import { createTestDevice } from "./hikvision-test-device.mjs";
export async function createAccessFixture() {
  const cards = [
    { employeeNo: "1", cardNo: "1234567890", cardType: "normalCard" },
  ];
  const mutations = [];
  const faults = {
    emptyUserCapabilities: false,
    eventCapabilitiesMissing: false,
    requireEventOffset: false,
    eventXml: false,
    eventStringCounts: false,
    repeatedEventPage: false,
    brokenEventCount: false,
    userSearchFailure: false,
    rejectFractionalEventTime: false,
    eventMaxResults: 30,
    rejectEventPictureFlag: false,
    rejectEventMajorZero: false,
    eventLocalTimeOnly: false,
    eventForce400: false,
    eventFailLaterPage: false,
    eventErrorXml: false,
    rejectEventTimeFilters: false,
    capability401: false,
    // Real terminals answer /ISAPI/System/time in XML; `clock.zone` is the zone they report.
    timeXml: false,
  };
  const clock = { zone: "CST-3:00:00", iana: "Asia/Shanghai" };
  const weekPlans = new Map([
    [
      1,
      {
        enable: true,
        WeekPlanCfg: [
          {
            week: "Monday",
            id: 1,
            enable: true,
            TimeSegment: { beginTime: "08:00:00", endTime: "17:00:00" },
          },
        ],
      },
    ],
  ]);
  let initialized = false;
  const device = await createTestDevice({
    userCount: 2,
    extension: async ({ req, res, body, users, events }) => {
      if (!initialized) {
        for (const user of users)
          Object.assign(user, {
            userType: "normal",
            Valid: {
              enable: true,
              beginTime: "2015-01-01T00:00:00",
              endTime: "2037-12-31T23:59:59",
              timeType: "local",
            },
            doorRight: "1",
            RightPlan: [{ doorNo: 1, planTemplateNo: "1" }],
            numOfFP: 0,
            numOfCard: 1,
            numOfFace: 0,
          });
        events.forEach((event, index) => {
          event.time = event.time
            .replace("2026-10-21", "2015-01-01")
            .replace("+02:00", "+08:00");
          event.serialNo = index === 56 ? 56 : index + 1;
        });
        initialized = true;
      }
      const url = new URL(req.url, "http://fixture");
      const path = url.pathname;
      const json = (data) => {
        res.end(JSON.stringify(data));
        return true;
      };
      const ok = () =>
        json({ statusCode: 1, statusString: "OK", subStatusCode: "ok" });
      if (
        faults.eventCapabilitiesMissing &&
        req.method === "GET" &&
        path === "/ISAPI/AccessControl/AcsEvent/capabilities"
      ) {
        res.statusCode = 404;
        return json({ statusCode: 4, subStatusCode: "notSupport" });
      }
      if (
        faults.emptyUserCapabilities &&
        req.method === "GET" &&
        path === "/ISAPI/AccessControl/UserInfo/capabilities"
      )
        return ok();
      if (req.method === "GET" && path === "/ISAPI/System/deviceInfo")
        return json({
          DeviceInfo: {
            deviceName: "جهاز محاكاة فقط",
            model: "DS-K1A340WX fixture",
            firmwareVersion: "V1.2.7 fixture",
            manufacturer: "Hikvision fixture",
            deviceType: "ACS fixture",
            firmwareReleasedDate: "2023-09-27",
            serialNumber: "FIXTURE-ONLY-001",
          },
        });
      if (
        req.method === "GET" &&
        path === "/ISAPI/AccessControl/UserInfo/Count"
      )
        return json({ UserInfoCount: { userNumber: users.length } });
      if (req.method === "GET" && path === "/ISAPI/AccessControl/capabilities")
        return json({
          AccessControl: {
            isSupportUserInfo: true,
            isSupportCardInfo: true,
            isSupportUserInfoDetailDelete: true,
            isSupportAcsEvent: true,
            isSupportDoorCfg: true,
            isSupportRemoteControlDoor: true,
            isSupportAcsWorkStatus: true,
            isSupportFingerPrintCfg: false,
            isSupportCaptureFingerPrint: false,
            isSupportFDLib: false,
            isSupportCardRightWeekPlanCfg: true,
            isSupportUserRightPlanTemplate: true,
          },
        });
      if (
        req.method === "GET" &&
        path === "/ISAPI/AccessControl/UserInfo/capabilities"
      )
        return json({
          UserInfoCap: {
            supportFunction: "get,post,put,setUp",
            maxRecordNum: 3000,
            employeeNo: { "@max": 32 },
            name: { "@max": 64 },
            password: { "@max": 6 },
            Valid: { enable: "true,false" },
            RightPlan: { maxSize: 1, doorNo: { "@min": 1, "@max": 1 } },
          },
        });
      if (
        req.method === "GET" &&
        path === "/ISAPI/AccessControl/CardInfo/capabilities"
      )
        return json({
          CardInfoCap: {
            supportFunction: "get,post,put,delete",
            numberPerPerson: 5,
            cardNo: { "@max": 32 },
          },
        });
      if (
        req.method === "GET" &&
        path === "/ISAPI/AccessControl/RemoteControl/door/capabilities"
      )
        return json({
          RemoteControlDoor: {
            cmd: { "@opt": ["open", "close", "alwaysOpen", "alwaysClose"] },
          },
        });
      if (req.method === "GET" && path === "/ISAPI/AccessControl/AcsWorkStatus")
        return json({
          AcsWorkStatus: {
            doorStatus: [4],
            magneticStatus: [0],
            cardReaderOnlineStatus: [1],
          },
        });
      if (
        req.method === "GET" &&
        path === "/ISAPI/AccessControl/UserRightWeekPlanCfg/capabilities"
      )
        return json({
          UserRightWeekPlanCfg: {
            planNo: { "@min": 1, "@max": 16 },
            WeekPlanCfg: { maxSize: 56, id: { "@min": 1, "@max": 8 } },
          },
        });
      if (
        req.method === "GET" &&
        path === "/ISAPI/AccessControl/AcsEvent/capabilities"
      )
        return json({
          AcsEvent: {
            searchResultPosition: { "@min": 0, "@max": 100000 },
            maxResults: { "@min": 1, "@max": 30 },
          },
        });
      if (faults.capability401 && path === "/ISAPI/AccessControl/UserRightPlanTemplate/capabilities") {
        // Real DS-K1T firmware: 401 without a new challenge on a path it does not expose.
        res.statusCode = 401;
        return res.end();
      }
      if (
        req.method === "GET" &&
        [
          "/ISAPI/AccessControl/AcsWorkStatus/capabilities",
          "/ISAPI/AccessControl/UserRightPlanTemplate/capabilities",
        ].includes(path)
      )
        return json({
          Capability: { supportFunction: "get,put", maxRecordNum: 16 },
        });
      if (faults.timeXml && path === "/ISAPI/System/time") {
        res.setHeader("Content-Type", "application/xml");
        if (req.method === "PUT") {
          mutations.push({ path, method: req.method, body });
          const zone = /<timeZone>([^<]*)<\/timeZone>/.exec(body.xml || "")?.[1];
          if (!zone) { res.statusCode = 400; res.end("<ResponseStatus><statusCode>4</statusCode></ResponseStatus>"); return true; }
          clock.zone = zone;
          clock.iana = /<IANA>([^<]*)<\/IANA>/.exec(body.xml)?.[1] || "";
          res.end('<?xml version="1.0" encoding="UTF-8"?>\n<ResponseStatus version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><requestURL>/ISAPI/System/time</requestURL><statusCode>1</statusCode><statusString>OK</statusString><subStatusCode>ok</subStatusCode></ResponseStatus>');
          return true;
        }
        res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<Time version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">\n<timeMode>manual</timeMode>\n<localTime>2026-11-01T15:03:33+03:00</localTime>\n<timeZone>${clock.zone}</timeZone>\n${clock.iana ? `<IANA>${clock.iana}</IANA>\n` : ""}</Time>\n`);
        return true;
      }
      if (req.method === "GET" && path === "/ISAPI/System/time")
        return json({
          Time: {
            timeMode: "manual",
            localTime: new Date().toISOString(),
            timeZone: "CST-2:00:00",
          },
        });
      if (
        req.method === "GET" &&
        path === "/ISAPI/AccessControl/UserRightPlanTemplate/1"
      )
        return json({
          UserRightPlanTemplate: {
            enable: true,
            templateName: "Fixture",
            weekPlanNo: 1,
            holidayGroupNo: "",
          },
        });
      if (
        req.method === "GET" &&
        path === "/ISAPI/AccessControl/UserRightWeekPlanCfg/1"
      )
        return json({ UserRightWeekPlanCfg: weekPlans.get(1) });
      if (req.method === "GET" && path.endsWith("UserInfoDetail/DeleteProcess"))
        return json({ UserInfoDetailDeleteProcess: { status: "success" } });
      if (req.method === "POST" && path.endsWith("UserInfo/Search")) {
        if (faults.userSearchFailure) {
          res.statusCode = 403;
          return json({ statusCode: 4 });
        }
        const condition = body.UserInfoSearchCond;
        const filtered = condition.EmployeeNoList
          ? users.filter((user) =>
              condition.EmployeeNoList.some(
                (filter) => filter.employeeNo === user.employeeNo,
              ),
            )
          : users;
        const pos = condition.searchResultPosition,
          page = filtered.slice(pos, pos + condition.maxResults);
        return json({
          UserInfoSearch: {
            responseStatusStrg:
              pos + page.length < filtered.length ? "MORE" : "OK",
            numOfMatches: page.length,
            totalMatches: filtered.length,
            UserInfo: page,
          },
        });
      }
      if (req.method === "POST" && path.endsWith("AcsEvent")) {
        const condition = body.AcsEventCond;
        const reject = (message) => {
          res.statusCode = 400;
          if (faults.eventErrorXml) {
            res.end(
              `<ResponseStatus><statusCode>6</statusCode><statusString>Invalid Content</statusString><subStatusCode>badParameters</subStatusCode><errorMsg>${message}</errorMsg></ResponseStatus>`,
            );
            return true;
          }
          return json({
            ResponseStatus: {
              statusCode: 6,
              statusString: "Invalid Content",
              subStatusCode: "badParameters",
              errorMsg: message,
            },
          });
        };
        if (faults.eventForce400)
          return reject("AcsEventCond rejected by fixture");
        if (faults.rejectEventTimeFilters && condition.startTime)
          return reject("startTime/endTime are not accepted by fixture");
        if (faults.eventFailLaterPage && condition.searchResultPosition > 0)
          return reject("searchResultPosition rejected by fixture");
        if (
          faults.rejectFractionalEventTime &&
          /\.\d{3}/.test(condition.startTime || "")
        )
          return reject("startTime: fractional seconds are not supported");
        if (condition.maxResults > faults.eventMaxResults)
          return reject("maxResults exceeds firmware limit");
        if (faults.rejectEventPictureFlag && "picEnable" in condition)
          return reject("picEnable is not supported");
        if (faults.rejectEventMajorZero && condition.major === 0)
          return reject("major 0 is not supported");
        if (
          faults.eventLocalTimeOnly &&
          /(?:Z|[+-]\d{2}:\d{2})$/.test(condition.startTime || "")
        )
          return reject("startTime requires device local format");
        if (
          faults.requireEventOffset &&
          (!/[+-]\d{2}:\d{2}$/.test(condition.startTime) ||
            !/[+-]\d{2}:\d{2}$/.test(condition.endTime))
        ) {
          res.statusCode = 400;
          return json({ statusCode: 4, subStatusCode: "badParameters" });
        }
        const filtered = events.filter(
          (event) =>
            (!condition.startTime ||
              Date.parse(event.time) >= Date.parse(condition.startTime)) &&
            (!condition.endTime ||
              Date.parse(event.time) <= Date.parse(condition.endTime)) &&
            (condition.major === 0 || event.major === condition.major) &&
            (condition.minor === 0 || event.minor === condition.minor),
        );
        const pos = condition.searchResultPosition,
          page = filtered.slice(
            faults.repeatedEventPage ? 0 : pos,
            (faults.repeatedEventPage ? 0 : pos) +
              Math.min(condition.maxResults, 10),
          );
        const result = {
          searchID: condition.searchID,
          responseStatusStrg:
            pos + page.length < filtered.length ? "MORE" : "OK",
          numOfMatches: faults.eventStringCounts
            ? String(page.length)
            : page.length,
          totalMatches: faults.eventStringCounts
            ? String(filtered.length)
            : filtered.length,
          InfoList: page,
        };
        if (faults.brokenEventCount) result.numOfMatches = page.length + 1;
        if (faults.eventXml) {
          const escape = (value) =>
            String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
          const serialize = (name, value) =>
            Array.isArray(value)
              ? value.map((v) => serialize(name, v)).join("")
              : value && typeof value === "object"
                ? `<${name}>${Object.entries(value)
                    .map(([k, v]) => serialize(k, v))
                    .join("")}</${name}>`
                : `<${name}>${escape(value)}</${name}>`;
          res.end(
            `<AcsEvent xmlns="http://www.isapi.org/ver20/XMLSchema">${Object.entries(
              result,
            )
              .map(([k, v]) =>
                k === "InfoList"
                  ? `<InfoList>${v.map((r) => serialize("Info", r)).join("")}</InfoList>`
                  : serialize(k, v),
              )
              .join("")}</AcsEvent>`,
          );
          return true;
        }
        return json({ AcsEvent: result });
      }
      if (req.method === "POST" && path.endsWith("CardInfo/Search")) {
        const condition = body.CardInfoSearchCond;
        const filtered = cards.filter(
          (card) =>
            (!condition.EmployeeNoList ||
              condition.EmployeeNoList.some(
                (filter) => filter.employeeNo === card.employeeNo,
              )) &&
            (!condition.CardNoList ||
              condition.CardNoList.some(
                (filter) => filter.cardNo === card.cardNo,
              )),
        );
        const page = filtered.slice(
          condition.searchResultPosition,
          condition.searchResultPosition + condition.maxResults,
        );
        return json({
          CardInfoSearch: {
            responseStatusStrg:
              condition.searchResultPosition + page.length < filtered.length
                ? "MORE"
                : "OK",
            numOfMatches: page.length,
            totalMatches: filtered.length,
            CardInfo: page,
          },
        });
      }
      if (req.method === "GET" && path.endsWith("CardInfo/Count"))
        return json({
          CardInfoCount: {
            cardNumber: cards.filter(
              (card) => card.employeeNo === url.searchParams.get("employeeNo"),
            ).length,
          },
        });
      if (
        req.method !== "GET" &&
        !path.endsWith("/Search") &&
        !path.endsWith("AcsEvent")
      )
        mutations.push({ path, method: req.method, body });
      if (req.method === "POST" && path.endsWith("UserInfo/Record")) {
        if (
          users.some((user) => user.employeeNo === body.UserInfo.employeeNo)
        ) {
          res.statusCode = 409;
          return json({ statusCode: 4, statusString: "duplicate" });
        }
        users.push(body.UserInfo);
        return ok();
      }
      if (req.method === "PUT" && path.endsWith("UserInfo/Modify")) {
        const index = users.findIndex(
          (user) => user.employeeNo === body.UserInfo.employeeNo,
        );
        if (index < 0) {
          res.statusCode = 404;
          return json({ statusString: "notFound" });
        }
        Object.assign(users[index], body.UserInfo);
        return ok();
      }
      if (req.method === "PUT" && path.endsWith("UserInfoDetail/Delete")) {
        const list = body.UserInfoDetail.EmployeeNoList;
        if (body.UserInfoDetail.mode !== "byEmployeeNo" || !list?.length || list.length > 50) {
          res.statusCode = 400;
          return json({ statusString: "invalid delete" });
        }
        for (const item of list) {
          const index = users.findIndex((user) => user.employeeNo === item.employeeNo);
          if (index >= 0) users.splice(index, 1);
        }
        return ok();
      }
      if (req.method === "POST" && path.endsWith("CardInfo/Record")) {
        cards.push(body.CardInfo);
        return ok();
      }
      if (req.method === "PUT" && path.endsWith("CardInfo/Delete")) {
        const index = cards.findIndex(
          (card) => card.cardNo === body.CardInfoDelCond.CardNoList[0].cardNo,
        );
        if (index >= 0) cards.splice(index, 1);
        return ok();
      }
      if (req.method === "PUT" && /RemoteControl\/door\/1$/.test(path))
        return ok();
      if (
        req.method === "PUT" &&
        path === "/ISAPI/AccessControl/UserRightWeekPlanCfg/1"
      ) {
        weekPlans.set(1, body.UserRightWeekPlanCfg);
        return ok();
      }
      if (req.method === "GET") {
        res.statusCode = 404;
        return json({ statusCode: 4, subStatusCode: "notSupport" });
      }
      return false;
    },
  });
  return { ...device, mutations, cards, weekPlans, faults, clock };
}
