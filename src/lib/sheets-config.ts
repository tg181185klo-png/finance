/** ყველა პარამეტრი — შეცვალეთ .env.local-ში ან Vercel/Render-ის პანელში */

export const env = {
  googleSheetId: process.env.GOOGLE_SHEET_ID || "19EC29L7CgHCk4XD7AZuqbmiz0KSFv-Nl",
  googleSheetGidCost: process.env.GOOGLE_SHEET_GID_COST || "1981413768",
  googleSheetGidProducts: process.env.GOOGLE_SHEET_GID_PRODUCTS || "",
  adminPin: process.env.ADMIN_PIN || "12345",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "",
  blobToken: process.env.BLOB_READ_WRITE_TOKEN || "",
  excelPath: process.env.EXCEL_PATH || "",
};

export const PRODUCT_SHEETS = [
  { name: "პროდუქტების დასათვლელი", gid: env.googleSheetGidProducts },
  { name: "თვითღირებულება", gid: env.googleSheetGidCost },
] as const;

export const PRODUCTS_REFRESH_MS = 60_000;
