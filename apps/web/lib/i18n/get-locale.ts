import { cookies } from "next/headers";
import type { Locale } from "./translations";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return (cookieStore.get("NEXT_LOCALE")?.value as Locale | undefined) ?? "en";
}
