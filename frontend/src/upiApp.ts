// The user's preferred UPI app. Purely a client-side preference (localStorage):
// settlements always use the standard `upi://pay` intent so any installed app
// can honour them; the preference just decides which app we surface first.
export interface UpiApp { key: string; label: string; }

const DEFAULT_APP: UpiApp = { key: 'any', label: 'Any UPI App' };
export const UPI_APPS: UpiApp[] = [
  DEFAULT_APP,
  { key: 'gpay', label: 'Google Pay' },
  { key: 'phonepe', label: 'PhonePe' },
  { key: 'paytm', label: 'Paytm' },
  { key: 'bhim', label: 'BHIM' },
];

const KEY = 'su_upi_app';

export function getUpiApp(): UpiApp {
  const k = localStorage.getItem(KEY);
  return UPI_APPS.find((a) => a.key === k) ?? DEFAULT_APP;
}

export function setUpiApp(key: string): void {
  localStorage.setItem(KEY, key);
}
