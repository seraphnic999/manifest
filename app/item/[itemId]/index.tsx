import { useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, Linking, Pressable, Image, ActivityIndicator, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Alert } from "@/lib/alert";
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { supabase } from "@/lib/supabase";
import Icon from "@/components/icons/Icon";
import { colors, radius, fonts } from "@/lib/theme";
import { Item, ItemPhoto, Expense, TripCurrency, TripParty, Keeper } from "@/lib/types";
import { fetchKeeperById } from "@/lib/keepers";
import { uploadItemPhoto, uploadItemDocument, fetchItemPhotosWithUrls, deleteItemPhoto, isImageAttachment } from "@/lib/photos";
import { downloadAttachment } from "@/lib/downloadAttachment";
import { fetchLinkedItems, LinkedItemSummary } from "@/lib/itemLinks";
import { categoryForDbType, itemTypeTag } from "@/lib/itemTypeMeta";
import { itemOrigin, ITEM_ORIGIN_LABEL } from "@/lib/itemOrigin";
import { computeDurationMinutes, formatDuration } from "@/lib/duration";
import { formatDateDDMMYYYY, formatDateDDMM } from "@/lib/dateFormat";
import { normalizeTimeHHMM } from "@/lib/timeFormat";
import AddExpenseModal from "@/components/AddExpenseModal";
import AddShoppingItemModal from "@/components/AddShoppingItemModal";
import QuickNotesList from "@/components/QuickNotesList";
import HeaderIconButton from "@/components/HeaderIconButton";
import HomeButton from "@/components/HomeButton";
import TripTabBar from "@/components/TripTabBar";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import OfflineBanner from "@/components/OfflineBanner";
import { fetchFlightStatusForItem, refreshFlightStatus } from "@/lib/flightStatus";
import FlightStatusCard from "@/components/FlightStatusCard";
import AddToKeepersModal from "@/components/AddToKeepersModal";
import IdentifyCandidatesModal from "@/components/IdentifyCandidatesModal";
import ItemResearchReviewModal from "@/components/ItemResearchReviewModal";
import { itemResearchEligible, useLatestItemResearchJob } from "@/lib/itemResearch";

type PhotoWithUrl = ItemPhoto & { url: string };
type LinkedShoppingItem = { id: string; name: string; quantity: number; allocations: { id: string }[] };

interface ItemDetailData {
  item: Item;
  photos: PhotoWithUrl[];
  expenses: Expense[];
  linkedShoppingItems: LinkedShoppingItem[];
  linkedItems: LinkedItemSummary[];
  keeper: Keeper | null;
}

async function fetchItemDetail(itemId: string): Promise<ItemDetailData | null> {
  const { data: item, error } = await supabase.from("items").select("*").eq("id", itemId).single();
  if (error) throw error;
  if (!item) return null;

  const [photos, expensesRes, shoppingRes, linkedItems, keeper] = await Promise.all([
    fetchItemPhotosWithUrls(itemId),
    supabase.from("expenses").select("*").eq("item_id", itemId).order("expense_date", { ascending: false }),
    supabase.from("shopping_list_items").select("id, name, quantity, allocations(id)").eq("item_id", itemId),
    fetchLinkedItems(itemId),
    item.keeper_id ? fetchKeeperById(item.keeper_id) : Promise.resolve(null),
  ]);
  if (expensesRes.error) throw expensesRes.error;
  if (shoppingRes.error) throw shoppingRes.error;

  return {
    item: item as Item,
    photos,
    expenses: (expensesRes.data ?? []) as Expense[],
    linkedShoppingItems: (shoppingRes.data ?? []) as unknown as LinkedShoppingItem[],
    linkedItems,
    keeper,
  };
}

async function fetchTripExtras(tripId: string): Promise<{ currencies: TripCurrency[]; parties: TripParty[] }> {
  const [{ data: currencies, error: currenciesError }, { data: parties, error: partiesError }] = await Promise.all([
    supabase.from("trip_currencies").select("*").eq("trip_id", tripId),
    supabase.from("trip_parties").select("*").eq("trip_id", tripId),
  ]);
  if (currenciesError) throw currenciesError;
  if (partiesError) throw partiesError;
  return { currencies: (currencies ?? []) as TripCurrency[], parties: (parties ?? []) as TripParty[] };
}

