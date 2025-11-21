import { NextResponse } from "next/server";
import { createHmac, randomUUID } from "crypto";

const smsCache = new Map<string, { code: string; expiresAt: number }>();
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function percentEncode(input: string): string {
  return encodeURIComponent(input)
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~")
    .replace(/\+/g, "%20");
}

function getTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const phone = body?.phone as string | undefined;

    if (!phone) {
      return NextResponse.json({ success: false, error: "手机号不能为空" }, { status: 400 });
    }

    const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
    const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
    const signName = process.env.ALIYUN_SMS_SIGN_NAME;
    const templateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE;

    if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
      console.error("Aliyun SMS 配置缺失");
      return NextResponse.json({ success: false, error: "短信服务未配置" }, { status: 500 });
    }

    const code = generateCode();
    console.log(`[SMS] 为 ${phone} 生成验证码: ${code}`);

    smsCache.set(phone, {
      code,
      expiresAt: Date.now() + CODE_TTL_MS,
    });

    const params: Record<string, string> = {
      AccessKeyId: accessKeyId,
      Action: "SendSms",
      Format: "JSON",
      PhoneNumbers: phone,
      RegionId: "cn-hangzhou",
      SignName: signName,
      SignatureMethod: "HMAC-SHA1",
      SignatureNonce: randomUUID(),
      SignatureVersion: "1.0",
      TemplateCode: templateCode,
      TemplateParam: JSON.stringify({ code }),
      Timestamp: getTimestamp(),
      Version: "2017-05-25",
    };

    const sortedKeys = Object.keys(params).sort();
    const canonicalizedQuery = sortedKeys
      .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
      .join("&");

    const stringToSign = `GET&${percentEncode("/")}&${percentEncode(canonicalizedQuery)}`;
    const signature = createHmac("sha1", `${accessKeySecret}&`)
      .update(stringToSign)
      .digest("base64");

    const finalQuery = `${canonicalizedQuery}&Signature=${percentEncode(signature)}`;
    const requestUrl = `https://dysmsapi.aliyuncs.com/?${finalQuery}`;

    let aliyunResponse: any = null;
    try {
      const response = await fetch(requestUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const text = await response.text();
      try {
        aliyunResponse = JSON.parse(text);
      } catch {
        aliyunResponse = text;
      }

      if (!response.ok) {
        console.error("Aliyun SMS 请求失败:", aliyunResponse);
        return NextResponse.json({ success: false, error: "短信发送失败", response: aliyunResponse }, { status: response.status });
      }

      const aliyunCode = aliyunResponse?.Code;
      if (aliyunCode && aliyunCode !== "OK") {
        console.error("Aliyun SMS 返回错误:", aliyunResponse);
        return NextResponse.json({ success: false, error: "短信发送失败", response: aliyunResponse }, { status: 500 });
      }
    } catch (error) {
      console.error("调用 Aliyun SMS 失败:", error);
      return NextResponse.json({ success: false, error: "短信发送异常" }, { status: 500 });
    }

    return NextResponse.json({ success: true, code, response: aliyunResponse });
  } catch (error) {
    console.error("短信接口错误:", error);
    return NextResponse.json({ success: false, error: "内部错误" }, { status: 500 });
  }
}

export function getCachedCode(phone: string) {
  const record = smsCache.get(phone);
  if (!record) return null;
  if (record.expiresAt < Date.now()) {
    smsCache.delete(phone);
    return null;
  }
  return record.code;
}

export function clearCachedCode(phone: string) {
  smsCache.delete(phone);
}
