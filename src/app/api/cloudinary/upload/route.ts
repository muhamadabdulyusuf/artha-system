import { createHash } from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CloudinaryUploadResponse = {
  secure_url?: string;
  public_id?: string;
  error?: { message?: string };
};

function signCloudinaryParams(params: Record<string, string>, apiSecret: string): string {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}

export async function POST(request: Request) {
  const cloudName = (
    process.env.CLOUDINARY_CLOUD_NAME ??
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ??
    ""
  ).trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY ?? "").trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET ?? "").trim();

  if (!cloudName || !apiKey || !apiSecret) {
    const missing = [
      !cloudName ? "CLOUDINARY_CLOUD_NAME/NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME" : "",
      !apiKey ? "CLOUDINARY_API_KEY" : "",
      !apiSecret ? "CLOUDINARY_API_SECRET" : "",
    ].filter(Boolean);

    return NextResponse.json(
      { error: `Cloudinary env belum lengkap: ${missing.join(", ")}.` },
      { status: 500 }
    );
  }

  const incoming = await request.formData();
  const file = incoming.get("file");
  const folderRaw = String(incoming.get("folder") ?? "artha/outstock");
  const folder = folderRaw.replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 80) || "artha/outstock";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File foto wajib dikirim." }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File harus berupa gambar." }, { status: 400 });
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = { folder, timestamp };
  const signature = signCloudinaryParams(params, apiSecret);

  const uploadForm = new FormData();
  uploadForm.set("file", file);
  uploadForm.set("api_key", apiKey);
  uploadForm.set("timestamp", timestamp);
  uploadForm.set("folder", folder);
  uploadForm.set("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: uploadForm,
  });

  const result = (await response.json()) as CloudinaryUploadResponse;

  if (!response.ok || !result.secure_url || !result.public_id) {
    return NextResponse.json(
      { error: result.error?.message ?? "Upload Cloudinary gagal." },
      { status: response.status || 500 }
    );
  }

  return NextResponse.json({
    url: result.secure_url,
    publicId: result.public_id,
  });
}
