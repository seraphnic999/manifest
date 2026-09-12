// Plain-text export for a companion's details + selected travel documents
// — the text-block sibling of lib/exportItinerary.ts's PDF export. Uses
// core React Native Share (not expo-sharing, which needs a file URI) since
// this shares a text message, not a file.
import { Share } from "react-native";
import { Companion, TravelDocument } from "./types";
import { companionFullName, relationshipLabel } from "./companions";
import { documentTypeLabel } from "./travelDocuments";
import { formatDateDDMMYYYY } from "./dateFormat";

function line(label: string, value: string | null | undefined): string | null {
  return value ? `${label}: ${value}` : null;
}

export function buildCompanionExportText(companion: Companion, documents: TravelDocument[]): string {
  const header = [
    companionFullName(companion),
    !companion.is_self ? line("Relationship", relationshipLabel(companion.relationship)) : null,
    line("Born", companion.birth_date ? formatDateDDMMYYYY(companion.birth_date) : null),
  ].filter(Boolean).join("\n");

  const docBlocks = documents.map((d) => {
    const fields = [
      line("Number", d.document_number),
      line("Issuing country", d.issuing_country),
      line("Issued", d.issue_date ? formatDateDDMMYYYY(d.issue_date) : null),
      line("Expires", d.expiry_date ? formatDateDDMMYYYY(d.expiry_date) : null),
      line("Notes", d.notes),
    ].filter(Boolean).join("\n");
    return `${documentTypeLabel(d.type).toUpperCase()}\n${fields}`;
  });

  return [header, ...docBlocks].join("\n\n");
}

export async function shareCompanionText(text: string): Promise<void> {
  await Share.share({ message: text });
}
