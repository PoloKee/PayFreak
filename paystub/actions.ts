import { readLocalDb, writeLocalDb } from "@/lib/browserDb";
import { calculatePayStub } from "@/lib/payroll";
import type { Employee, PayStub } from "@/lib/schema";

export async function getEmployees(): Promise<Employee[]> {
  return readLocalDb().employees;
}

export async function generatePayStub(
  employeeId: string,
  grossPay: number,
  payPeriodStart: string,
  payPeriodEnd: string
) {
  try {
    const db = readLocalDb();
    const employee = db.employees.find((e) => e.id === employeeId);
    if (!employee) {
      throw new Error("Employee not found");
    }
    const payStubData = calculatePayStub(
      employee,
      grossPay,
      payPeriodStart,
      payPeriodEnd
    );
    const id = Date.now().toString();
    const newPayStub: PayStub = { id, ...payStubData };
    db.paystubs.push(newPayStub);
    writeLocalDb(db);
    return { success: true as const, payStub: newPayStub };
  } catch {
    return { success: false as const };
  }
}