// Everything that's deliberately hidden from the day view lives here:
// booking_source, vendor, link, confirmation_code, address, phone,
// notes, photos, expenses, shopping list links, plus (TODO) sub-steps,
// alternatives.
export default function ItemDetails() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isOnline = useNetworkStatus();
  const [uploading, setUploading] = useState(false);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null);
  const [shoppingFormOpen, setShoppingFormOpen] = useState(false);
  const [editShoppingId, setEditShoppingId] = useState<string | null>(null);
  const [photoSourceOpen, setPhotoSourceOpen] = useState(false);
  const [flightStatusRefreshing, setFlightStatusRefreshing] = useState(false);
  const [keepersModalOpen, setKeepersModalOpen] = useState(false);
  const [identifyOpen, setIdentifyOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const { job: latestResearchJob, reload: reloadResearchJob } = useLatestItemResearchJob(itemId);
  const researchInProgress = latestResearchJob?.status === "queued" || latestResearchJob?.status === "researching";
  const readyResearchJob = latestResearchJob?.status === "ready" ? latestResearchJob : null;

  const { data, error: itemError, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["itemDetail", itemId],
    queryFn: () => fetchItemDetail(itemId),
  });
  const item = data?.item ?? null;
  const photos = data?.photos ?? [];
  const expenses = data?.expenses ?? [];
  const linkedShoppingItems = data?.linkedShoppingItems ?? [];
  const linkedItems = data?.linkedItems ?? [];
  const keeper = data?.keeper ?? null;

  const { data: tripExtras } = useQuery({
    queryKey: ["itemTripExtras", item?.trip_id],
    queryFn: () => fetchTripExtras(item!.trip_id),
    enabled: !!item?.trip_id,
  });
  const currencies = tripExtras?.currencies ?? [];
  const parties = tripExtras?.parties ?? [];

  const itemIsFlight = item?.type === "flight" && !item?.is_stay_span;
  const { data: flightStatusRow, refetch: refetchFlightStatus } = useQuery({
    queryKey: ["flightStatus", itemId],
    queryFn: () => fetchFlightStatusForItem(itemId),
    enabled: itemIsFlight,
  });

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  function requireOnline(): boolean {
    if (isOnline) return true;
    Alert.alert("You're offline", "Connect to the internet to make changes.");
    return false;
  }

  async function addPhoto() {
    if (!requireOnline()) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to attach photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      await uploadItemPhoto(itemId, result.assets[0]);
      refetch();
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Unknown error");
    }
    setUploading(false);
  }

  async function takePhoto() {
    if (!requireOnline()) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow camera access to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      await uploadItemPhoto(itemId, result.assets[0]);
      refetch();
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Unknown error");
    }
    setUploading(false);
  }

  async function addDocument() {
    if (!requireOnline()) return;
    const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      await uploadItemDocument(itemId, result.assets[0]);
      refetch();
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Unknown error");
    }
    setUploading(false);
  }

  function attachmentDisplayName(photo: PhotoWithUrl): string {
    return photo.file_name || photo.storage_path.split("/").pop() || "attachment";
  }

  function openAttachment(photo: PhotoWithUrl) {
    downloadAttachment(photo.url, attachmentDisplayName(photo)).catch((e: any) => {
      Alert.alert("Download failed", e.message ?? "Unknown error");
    });
  }

  async function removePhoto(photo: PhotoWithUrl) {
    if (!requireOnline()) return;
    Alert.alert("Remove attachment", "Delete this attachment?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteItemPhoto(photo); refetch(); } },
    ]);
  }

  function duplicateItem() {
    if (!item) return;
    const category = categoryForDbType(item.type).key;
    const params = new URLSearchParams({
      tripId: item.trip_id,
      dayId: item.day_id ?? "",
      date: item.start_date ?? "",
      category,
      duplicateFrom: item.id,
    });
    router.push(`/item/new?${params.toString()}`);
  }

  async function handleRefreshFlightStatus() {
    setFlightStatusRefreshing(true);
    const { error } = await refreshFlightStatus(itemId);
    setFlightStatusRefreshing(false);
    if (error) {
      Alert.alert("Couldn't refresh flight status", error);
      return;
    }
    refetchFlightStatus();
  }

  function deleteItem() {
    if (!requireOnline()) return;
    Alert.alert("Delete item", "Move this item to the archive?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await supabase.from("items").update({ deleted_at: new Date().toISOString() }).eq("id", itemId);
          router.back();
        },
      },
    ]);
  }

  // The header is set here (not further down, alongside the rest of the
  // custom UI) specifically so it renders on every path — loading, error,
  // and success alike. Without that, a failed or still-pending fetch would
  // return before ever reaching headerShown:false, and React Navigation's
  // own fallback header would show the raw route pattern as its title.
  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.paper }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingCenter}>
          {itemError ? (
            <>
              <Text style={styles.loadingErrorTitle}>Couldn't load this item</Text>
              <Text style={styles.loadingErrorMessage}>
                {(itemError as any)?.message ?? "Something went wrong."}
              </Text>
              <Pressable style={styles.loadingRetryButton} onPress={() => refetch()}>
                <Text style={styles.loadingRetryButtonText}>Try again</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={colors.blue} />
          )}
        </View>
      </View>
    );
  }

  const flightNumber = (item.custom_fields as any)?.flight_number as string | undefined;
  const isFlight = item.type === "flight" && !item.is_stay_span;
  const flightDurationMinutes = isFlight
    ? computeDurationMinutes(item.start_date, item.time_start, item.end_date, item.time_end)
    : null;

  // Ratings & reviews — proposed by item research, applied into custom_fields
  // the same way opening_hours/price_range already are (see lib/itemResearch.ts).
  const cf = (item.custom_fields as Record<string, unknown>) ?? {};
  const origin = itemOrigin(cf);
  const originLabel = origin ? ITEM_ORIGIN_LABEL[origin] : null;
  const googleRating = typeof cf.google_rating === "number" ? cf.google_rating : null;
  const googleRatingCount = typeof cf.google_rating_count === "number" ? cf.google_rating_count : null;
  const shortDescription = typeof cf.short_description === "string" ? cf.short_description : null;
  const reviewHighlights = Array.isArray(cf.review_highlights) ? (cf.review_highlights as string[]) : [];
  const awardBadges = Array.isArray(cf.award_badges) ? (cf.award_badges as string[]) : [];
  const hasRatingsData =
    (googleRating != null && googleRatingCount != null) || !!shortDescription || reviewHighlights.length > 0 || awardBadges.length > 0;

  const fields: [string, string | null][] = item.is_stay_span
    ? [
        ["Check-in", [formatDateDDMMYYYY(item.start_date), normalizeTimeHHMM(item.time_start)].filter(Boolean).join(" \u00b7 ") || null],
        ["Check-out", [formatDateDDMMYYYY(item.end_date), normalizeTimeHHMM(item.time_end)].filter(Boolean).join(" \u00b7 ") || null],
        ["Booking source", item.booking_source],
        ["Confirmation", item.confirmation_code],
        ["Vendor", item.vendor],
        ["Address", item.address],
        ["Phone", item.phone],
      ]
    : isFlight
    ? [
        ["Departure", [formatDateDDMMYYYY(item.start_date), normalizeTimeHHMM(item.time_start)].filter(Boolean).join(" \u00b7 ") || null],
        ["Arrival", [formatDateDDMMYYYY(item.end_date), normalizeTimeHHMM(item.time_end)].filter(Boolean).join(" \u00b7 ") || null],
        ["Duration", flightDurationMinutes !== null && flightDurationMinutes >= 0 ? formatDuration(flightDurationMinutes) : null],
        ["Vendor", item.vendor],
        ["Flight number", flightNumber ?? null],
        ["Booking source", item.booking_source],
        ["Confirmation", item.confirmation_code],
        ["Address", item.address],
        ["Phone", item.phone],
      ]
    : [
        ["Date", formatDateDDMMYYYY(item.start_date) || null],
        ["Time", normalizeTimeHHMM(item.time_start) || null],
        ["Vendor", item.vendor],
        ["Flight number", flightNumber ?? null],
        ["Booking source", item.booking_source],
        ["Confirmation", item.confirmation_code],
        ["Address", item.address],
        ["Phone", item.phone],
      ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* A fully custom header, not react-navigation's: its web header
          didn't reliably constrain a long title against these header-right
          buttons — at some viewport widths the title text overflowed
          straight past them instead of truncating, since our headerTitle
          override's flex:1 was sized against the library's own internal
          layout assumptions rather than this row's actual content. Owning
          the row directly makes the title/buttons split a plain flexbox
          fact we control. */}
      <View style={[styles.customHeader, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Icon name="back" size={25} color={colors.blue} />
        </Pressable>
        <View style={styles.customHeaderTitleWrap}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.headerTitleText}>{item.title}</Text>
        </View>
        <View style={styles.headerButtons}>
          <HeaderIconButton onPress={deleteItem}>
            <Icon name="trash" size={25} color={colors.coral} />
          </HeaderIconButton>
          <HeaderIconButton onPress={duplicateItem} accessibilityLabel="Duplicate item">
            <Icon name="duplicate" size={25} color={colors.blue} />
          </HeaderIconButton>
          <HeaderIconButton onPress={() => router.push(`/item/${itemId}/edit`)}>
            <Icon name="edit" size={25} color={colors.blue} />
          </HeaderIconButton>
          <HomeButton />
        </View>
      </View>

      <OfflineBanner dataUpdatedAt={!isOnline ? dataUpdatedAt : undefined} />
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.typeTag}>{itemTypeTag(item.type)}</Text>
      <Text style={styles.title}>{item.title}</Text>
      {originLabel && <Text style={styles.originBadge}>{originLabel}</Text>}

      {fields.map(([label, value]) =>
        value ? (
          <View key={label} style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <Text style={styles.fieldValue}>{value}</Text>
          </View>
        ) : null
      )}

      {hasRatingsData && (
        <View style={styles.ratingsSection}>
          {googleRating != null && googleRatingCount != null && (
            <View style={styles.ratingLine}>
              <Icon name="star" size={16} color={colors.gold} />
              <Text style={styles.ratingScore}>{googleRating.toFixed(1)}</Text>
              <Text style={styles.ratingCount}>({googleRatingCount.toLocaleString()})</Text>
            </View>
          )}
          {!!shortDescription && <Text style={styles.shortDescription}>{shortDescription}</Text>}
          {awardBadges.length > 0 && (
            <View style={styles.badgeRow}>
              {awardBadges.map((badge, i) => (
                <View key={i} style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              ))}
            </View>
          )}
          {reviewHighlights.length > 0 && (
            <View style={styles.highlightsBox}>
              {reviewHighlights.map((h, i) => (
                <View key={i} style={styles.highlightRow}>
                  <Text style={styles.highlightBullet}>{"•"}</Text>
                  <Text style={styles.highlightText}>{h}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {item.link ? (
        <Pressable onPress={() => Linking.openURL(item.link!)} style={styles.linkButton}>
          <Text style={styles.linkButtonText}>Open link</Text>
        </Pressable>
      ) : null}

      {item.google_maps_link ? (
        <Pressable
          onPress={() => Linking.openURL(item.google_maps_link!)}
          style={styles.mapLinkButton}
        >
          <Icon name="locate" size={20} color={colors.blue} />
          <Text style={styles.mapLinkButtonText}>Open in Google Maps</Text>
        </Pressable>
      ) : null}

      {item.latitude != null && item.longitude != null ? (
        <Pressable
          onPress={() => router.push(`/trip/${item.trip_id}/map?focusItemId=${item.id}`)}
          style={styles.mapLinkButton}
        >
          <Icon name="map" size={20} color={colors.blue} />
          <Text style={styles.mapLinkButtonText}>View on map</Text>
        </Pressable>
      ) : null}

      {keeper ? (
        <Pressable style={styles.keeperButton} onPress={() => router.push(`/keepers?openKeeperId=${keeper.id}`)}>
          <Icon name="star" size={20} color={colors.gold} />
          <Text style={styles.keeperButtonText}>Keeper</Text>
          <View style={styles.keeperStars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Icon key={n} name="star" size={13} color={n <= (keeper.rating ?? 0) ? colors.gold : "rgba(201,150,46,0.35)"} />
            ))}
          </View>
        </Pressable>
      ) : (
        <Pressable style={styles.mapLinkButton} onPress={() => setKeepersModalOpen(true)}>
          <Icon name="star" size={20} color={colors.blue} />
          <Text style={styles.mapLinkButtonText}>Add to Keepers</Text>
        </Pressable>
      )}

      {itemResearchEligible(item.type) && (
        researchInProgress ? (
          <View style={[styles.mapLinkButton, styles.researchProgressButton]}>
            <ActivityIndicator size="small" color={colors.inkSoft} />
            <Text style={styles.researchProgressButtonText}>Research in progress…</Text>
          </View>
        ) : readyResearchJob ? (
          <Pressable style={[styles.mapLinkButton, styles.researchReadyButton]} onPress={() => setReviewOpen(true)}>
            <Icon name="research" size={20} color={colors.gold} />
            <Text style={styles.researchReadyButtonText}>Pending review</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.mapLinkButton} onPress={() => setIdentifyOpen(true)}>
            <Icon name="research" size={20} color={colors.blue} />
            <Text style={styles.mapLinkButtonText}>Fill in details</Text>
          </Pressable>
        )
      )}

      {isFlight && flightNumber ? (
        <FlightStatusCard
          row={flightStatusRow}
          loading={flightStatusRefreshing}
          onRefresh={() => { if (requireOnline()) handleRefreshFlightStatus(); }}
          onOpenLog={() => router.push(`/item/${itemId}/flight-log`)}
        />
      ) : null}

      <Text style={styles.sectionLabel}>Expenses</Text>
      {expenses.map((e) => (
        <Pressable key={e.id} style={styles.expenseRow} onPress={() => setEditExpenseId(e.id)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.expenseDesc}>{e.note || "Expense"}</Text>
            {e.expense_date && <Text style={styles.expenseDate}>{formatDateDDMMYYYY(e.expense_date)}</Text>}
          </View>
          <Text style={styles.expenseAmt}>{e.amount} {e.currency_code}</Text>
        </Pressable>
      ))}
      {expenses.length === 0 && <Text style={styles.empty}>No expenses linked yet.</Text>}
      <Pressable style={styles.addExpenseButton} onPress={() => { if (requireOnline()) setExpenseFormOpen(true); }}>
        <Text style={styles.addExpenseButtonText}>+ Add expense</Text>
      </Pressable>

      <Text style={styles.sectionLabel}>Shopping list</Text>
      {linkedShoppingItems.map((s) => {
        const bought = s.allocations.length > 0;
        return (
          <Pressable key={s.id} style={styles.expenseRow} onPress={() => setEditShoppingId(s.id)}>
            <View style={[styles.miniCheckbox, bought && styles.miniCheckboxChecked]} />
            <Text style={[styles.expenseDesc, bought && styles.shoppingBought, { flex: 1 }]}>
              {s.name}{s.quantity > 1 ? ` \u00d7${s.quantity}` : ""}
            </Text>
          </Pressable>
        );
      })}
      {linkedShoppingItems.length === 0 && <Text style={styles.empty}>Nothing on the shopping list for this yet.</Text>}
      <Pressable style={styles.addExpenseButton} onPress={() => { if (requireOnline()) setShoppingFormOpen(true); }}>
        <Text style={styles.addExpenseButtonText}>+ Add to shopping list</Text>
      </Pressable>

      <QuickNotesList itemId={itemId} />

      {linkedItems.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Linked items</Text>
          {linkedItems.map((li) => (
            <Pressable key={li.id} style={styles.expenseRow} onPress={() => router.push(`/item/${li.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.expenseDesc}>{li.title}</Text>
                <Text style={styles.expenseDate}>
                  {[li.day_date ? formatDateDDMM(li.day_date) : null, normalizeTimeHHMM(li.time_start)].filter(Boolean).join(" · ") || itemTypeTag(li.type)}
                </Text>
              </View>
              <Icon name="forward" size={20} color={colors.blue} />
            </Pressable>
          ))}
        </>
      )}

      <Text style={styles.sectionLabel}>Attachments</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
        {photos.map((p) =>
          isImageAttachment(p) ? (
            <Pressable key={p.id} onPress={() => openAttachment(p)} onLongPress={() => removePhoto(p)} style={styles.photoWrap}>
              <Image source={{ uri: p.url }} style={styles.photo} />
            </Pressable>
          ) : (
            <Pressable key={p.id} onPress={() => openAttachment(p)} onLongPress={() => removePhoto(p)} style={styles.photoWrap}>
              <View style={styles.fileTile}>
                <Icon name="document" size={28} color={colors.blue} />
                <Text numberOfLines={2} style={styles.fileTileName}>{attachmentDisplayName(p)}</Text>
              </View>
            </Pressable>
          )
        )}
        <Pressable style={styles.addPhotoTile} onPress={() => setPhotoSourceOpen(true)} disabled={uploading}>
          {uploading ? <ActivityIndicator color={colors.inkSoft} /> : <Text style={styles.addPhotoText}>+ Photo</Text>}
        </Pressable>
        <Pressable style={styles.addPhotoTile} onPress={addDocument} disabled={uploading}>
          {uploading ? <ActivityIndicator color={colors.inkSoft} /> : <Text style={styles.addPhotoText}>+ File</Text>}
        </Pressable>
      </ScrollView>
      {photos.length > 0 && <Text style={styles.hint}>Tap an attachment to download it, long-press to remove it.</Text>}

      {item && (
        <>
          <AddExpenseModal
            visible={expenseFormOpen}
            onClose={() => setExpenseFormOpen(false)}
            onSaved={() => { setExpenseFormOpen(false); refetch(); }}
            tripId={item.trip_id}
            currencies={currencies}
            parties={parties}
            presetItemId={item.id}
          />
          <AddExpenseModal
            visible={!!editExpenseId}
            onClose={() => setEditExpenseId(null)}
            onSaved={() => { setEditExpenseId(null); refetch(); }}
            tripId={item.trip_id}
            currencies={currencies}
            parties={parties}
            expenseId={editExpenseId ?? undefined}
          />
          <AddShoppingItemModal
            visible={shoppingFormOpen}
            onClose={() => setShoppingFormOpen(false)}
            onSaved={() => { setShoppingFormOpen(false); refetch(); }}
            tripId={item.trip_id}
            presetItemId={item.id}
          />
          <AddShoppingItemModal
            visible={!!editShoppingId}
            onClose={() => setEditShoppingId(null)}
            onSaved={() => { setEditShoppingId(null); refetch(); }}
            tripId={item.trip_id}
            editId={editShoppingId ?? undefined}
          />
          <AddToKeepersModal
            visible={keepersModalOpen}
            onClose={() => setKeepersModalOpen(false)}
            item={item}
            onSaved={refetch}
          />
          <IdentifyCandidatesModal
            visible={identifyOpen}
            onClose={() => setIdentifyOpen(false)}
            item={item}
            onQueued={reloadResearchJob}
          />
          {readyResearchJob && (
            <ItemResearchReviewModal
              visible={reviewOpen}
              onClose={() => setReviewOpen(false)}
              job={readyResearchJob}
              onChanged={() => { reloadResearchJob(); refetch(); }}
            />
          )}
        </>
      )}

      <Modal visible={photoSourceOpen} transparent animationType="fade" onRequestClose={() => setPhotoSourceOpen(false)}>
        <Pressable style={styles.photoSourceBackdrop} onPress={() => setPhotoSourceOpen(false)}>
          <Pressable style={styles.photoSourceSheet} onPress={(e) => e.stopPropagation()}>
            <Pressable
              style={styles.photoSourceOption}
              onPress={() => { setPhotoSourceOpen(false); takePhoto(); }}
            >
              <Icon name="camera" size={20} color={colors.blue} />
              <Text style={styles.photoSourceOptionText}>Take Photo</Text>
            </Pressable>
            <View style={styles.photoSourceDivider} />
            <Pressable
              style={styles.photoSourceOption}
              onPress={() => { setPhotoSourceOpen(false); addPhoto(); }}
            >
              <Icon name="gallery" size={20} color={colors.blue} />
              <Text style={styles.photoSourceOptionText}>Choose from Library</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      </ScrollView>
      <TripTabBar tripId={item.trip_id} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 20 },
  ratingsSection: { marginTop: 4, marginBottom: 12 },
  ratingLine: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  ratingScore: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  ratingCount: { color: colors.inkSoft, fontSize: 13 },
  shortDescription: { color: colors.ink, fontSize: 14, lineHeight: 20, marginBottom: 10 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  badge: { backgroundColor: colors.goldSoft, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  badgeText: { color: colors.gold, fontWeight: "700", fontSize: 12 },
  highlightsBox: { backgroundColor: colors.paperRaised, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 6 },
  highlightRow: { flexDirection: "row", gap: 8 },
  highlightBullet: { color: colors.lightBlue, fontSize: 14 },
  highlightText: { flex: 1, color: colors.ink, fontSize: 13.5, lineHeight: 19 },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingErrorTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginBottom: 8, textAlign: "center" },
  loadingErrorMessage: { color: colors.inkSoft, fontSize: 13, textAlign: "center", marginBottom: 18 },
  loadingRetryButton: { backgroundColor: colors.ink, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 24 },
  loadingRetryButtonText: { color: colors.paper, fontWeight: "700" },
  customHeader: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 10,
    backgroundColor: colors.paperRaised, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  backBtn: { padding: 6, marginRight: 4 },
  customHeaderTitleWrap: { flex: 1, minWidth: 0, marginHorizontal: 4 },
  headerButtons: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 8 },
  headerTitleText: { fontSize: 17, fontWeight: "700", color: colors.ink },
  typeTag: { fontFamily: "JetBrainsMono_600SemiBold", color: colors.lightBlue, fontWeight: "600", fontSize: 11 },
  title: { color: colors.ink, fontWeight: "800", fontSize: 22, marginVertical: 6 },
  originBadge: { color: colors.inkSoft, fontSize: 12, fontStyle: "italic", marginTop: -2, marginBottom: 6 },
  fieldRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  fieldLabel: { color: colors.inkSoft, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { color: colors.ink, fontSize: 15, marginTop: 2 },
  linkButton: { backgroundColor: colors.ink, borderRadius: radius.md, padding: 12, alignItems: "center", marginTop: 16 },
  linkButtonText: { color: colors.paper, fontWeight: "700" },
  mapLinkButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: colors.lightBlue, borderRadius: radius.md, padding: 12, marginTop: 10,
  },
  mapLinkButtonText: { color: colors.lightBlue, fontWeight: "700" },
  researchProgressButton: { borderColor: colors.line, backgroundColor: colors.paperRaised },
  researchProgressButtonText: { color: colors.inkSoft, fontWeight: "700" },
  researchReadyButton: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  researchReadyButtonText: { color: colors.gold, fontWeight: "700" },
  keeperButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.goldSoft,
    borderRadius: radius.md, padding: 12, marginTop: 10,
  },
  keeperButtonText: { color: colors.gold, fontWeight: "700" },
  keeperStars: { flexDirection: "row", gap: 1, marginLeft: 4 },
  sectionLabel: {
    color: colors.inkSoft, fontWeight: "700", fontSize: 12,
    textTransform: "uppercase", letterSpacing: 1, marginTop: 20, marginBottom: 4,
  },
  photoWrap: { marginRight: 8 },
  photo: { width: 90, height: 90, borderRadius: radius.md, backgroundColor: colors.paperRaised },
  fileTile: {
    width: 90, height: 90, borderRadius: radius.md, backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", padding: 6,
  },
  fileTileName: { color: colors.inkSoft, fontSize: 10, textAlign: "center", marginTop: 4 },
  addPhotoTile: {
    width: 90, height: 90, borderRadius: radius.md, backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center",
  },
  addPhotoText: { color: colors.inkSoft, fontWeight: "600", fontSize: 12 },
  hint: { color: colors.inkSoft, fontSize: 11, marginTop: 6, fontStyle: "italic", marginBottom: 30 },
  photoSourceBackdrop: { flex: 1, backgroundColor: "rgba(33,47,61,0.5)", justifyContent: "flex-end" },
  photoSourceSheet: {
    backgroundColor: colors.paperRaised, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 8, paddingBottom: 24, width: "100%", maxWidth: 480, alignSelf: "center",
  },
  photoSourceOption: { flexDirection: "row", alignItems: "center", gap: 12, padding: 18 },
  photoSourceOptionText: { color: colors.ink, fontWeight: "600", fontSize: 15 },
  photoSourceDivider: { height: 1, backgroundColor: colors.line, marginHorizontal: 18 },
  expenseRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.paperRaised,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, marginBottom: 6,
  },
  expenseDesc: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  expenseDate: { color: colors.inkSoft, fontSize: 11, marginTop: 2 },
  expenseAmt: { fontFamily: "JetBrainsMono_600SemiBold", color: colors.ink, fontWeight: "600", fontSize: 13 },
  empty: { color: colors.inkSoft, fontSize: 12, fontStyle: "italic", marginTop: 4 },
  addExpenseButton: {
    borderWidth: 1, borderColor: colors.line, borderStyle: "dashed", borderRadius: radius.md,
    padding: 12, alignItems: "center", marginTop: 8, marginBottom: 30,
  },
  addExpenseButtonText: { color: colors.lightBlue, fontWeight: "700", fontSize: 13 },
  miniCheckbox: { width: 16, height: 16, borderRadius: 5, borderWidth: 2, borderColor: colors.lightBlue, marginRight: 10 },
  miniCheckboxChecked: { backgroundColor: colors.lightBlue },
  shoppingBought: { color: colors.inkSoft, textDecorationLine: "line-through" },
});
