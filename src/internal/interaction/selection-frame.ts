type SelectionInput = Readonly<{ data?: unknown; spec?: unknown; state: unknown; viewport: unknown; selection: unknown; known: unknown }>;
/** Pending layout cannot change a gesture's domain identity. A new accepted
 * domain/state/viewport/selection still requires its own commit. */
export function sameSelectionInput(accepted: SelectionInput | null, committed: SelectionInput | null): boolean {
  return !!accepted && !!committed && accepted.data === committed.data && accepted.spec === committed.spec && accepted.state === committed.state && accepted.viewport === committed.viewport && accepted.selection === committed.selection && accepted.known === committed.known;
}
