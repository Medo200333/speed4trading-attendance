import { createTestDevice } from "./hikvision-test-device.mjs";
export async function createBiometricFixture(photo) {
  const faces = new Map(),
    mutations = [],
    bodies = [];
  const faults = {
    noFaceSupport: false,
    captureUnsupported: false,
    noLibrary: false,
    mode: "normalMode",
    ignoreWrite: false,
    wrongBinding: false,
    failReadback: false,
    qualityReject: false,
    unchangedProof: false,
    zeroFaceCount: false,
    noIsInLibrary: false,
    existsOnAdd: false,
    rotatingUrl: false,
  };
  let urlCounter = 0;
  let activeCapture = false,
    reads = 0;
  const fixture = await createTestDevice({
    userCount: 2,
    extension: async ({ req, res, body, rawBody, users }) => {
      const path = new URL(req.url, "http://fixture").pathname;
      const json = (data) => {
        res.end(JSON.stringify(data));
        return true;
      };
      if (path === "/ISAPI/System/deviceInfo")
        return json({
          DeviceInfo: {
            model: "DS-K1A340WX",
            serialNumber: "BIO-FIXTURE",
            firmwareVersion: "V1.2.7",
          },
        });
      if (path === "/ISAPI/AccessControl/capabilities")
        return json({
          AccessControl: {
            isSupportFDLib: !faults.noFaceSupport,
            isSupportCaptureFace: !faults.captureUnsupported,
            isSupportCaptureInfraredFace: true,
            isSupportCardInfo: false,
          },
        });
      if (path === "/ISAPI/Intelligent/FDLib/capabilities")
        return json({
          supportFDFunction: "post,get,put,setUp",
          FDRecordDataMaxNum: 1500,
          faceLibType: "blackFD,infraredFD",
        });
      if (path === "/ISAPI/Intelligent/FDLib" && req.method === "GET")
        return json({
          FDLib: faults.noLibrary
            ? []
            : [
                { FDID: "face-library-a", faceLibType: "blackFD" },
                { FDID: "ir-library-b", faceLibType: "infraredFD" },
              ],
        });
      if (path === "/ISAPI/AccessControl/FaceRecognizeMode")
        return json({ FaceRecognizeMode: { mode: faults.mode } });
      if (path.endsWith("/UserInfo/Search")) {
        const wanted = body.UserInfoSearchCond.EmployeeNoList?.map(
            (r) => r.employeeNo,
          ),
          records = users
            .filter((u) => !wanted || wanted.includes(u.employeeNo))
            .map((u) => ({
              ...u,
              numOfFace:
                !faults.zeroFaceCount &&
                [...faces.keys()].some((key) =>
                  key.endsWith(":" + u.employeeNo),
                )
                  ? 1
                  : 0,
            }));
        return json({
          UserInfoSearch: {
            numOfMatches: records.length,
            totalMatches: records.length,
            responseStatusStrg: "OK",
            UserInfo: records,
          },
        });
      }
      if (path.endsWith("/FDSearch")) {
        const record = faces.get(body.FDID + ":" + body.FPID),
          row =
            record && !faults.failReadback
              ? {
                  FDID: body.FDID,
                  FPID: faults.wrongBinding ? "OTHER" : body.FPID,
                  ...(faults.noIsInLibrary ? {} : { isInLibrary: "yes" }),
                  rowKey: record.rowKey,
                  ...(faults.rotatingUrl ? { faceURL: `http://fixture/face/${body.FPID}.jpg@WEB${++urlCounter}` } : {}),
                  modelData: "PRIVATE-MODEL-NEVER-EXPOSE",
                }
              : null;
        return json({
          statusCode: 1,
          responseStatusStrg: "OK",
          numOfMatches: row ? 1 : 0,
          totalMatches: row ? 1 : 0,
          MatchList: row ? [row] : [],
        });
      }
      if (path.endsWith("/FaceDataRecord") || path.endsWith("/FDSetUp")) {
        const contentType = req.headers["content-type"];
        const form = await new Response(rawBody, {
          headers: { "content-type": contentType },
        }).formData();
        const metadata = JSON.parse(await form.get("FaceDataRecord").text()),
          image = form.get("FaceImage");
        if (!image || image.type !== "image/jpeg") {
          res.statusCode = 400;
          return json({ statusCode: 6, subStatusCode: "badParameters" });
        }
        bodies.push({
          metadata,
          image: new Uint8Array(await image.arrayBuffer()),
        });
        mutations.push({ path, method: req.method, employeeNo: metadata.FPID });
        if (faults.existsOnAdd && path.endsWith("/FaceDataRecord")) {
          res.statusCode = 400;
          return json({ statusCode: 6, subStatusCode: "deviceUserAlreadyExistFace" });
        }
        if (faults.qualityReject) {
          res.statusCode = 400;
          return json({
            statusCode: 6,
            subStatusCode: "SubpicAnalysisModelingError",
          });
        }
        if (!faults.ignoreWrite)
          faces.set(metadata.FDID + ":" + metadata.FPID, {
            rowKey: faults.unchangedProof
              ? "original-key"
              : String(Date.now()) + Math.random(),
          });
        return json({ statusCode: 1, statusString: "OK", FPID: metadata.FPID });
      }
      if (path.endsWith("/CaptureFaceData") && req.method === "POST") {
        mutations.push({ path, method: "POST", body });
        activeCapture = true;
        reads = 0;
        if (faults.captureUnsupported) {
          res.statusCode = 405;
          return json({ statusCode: 4 });
        }
        res.end(
          "<CaptureFaceData><captureProgress>0</captureProgress><isCurRequestOver>false</isCurRequestOver></CaptureFaceData>",
        );
        return true;
      }
      if (path.endsWith("/CaptureFaceData/Progress")) {
        reads++;
        if (!activeCapture) {
          res.statusCode = 400;
          return json({ statusCode: 4 });
        }
        res.setHeader(
          "Content-Type",
          "multipart/mixed; boundary=fixture-photo",
        );
        res.end(
          Buffer.concat([
            Buffer.from(
              "--fixture-photo\r\nContent-Type: application/xml\r\n\r\n<CaptureFaceData><captureProgress>100</captureProgress></CaptureFaceData>\r\n--fixture-photo\r\nContent-Type: image/jpeg\r\n\r\n",
            ),
            Buffer.from(photo),
            Buffer.from("\r\n--fixture-photo--\r\n"),
          ]),
        );
        return true;
      }
      res.statusCode = 404;
      return json({ statusCode: 4, subStatusCode: "notSupport" });
    },
  });
  return {
    ...fixture,
    faces,
    mutations,
    bodies,
    faults,
    getCaptureReads: () => reads,
  };
}
