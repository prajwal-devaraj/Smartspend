import { useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/Card";
import { transactions } from "@/lib/mock";

// -------------------------------------------------------------
// Dashboard Component — Total Saved + Dynamic Monthly Table
// -------------------------------------------------------------
export default function Dashboard() {

  // -------------------------------------------------------------
  // Total Saved Across All Transactions
  // -------------------------------------------------------------
  const totalSaved = useMemo(() => {
    let bal = 0;
    for (const tx of transactions) {
      bal += tx.amount;
    }
    return bal;
  }, []);

  // -------------------------------------------------------------
  // Find earliest transaction month + year
  // -------------------------------------------------------------
  const firstDate = useMemo(() => {
    if (transactions.length === 0) return new Date();

    return transactions.reduce((min, tx) => {
      const d = new Date(tx.occurred_at);
      return d < min ? d : min;
    }, new Date(transactions[0].occurred_at));
  }, []);

  const firstMonth = firstDate.getMonth();
  const firstYear = firstDate.getFullYear();

  const current = new Date();
  const currentMonth = current.getMonth();
  const currentYear = current.getFullYear();

  // -------------------------------------------------------------
  // Monthly accumulated balances grouped as "year-month"
  // -------------------------------------------------------------
  const monthlyBalance = useMemo(() => {
    const acc: Record<string, number> = {};

    for (const tx of transactions) {
      const d = new Date(tx.occurred_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`; // example: 2024-9

      if (!acc[key]) acc[key] = 0;
      acc[key] += tx.amount;
    }

    return acc;
  }, []);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  // -------------------------------------------------------------
  // Generate visible months from firstYear:firstMonth → currentYear:currentMonth
  // -------------------------------------------------------------
  const visibleMonths: { year: number; month: number }[] = [];

  for (let y = firstYear; y <= currentYear; y++) {
    const startM = y === firstYear ? firstMonth : 0;
    const endM = y === currentYear ? currentMonth : 11;

    for (let m = startM; m <= endM; m++) {
      visibleMonths.push({ year: y, month: m });
    }
  }

  return (
    <AppLayout>

      {/* ---------------- KPI Row ---------------- */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-sm text-gray-500">Total Money Saved</div>
          <div className="mt-1 text-2xl font-bold">
            ${totalSaved.toLocaleString()}
          </div>
        </Card>
      </div>

      {/* ---------------- Accumulating Section ---------------- */}
      <div className="mt-6">
        
        <div className="text-xl font-bold mb-2">Accumulating</div>

        <Card className="p-4">
          
          <div className="text-lg font-semibold mb-2">Balance_Total</div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Month</th>
                <th className="py-2">Year</th>
                <th className="py-2">Balance</th>
              </tr>
            </thead>

            <tbody>
              {visibleMonths.map(({ year, month }) => {
                const key = `${year}-${month}`;
                return (
                  <tr key={key} className="border-b">
                    <td className="py-2">{monthNames[month]}</td>
                    <td className="py-2">{year}</td>
                    <td className="py-2">
                      ${ (monthlyBalance[key] ?? 0).toLocaleString() }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

        </Card>

      </div>

    </AppLayout>
  );
}