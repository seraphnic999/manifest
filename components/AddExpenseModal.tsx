import { useState, useEffect } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal, Switch,
} from "react-native";
import { Alert } from "@/lib/alert";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";
import { localIsoDate } from "@/lib/dateFormat";
import { TripCurrency, TripParty, ShoppingListItem, ExpenseType } from "@/lib/types";
import { EXPENSE_TYPES, EXPENSE_TYPE_LABELS, deriveExpenseTypeFromItemType } from "@/lib/expenseType";
import { DateField } from "@/components/DateTimeFields";
import ItemPickerModal from "@/components/ItemPickerModal";
import ShoppingItemPickerModal from "@/components/ShoppingItemPickerModal";

interface SplitRow {
  amount: string;
  partyId: string | null;
  shoppingItemId: string | null;
  note: string;
}

export default function AddExpenseModal({
  visible, onClose, onSaved, tripId, currencies, parties, presetItemId, presetShoppingItemId, expenseId,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  tripId: string;
  currencies: TripCurrency[];
  parties: TripParty[];
  presetItemId?: string;           // create mode: item picker hidden, this item always used
  presetShoppingItemId?: string;   // create mode: pre-selects this shopping list entry
  expenseId?: string;              // when set, loads and updates this expense instead of creating
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("NIS");
  const [date, setDate] = useState(localIsoDate());
  const [note, setNote] = useState("");
  const [expenseType, setExpenseType] = useState<ExpenseType>("other");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundCompany, setRefundCompany] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [singleParty, setSingleParty] = useState<string | null>(null);
  const [singleShoppingItem, setSingleShoppingItem] = useState<string | null>(null);
  const [rows, setRows] = useState<SplitRow[]>([{ amount: "", partyId: null, shoppingItemId: null, note: "" }]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!expenseId);

  const [linkedItemId, setLinkedItemId] = useState<string | null>(presetItemId ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkedItemTitle, setLinkedItemTitle] = useState<string | null>(null);
  const [shoppingItems, setShoppingItems] = useState<ShoppingListItem[]>([]);
  const [shoppingPickerOpen, setShoppingPickerOpen] = useState(false);
  const [splitShoppingPickerIndex, setSplitShoppingPickerIndex] = useState<number | null>(null);

  // Local, mutable copy of `parties` — lets a person added mid-form (via the
  // "+ Add person" chip below) show up immediately without waiting on the
  // parent screen to reload and pass a new prop down.
  const [localParties, setLocalParties] = useState<TripParty[]>(parties);
  useEffect(() => setLocalParties(parties), [parties]);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [addPersonTarget, setAddPersonTarget] = useState<"single" | number | null>(null);
  const [newPersonName, setNewPersonName] = useState("");

  function openAddPerson(target: "single" | number) {
    setAddPersonTarget(target);
    setNewPersonName("");
    setAddPersonOpen(true);
  }

  async function submitAddPerson() {
    const name = newPersonName.trim();
    if (!name) return;
    const { data, error } = await supabase.from("trip_parties").insert({ trip_id: tripId, name, is_work: false }).select().single();
    if (error || !data) {
      Alert.alert("Couldn't add person", error?.message ?? "Unknown error");
      return;
    }
    const newParty = data as TripParty;
    setLocalParties((prev) => [...prev, newParty]);
    if (addPersonTarget === "single") setSingleParty(newParty.id);
    else if (typeof addPersonTarget === "number") updateRow(addPersonTarget, { partyId: newParty.id });
    setAddPersonOpen(false);
  }

  function shoppingItemLabel(id: string | null): string {
    if (!id) return "None";
    const s = shoppingItems.find((x) => x.id === id);
    return s ? `${s.name}${s.quantity > 1 ? ` ×${s.quantity}` : ""}` : "None";
  }

  // A shopping item picked via the "+ Create" flow in the picker won't be in
  // `shoppingItems` yet (that list is only fetched on modal open) — merge it
  // in immediately so shoppingItemLabel can show its name right away.
  function registerShoppingItem(s: ShoppingListItem) {
    setShoppingItems((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, s]));
  }

  // Reset / load whenever the modal opens. `cancelled` guards against a
  // stale response landing after a newer one — e.g. editing expense A then
  // quickly switching to editing expense B (same persistent modal instance,
  // e.g. from the shopping list's "related expenses" picker): if A's fetch
  // resolves after B's, without this guard it would overwrite B's freshly
  // loaded split rows with A's, making the form look like it "remembered"
  // a previous expense's split.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    if (expenseId) {
      setLoaded(false);
      Promise.all([
        supabase.from("expenses").select("*").eq("id", expenseId).single(),
        supabase.from("allocations").select("*").eq("expense_id", expenseId),
      ]).then(([{ data: exp }, { data: allocs }]) => {
        if (cancelled || !exp) return;
        setAmount(String(exp.amount));
        setCurrencyCode(exp.currency_code);
        setDate(exp.expense_date ?? localIsoDate());
        setNote(exp.note ?? "");
        setExpenseType((exp.type as ExpenseType) ?? "other");
        setRefundAmount(exp.refund_amount != null ? String(exp.refund_amount) : "");
        setRefundCompany(exp.refund_company ?? "");
        setLinkedItemId(exp.item_id);

        const a = allocs ?? [];
        if (a.length > 1) {
          setSplitting(true);
          setRows(a.map((x) => ({ amount: String(x.amount), partyId: x.party_id, shoppingItemId: x.shopping_list_item_id, note: x.note ?? "" })));
        } else {
          setSplitting(false);
          setSingleParty(a[0]?.party_id ?? null);
          setSingleShoppingItem(a[0]?.shopping_list_item_id ?? null);
        }
        setLoaded(true);
      });
    } else {
      setAmount(""); setCurrencyCode("NIS"); setDate(localIsoDate()); setNote("");
      setRefundAmount(""); setRefundCompany("");
      setSplitting(false); setSingleParty(null);
      setRows([{ amount: "", partyId: null, shoppingItemId: null, note: "" }]);
      setLinkedItemId(presetItemId ?? null);
      setSingleShoppingItem(presetShoppingItemId ?? null);
      if (presetItemId) {
        supabase.from("items").select("type, start_date").eq("id", presetItemId).single()
          .then(({ data }) => {
            if (cancelled) return;
            setExpenseType(data ? deriveExpenseTypeFromItemType(data.type) : "other");
            // Default the date to the linked item's scheduled date. This
            // duplicates what the linkedItemId effect below does, but that
            // effect only fires when linkedItemId actually changes value —
            // on every reopen it's already equal to presetItemId, so it
            // wouldn't otherwise re-run and this reset block's plain
            // today's-date default would win instead.
            if (data?.start_date) setDate(data.start_date);
          });
      } else {
        setExpenseType("other");
      }
      setLoaded(true);
    }

    return () => { cancelled = true; };
  }, [visible, expenseId, presetItemId, presetShoppingItemId]);

  useEffect(() => {
    if (!visible || !tripId) return;
    supabase.from("shopping_list_items").select("*").eq("trip_id", tripId).order("name")
      .then(({ data }) => data && setShoppingItems(data as ShoppingListItem[]));
  }, [visible, tripId]);

  // If a shopping item is preset (create mode) and it's tied to an activity,
  // default the item link too (unless one was already explicitly preset).
  useEffect(() => {
    if (expenseId || !presetShoppingItemId || presetItemId) return;
    const si = shoppingItems.find((s) => s.id === presetShoppingItemId);
    if (si?.item_id) setLinkedItemId(si.item_id);
  }, [expenseId, presetShoppingItemId, presetItemId, shoppingItems]);

  useEffect(() => {
    if (!linkedItemId) { setLinkedItemTitle(null); return; }
    let cancelled = false;
    supabase.from("items").select("title, start_date").eq("id", linkedItemId).single()
      .then(({ data }) => {
        if (cancelled) return;
        setLinkedItemTitle(data?.title ?? null);
        // Default a new expense's date to the linked item's date — only
        // when creating (not editing an existing expense, which already
        // has its own date the user may have deliberately chosen).
        if (!expenseId && data?.start_date) setDate(data.start_date);
      });
    return () => { cancelled = true; };
  }, [linkedItemId, expenseId]);

  function addRow() { setRows([...rows, { amount: "", partyId: null, shoppingItemId: null, note: "" }]); }
  function updateRow(idx: number, patch: Partial<SplitRow>) {
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeRow(idx: number) { setRows(rows.filter((_, i) => i !== idx)); }

  // Some fields (type, refund_*, allocation notes...) only exist once their
  // migration has been applied. Rather than hardcode a fallback per field,
  // parse the missing column's name straight out of PostgREST's "Could not
  // find the 'x' column" error and drop just that key, retrying until the
  // write succeeds or there's nothing left we recognize as droppable — so
  // saving keeps working piece-by-piece on a project that's behind on
  // migrations instead of failing outright.
  function stripMissingColumn<T extends object>(error: any, payload: T): T | null {
    if (error?.code !== "PGRST204") return null;
    const key = error.message?.match(/'([a-zA-Z_]+)' column/)?.[1];
    if (!key || !(key in payload)) return null;
    const next = { ...payload };
    delete (next as any)[key];
    return next;
  }

  async function save() {
    const total = parseFloat(amount);
    if (!total || total <= 0) {
      Alert.alert("Missing info", "Enter a valid amount.");
      return;
    }
    if (splitting) {
      const sum = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      if (Math.abs(sum - total) > 0.01) {
        Alert.alert("Doesn't add up", `Split rows total ${sum.toFixed(2)}, but the expense is ${total.toFixed(2)}.`);
        return;
      }
    }
    setSaving(true);

    let currentExpenseId = expenseId;

    let expensePayload: Record<string, any> = {
      item_id: linkedItemId, currency_code: currencyCode, amount: total,
      expense_date: date || null, note: note || null, type: expenseType,
      refund_amount: refundAmount ? parseFloat(refundAmount) || null : null,
      refund_company: refundCompany || null,
    };

    if (expenseId) {
      let { error } = await supabase.from("expenses").update(expensePayload).eq("id", expenseId);
      let stripped;
      while ((stripped = stripMissingColumn(error, expensePayload))) {
        expensePayload = stripped;
        ({ error } = await supabase.from("expenses").update(expensePayload).eq("id", expenseId));
      }
      if (error) {
        setSaving(false);
        Alert.alert("Couldn't save", error.message);
        return;
      }
      await supabase.from("allocations").delete().eq("expense_id", expenseId);
    } else {
      expensePayload = { ...expensePayload, trip_id: tripId };
      let { data: expense, error } = await supabase.from("expenses").insert(expensePayload).select().single();
      let stripped;
      while ((stripped = stripMissingColumn(error, expensePayload))) {
        expensePayload = stripped;
        ({ data: expense, error } = await supabase.from("expenses").insert(expensePayload).select().single());
      }
      if (error || !expense) {
        setSaving(false);
        Alert.alert("Couldn't save", error?.message ?? "Unknown error");
        return;
      }
      currentExpenseId = expense.id;
    }

    let allocationRows: Record<string, any>[] = splitting
      ? rows.map((r) => ({
          expense_id: currentExpenseId, amount: parseFloat(r.amount) || 0,
          party_id: r.partyId, shopping_list_item_id: r.shoppingItemId, note: r.note || null,
        }))
      : [{ expense_id: currentExpenseId, amount: total, party_id: singleParty, shopping_list_item_id: singleShoppingItem }];

    let { error: allocError } = await supabase.from("allocations").insert(allocationRows);
    let strippedAlloc;
    while ((strippedAlloc = stripMissingColumn(allocError, allocationRows[0]))) {
      const droppedKey = Object.keys(allocationRows[0]).find((k) => !(k in strippedAlloc!));
      allocationRows = allocationRows.map((r) => { const { [droppedKey!]: _drop, ...rest } = r; return rest; });
      ({ error: allocError } = await supabase.from("allocations").insert(allocationRows));
    }

    setSaving(false);
    onSaved();
  }

  function remove() {
    if (!expenseId) return;
    Alert.alert("Delete expense", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await supabase.from("expenses").delete().eq("id", expenseId); // allocations cascade
          onSaved();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.sheetTitle}>{expenseId ? "Edit expense" : "Add expense"}</Text>
            {!loaded ? null : (
              <>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Amount</Text>
                    <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
                  </View>
                  <View style={{ width: 10 }} />
                  <View style={{ width: 90 }}>
                    <Text style={styles.label}>Currency</Text>
                    <View style={styles.currencyPicker}>
                      {currencies.map((c) => (
                        <Pressable key={c.code} style={[styles.currencyChip, currencyCode === c.code && styles.currencyChipActive]} onPress={() => setCurrencyCode(c.code)}>
                          <Text style={[styles.currencyChipText, currencyCode === c.code && styles.currencyChipTextActive]}>{c.code}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>

                <DateField label="Date" value={date} onChange={setDate} />

                <Text style={styles.label}>Type</Text>
                <View style={styles.chipRow}>
                  {EXPENSE_TYPES.map((t) => (
                    <Pressable key={t} style={[styles.chip, expenseType === t && styles.chipActive]} onPress={() => setExpenseType(t)}>
                      <Text style={[styles.chipText, expenseType === t && styles.chipTextActive]}>{EXPENSE_TYPE_LABELS[t]}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>Note</Text>
                <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder={"Duty free, dinner, taxi\u2026"} />

                <Text style={styles.label}>Tax refund (optional)</Text>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={styles.input} value={refundAmount} onChangeText={setRefundAmount}
                      keyboardType="decimal-pad" placeholder={`0.00 ${currencyCode}`}
                    />
                  </View>
                  <View style={{ width: 10 }} />
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={styles.input} value={refundCompany} onChangeText={setRefundCompany}
                      placeholder="Refund company"
                    />
                  </View>
                </View>

                {!(presetItemId && !expenseId) && (
                  <>
                    <Text style={styles.label}>Linked item</Text>
                    <Pressable style={styles.input} onPress={() => setPickerOpen(true)}>
                      <Text style={{ color: linkedItemTitle ? colors.ink : colors.inkSoft }}>
                        {linkedItemTitle || "No item \u2014 tap to link one"}
                      </Text>
                    </Pressable>
                    <View style={{ flexDirection: "row", gap: 16 }}>
                      {linkedItemId && (
                        <Pressable onPress={() => setLinkedItemId(null)}>
                          <Text style={styles.removeText}>Unlink item</Text>
                        </Pressable>
                      )}
                      {linkedItemId && (
                        <Pressable onPress={() => { onClose(); router.push(`/item/${linkedItemId}`); }}>
                          <Text style={styles.viewLinkText}>{"View item \u2192"}</Text>
                        </Pressable>
                      )}
                    </View>
                  </>
                )}

                <View style={styles.switchRow}>
                  <Switch value={splitting} onValueChange={setSplitting} />
                  <Text style={styles.switchLabel}>Split across people / shopping items / partly generic</Text>
                </View>

                {!splitting ? (
                  <>
                    <Text style={styles.label}>Owed by</Text>
                    <View style={styles.chipRow}>
                      <Pressable style={[styles.chip, !singleParty && styles.chipActive]} onPress={() => setSingleParty(null)}>
                        <Text style={[styles.chipText, !singleParty && styles.chipTextActive]}>Me</Text>
                      </Pressable>
                      {localParties.map((p) => (
                        <Pressable key={p.id} style={[styles.chip, singleParty === p.id && styles.chipActive]} onPress={() => setSingleParty(p.id)}>
                          <Text style={[styles.chipText, singleParty === p.id && styles.chipTextActive]}>{p.name}</Text>
                        </Pressable>
                      ))}
                      <Pressable style={styles.addPersonChip} onPress={() => openAddPerson("single")}>
                        <Text style={styles.addPersonChipText}>{"+ Add person"}</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.label}>Shopping list item</Text>
                    <Pressable style={styles.input} onPress={() => setShoppingPickerOpen(true)}>
                      <Text style={{ color: singleShoppingItem ? colors.ink : colors.inkSoft }}>
                        {shoppingItemLabel(singleShoppingItem)}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.label}>Split</Text>
                    {rows.map((row, idx) => (
                      <View key={idx} style={styles.splitRow}>
                        <TextInput
                          style={[styles.input, { flex: 1 }]}
                          value={row.amount}
                          onChangeText={(v) => updateRow(idx, { amount: v })}
                          keyboardType="decimal-pad"
                          placeholder="Amount"
                        />
                        <Text style={styles.splitSubLabel}>Owed by</Text>
                        <View style={styles.chipRow}>
                          <Pressable style={[styles.chip, !row.partyId && styles.chipActive]} onPress={() => updateRow(idx, { partyId: null })}>
                            <Text style={[styles.chipText, !row.partyId && styles.chipTextActive]}>Me</Text>
                          </Pressable>
                          {localParties.map((p) => (
                            <Pressable key={p.id} style={[styles.chip, row.partyId === p.id && styles.chipActive]} onPress={() => updateRow(idx, { partyId: p.id })}>
                              <Text style={[styles.chipText, row.partyId === p.id && styles.chipTextActive]}>{p.name}</Text>
                            </Pressable>
                          ))}
                          <Pressable style={styles.addPersonChip} onPress={() => openAddPerson(idx)}>
                            <Text style={styles.addPersonChipText}>{"+ Add person"}</Text>
                          </Pressable>
                        </View>
                        <Text style={styles.splitSubLabel}>Shopping item</Text>
                        <Pressable style={styles.input} onPress={() => setSplitShoppingPickerIndex(idx)}>
                          <Text style={{ color: row.shoppingItemId ? colors.ink : colors.inkSoft }}>
                            {shoppingItemLabel(row.shoppingItemId)}
                          </Text>
                        </Pressable>
                        <Text style={styles.splitSubLabel}>Note</Text>
                        <TextInput
                          style={styles.input}
                          value={row.note}
                          onChangeText={(v) => updateRow(idx, { note: v })}
                          placeholder={"Optional note for this split…"}
                        />
                        {rows.length > 1 && (
                          <Pressable onPress={() => removeRow(idx)}><Text style={styles.removeText}>Remove row</Text></Pressable>
                        )}
                      </View>
                    ))}
                    <Pressable onPress={addRow}><Text style={styles.addRowText}>+ Add another split</Text></Pressable>
                  </>
                )}

                <Pressable style={styles.button} onPress={save} disabled={saving}>
                  <Text style={styles.buttonText}>{saving ? "Saving\u2026" : expenseId ? "Save changes" : "Add expense"}</Text>
                </Pressable>
                {expenseId && (
                  <Pressable style={styles.deleteButton} onPress={remove}>
                    <Text style={styles.deleteButtonText}>Delete expense</Text>
                  </Pressable>
                )}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>

      <ItemPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(i) => { setLinkedItemId(i.id); setPickerOpen(false); }}
        tripId={tripId}
      />

      <ShoppingItemPickerModal
        visible={shoppingPickerOpen}
        onClose={() => setShoppingPickerOpen(false)}
        onSelect={(s) => { if (s) registerShoppingItem(s as ShoppingListItem); setSingleShoppingItem(s?.id ?? null); setShoppingPickerOpen(false); }}
        tripId={tripId}
      />

      <ShoppingItemPickerModal
        visible={splitShoppingPickerIndex !== null}
        onClose={() => setSplitShoppingPickerIndex(null)}
        onSelect={(s) => {
          if (s) registerShoppingItem(s as ShoppingListItem);
          if (splitShoppingPickerIndex !== null) updateRow(splitShoppingPickerIndex, { shoppingItemId: s?.id ?? null });
          setSplitShoppingPickerIndex(null);
        }}
        tripId={tripId}
      />

      <Modal visible={addPersonOpen} transparent animationType="fade" onRequestClose={() => setAddPersonOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAddPersonOpen(false)}>
          <Pressable style={styles.addPersonCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Add a person</Text>
            <TextInput
              style={styles.input}
              value={newPersonName}
              onChangeText={setNewPersonName}
              placeholder="Name"
              autoFocus
              onSubmitEditing={submitAddPerson}
            />
            <Pressable style={styles.button} onPress={submitAddPerson}>
              <Text style={styles.buttonText}>Add</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%",
    width: "100%", maxWidth: 480, alignSelf: "center",
  },
  sheetTitle: { fontFamily: "Archivo_700Bold" as any, fontWeight: "800", fontSize: 18, color: colors.ink, marginBottom: 12 },
  label: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", marginTop: 14, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  splitSubLabel: { color: colors.inkSoft, fontSize: 10, fontWeight: "600", marginTop: 8, textTransform: "uppercase" },
  input: {
    backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
  },
  row: { flexDirection: "row" },
  currencyPicker: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  currencyChip: { paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperRaised },
  currencyChipActive: { backgroundColor: colors.amber, borderColor: colors.amber },
  currencyChipText: { color: colors.inkSoft, fontWeight: "600", fontSize: 11 },
  currencyChipTextActive: { color: "#fff" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  switchLabel: { color: colors.inkSoft, fontSize: 12, flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperRaised },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { color: colors.inkSoft, fontWeight: "600", fontSize: 12 },
  chipTextActive: { color: "#fff" },
  addPersonChip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1,
    borderColor: colors.teal, borderStyle: "dashed", backgroundColor: "transparent",
  },
  addPersonChipText: { color: colors.teal, fontWeight: "600", fontSize: 12 },
  addPersonCard: {
    backgroundColor: colors.paper, borderRadius: radius.lg, padding: 20,
    width: "100%", maxWidth: 380, alignSelf: "center",
  },
  splitRow: { backgroundColor: colors.paperRaised, borderRadius: radius.md, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.line },
  removeText: { color: colors.coral, fontSize: 11, fontWeight: "600", marginTop: 8 },
  viewLinkText: { color: colors.teal, fontSize: 11, fontWeight: "600", marginTop: 8 },
  addRowText: { color: colors.teal, fontWeight: "600", fontSize: 13, marginTop: 4 },
  button: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 14, alignItems: "center", marginTop: 24 },
  buttonText: { color: colors.paper, fontWeight: "700" },
  deleteButton: { alignItems: "center", marginTop: 14, marginBottom: 10, padding: 10 },
  deleteButtonText: { color: colors.coral, fontWeight: "600", fontSize: 13 },
});
