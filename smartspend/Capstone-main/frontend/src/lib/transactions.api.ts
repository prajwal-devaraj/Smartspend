// src/lib/transactions.api.ts
import { get, post, patch, del } from "./api";

export type TxDTO = {
  id: number;
  type: "income" | "expense";
  amount: number;            // dollars (server convenience)
  amount_cents: number;
  occurred_at: string;       // ISO
  merchant?: string | null;
  note?: string | null;
  nwg?: "Need" | "Want" | "Guilt" | null;
  mood?: "happy" | "neutral" | "stressed" | "impulse" | null;
  category_id?: number | null;
  bill_payment_id?: number | null;
  late_night?: boolean;
};

export async function getTxns(qs: Record<string, any>) {
  return get<{ total: number; page: number; per_page: number; items: TxDTO[] }>(
    "/transactions",
    qs
  );
}

export async function createTx(body: any) {
  return post<TxDTO>("/transactions", body);
}

export async function updateTx(id: number, body: any) {
  return patch<{ ok: true }>(`/transactions/${id}`, body);
}

export async function deleteTx(id: number) {
  return del<{ ok: true }>(`/transactions/${id}`);
}
