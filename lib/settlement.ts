// Settlement payments — recording money a companion has actually paid
// back toward what they owe (see migration_050). Distinct from expenses/
// allocations, which only record what's owed, never what's been repaid.
import { supabase } from "./supabase";
import { SettlementPayment } from "./types";

export interface SettlementPaymentInput {
  amountNis: number;
  paymentDate: string | null;
  note: string | null;
}

export async function fetchPartyPayments(tripId: string, partyId: string): Promise<SettlementPayment[]> {
  const { data, error } = await supabase
    .from("settlement_payments")
    .select("*")
    .eq("trip_id", tripId)
    .eq("party_id", partyId)
    .order("payment_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SettlementPayment[];
}

/** All payments for every party on a trip, for computing outstanding
 * (owed - paid) balances without one query per party — used by the
 * Report screen's "Owed to me" section. */
export async function fetchTripPayments(tripId: string): Promise<SettlementPayment[]> {
  const { data, error } = await supabase.from("settlement_payments").select("*").eq("trip_id", tripId);
  if (error) throw error;
  return (data ?? []) as SettlementPayment[];
}

export async function addSettlementPayment(tripId: string, partyId: string, input: SettlementPaymentInput): Promise<void> {
  const { error } = await supabase.from("settlement_payments").insert({
    trip_id: tripId,
    party_id: partyId,
    amount_nis: input.amountNis,
    payment_date: input.paymentDate,
    note: input.note,
  });
  if (error) throw error;
}

export async function deleteSettlementPayment(id: string): Promise<void> {
  const { error } = await supabase.from("settlement_payments").delete().eq("id", id);
  if (error) throw error;
}
