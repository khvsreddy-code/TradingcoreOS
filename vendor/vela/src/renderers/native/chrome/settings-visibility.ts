// The settings-dialog VISIBILITY POLICY â€” pure logic behind `settings: { hidden }`.
//
// Every tab, group, and row the dialog renders carries a stable hierarchical id
// (dot-separated, kebab-case). The policy is a flat list of ids to hide; an id hides
// its whole subtree, and hiding is presentation-only â€” hidden values keep being
// stored, delivered, and applied. Default: everything visible.
//
// Id derivation is IMPLICIT so contributors need no extra wiring:
// - built-in tabs/groups/rows: the static ids stamped by `SettingsDialog.open`
//   (enumerated in BUILTIN_SETTINGS_IDS below â€” keep the two in sync);
// - chart-type SDK sections: `type:<typeId>` for the tab, the row's own bag key for
//   value rows, the label's slug for headings/headers, the title's slug for
//   subsections;
// - host sections: the section/row `id` field when given, else the title/label slug.
//
// Kept free of DOM so the policy is unit-testable under the node environment.
import { chartTypes, normalizeSettingsRow, type SettingsRowDescriptor } from '../../../chart-types/registry';
import { hasOwnCandlePaint } from '../core/chartConfig';
import { sourceText } from '../../../core/i18n/text';
import type { MessageLike } from '../../../core/i18n/types';

export type { SettingsVisibilityPolicy } from '../../../core/options';

/** Kebab-case slug of a display label â€” the implicit id of label-only elements. A message
 *  slugs its English source, so an id never changes with the display langua¶»§q«^