import "server-only";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fail } from "./errors.ts";

let client: S3Client | undefined;
function storage() {
  if (client) return client;
  const { AWS_ENDPOINT_URL_S3: endpoint, AWS_REGION: region, AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey } = process.env;
  if (!endpoint || !region || !accessKeyId || !secretAccessKey) fail("UNAVAILABLE", "Private file storage is not configured.");
  if (new URL(endpoint).protocol !== "https:") fail("UNAVAILABLE", "Storage requires an HTTPS endpoint.");
  client = new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  return client;
}

// Coordinates must come from backend.exportData(), never from a browser object key.
export async function storeEssayExport(data: { ownerId: string; essayId: string; versionId: string; lockVersion: number; title: string; text: string }) {
  const bucket = "assets";
  const key = `exports/${data.ownerId}/${data.essayId}/${data.versionId}/${data.lockVersion}.txt`;
  const s3 = storage();
  try {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: `${data.title}\n\n${data.text}`, ContentType: "text/plain; charset=utf-8" }), { abortSignal: AbortSignal.timeout(15_000) });
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: 'attachment; filename="essay.txt"' }), { expiresIn: 300 });
    return { url, expiresInSeconds: 300 };
  } catch { fail("UNAVAILABLE", "The export could not be stored. Please try again later."); }
}
