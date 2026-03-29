import { readLocalDb, writeLocalDb } from "@/lib/browserDb";
import type { Employee, Employer } from "@/lib/schema";

export async function addEmployee(data: Omit<Employee, "id">) {
  try {
    const db = readLocalDb();
    const id = Date.now().toString();
    db.employees.push({ id, ...data });
    writeLocalDb(db);
    return { success: true as const };
  } catch {
    return { success: false as const };
  }
}

export async function getEmployers(): Promise<Employer[]> {
  return readLocalDb().employers;
}
