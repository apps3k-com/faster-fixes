import { backblaze } from "@better-upload/server/clients";

export const s3Client = backblaze({
  region: process.env.B2_REGION!,
  applicationKeyId: process.env.B2_APP_KEY_ID!,
  applicationKey: process.env.B2_APP_KEY!,
});
