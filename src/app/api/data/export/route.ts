import { exportDataZip } from "@/services/storage/data-admin";
import { dateKey } from "@/lib/ids";

export const dynamic = "force-dynamic";
import { exportDataZip } from "@/services/storage/data-admin";
import { dateKey } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function GET() {
  const zip = await exportDataZip();
  return new Response(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="owlscope-${dateKey()}.zip"`,
      "content-length": String(zip.byteLength),
    },
  });
}
