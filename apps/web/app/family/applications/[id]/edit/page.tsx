export const runtime = "edge";
export const dynamic = "force-dynamic";

import { EditApplicationClient } from "./edit-client";

export default async function EditApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditApplicationClient id={id} />;
}
