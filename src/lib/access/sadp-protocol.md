# SADP protocol notes (static analysis of SADPTool `Sadp.dll`, x86, image base 0x10000000)

Source: `C:\Program Files (x86)\SADP\SADP\Sadp.dll` (1,678,848 bytes), disassembled with capstone. No packet capture.

| Step | Function (VA) | Finding |
|---|---|---|
| exchangecode build | `CMulticastProtocol::PackageExchangeCode` 0x10040d60 | `CEncrypt::GetRsaPublicKey1024` (0x1003a810) → base64 (0x1003a670, out 0x400) → `<Probe><Uuid/><MAC/><Types>exchangecode</Types><Code>%s</Code></Probe>` (0x1013ddd0) |
| key generation | `CSSLTrans::SSLTrans_GeneralRSAKey` ~0x1007df3e | `RSA_new`, `BN_set_word(65537)`, `RSA_generate_key_ex(rsa, 0x400 = 1024)`, `i2d_RSAPublicKey` → **PKCS#1 DER**; memcpy to caller (0x1007e0c6) |
| reply decrypt | `CMulticastProtocol::DecryptExchangeCode` 0x1003f900 | base64-decode `<Code>` (0x1003a650) → `RsaDecryptByPrivateKey` (0x1003a940) → `d2i_RSAPrivateKey` + `RSA_private_decrypt(..., padding = 1 = PKCS#1 v1.5)` (0x1007c783) |
| activate password | `CMulticastProtocol::EncryptPWByRandomStr` ~0x100404f0 | random = RSA-decrypted `<Code>`; plaintext = random[0..16] + password (memcpy at 0x10040622) in a 32-byte zeroed buffer; `AesEcbEncrypt(in, 0x20, out, 0x20, key = random, 0x10)` (0x1004069a); base64 of the 32 raw bytes (0x100406c4). Password > 16 chars rejected. |
| activate packet | 0x1013… | `<Probe><Uuid/><MAC/><Types>activate</Types><Password>%s</Password></Probe>` |
| v31 variants | `CMulticastProtocol_V31::PackageExchangeCode_V31` ~0x10048960 | RSA-**3072** (`GetRsaKey3072` 0x1003a7d0), base64 out 0xc00; `activate_v31` adds `<Iv>` (AES-CBC). Device field `<SecurityMode>` (standard / high-A / high-B / custom, parsed at 0x1004517a → +0x20c). The DS-K1T673DGX-E1 inquiry has no SecurityMode → standard (non-v31) path. |
| update (modify network) | `CSADPGlobalCtrl::ModifyNetParamV40` 0x1002cf80 | GetUserName (0x1002bdb0) → if flag, `GetExchangecode` first (0x1002d05e) → `PackageUpdateData` 0x10043400 |
| update password | 0x10043400 + 0x1003f2f0 | digest = salt ? MD5(`%02x` lowercase hex SHA256(user + Salt + password)) (CoreBase_StrSHA256 0x1005a6f0, CoreBase_MD5 0x100588e0) : MD5(password). If inquiry `<Encrypt>true` (bit 0x10 at +0x1b1 → +0x490, set at 0x10044459): Password = base64(AES-128-ECB(key = digest, pad64(digest + ";" + password))); else base64(digest). `<Password bSalt="true">` when a salt exists (cmovne at 0x10043669). |
| sending | `CSADPGlobalCtrl::GetExchangecode` 0x1002b780 | sends on the NIC the device was found on (mode 2) or on every NIC (loop over +0x75f8), then polls every 100 ms (Sleep 0x64) until the reply state changes or timeout. |

Real-device evidence (DS-K1T673DGX-E1, V4.41.20 build 250719, 2026-11-02): an exchangecode with `<Code>` = base64(hex modulus) (ISAPI style) was answered `<Result>failed</Result><Code></Code>`. Inquiry fields: `<Encrypt>true</Encrypt>`, `<Salt>` (64 hex), no `<SecurityMode>`.
