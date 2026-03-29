import { readLocalDb, writeLocalDb } from "@/lib/browserDb";
import type { Employer } from "@/lib/schema";

export async function addEmployer(data: Omit<Employer, "id">) {
  try {
    const db = readLocalDb();
    const id = Date.now().toString();
    db.employers.push({ id, ...data });
    writeLocalDb(db);
    return { success: true as const };
  } catch {
    return { success: false as const };
  }
}
