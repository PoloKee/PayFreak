import { redirect } from "next/navigation";

/** CRA route parity: `/employee/statements` → employee bank statements. */
export default function EmployeeStatementsAliasPage() {
  redirect("/portal/employee/statements");
}
