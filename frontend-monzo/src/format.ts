// ₹/INR formatting with Indian digit grouping (lakh/crore). PRD §6 localization.
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export function rupees(paise: number): string {
  return inr.format(paise / 100);
}

// Whole-rupee variant (no decimals) — used where the design shows ₹24,500.
export function rupees0(paise: number): string {
  return inr0.format(paise / 100);
}

// Signed, for balances: green if owed to you, red if you owe.
export function signedRupees(paise: number): string {
  const s = rupees(Math.abs(paise));
  return paise < 0 ? `-${s}` : s;
}
