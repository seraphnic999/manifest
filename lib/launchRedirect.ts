// Set once Home's current-trip auto-redirect has been attempted this app
// session (see app/index.tsx), so it only ever fires on the first load
// after launch — the Home button (the only other way back to Home) must
// keep working as a real trip list even while a trip is current, not
// bounce straight back to its Overview. Reset on sign-out (from wherever
// sign-out is triggered — Home or Settings) so the next sign-in gets its
// own fresh first-load redirect, same as a cold app launch would.
let hasCheckedLaunchRedirect = false;

export function getHasCheckedLaunchRedirect(): boolean {
  return hasCheckedLaunchRedirect;
}

export function setHasCheckedLaunchRedirect(value: boolean): void {
  hasCheckedLaunchRedirect = value;
}
