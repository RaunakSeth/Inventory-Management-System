import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSettings } from "./settings";

export type CurrencyCode =
  | "USD" | "INR" | "EUR" | "GBP" | "CAD" | "AUD" | "SGD"
  | "AED" | "SAR" | "JPY" | "CNY" | "NZD" | "CHF" | "SEK"
  | "NOK" | "DKK" | "PLN" | "BRL" | "MXN" | "ZAR";

export const CURRENCIES: { code: CurrencyCode; label: string; locale: string }[] = [
  { code: "INR", label: "Indian Rupee (₹)", locale: "en-IN" },
  { code: "USD", label: "US Dollar ($)", locale: "en-US" },
  { code: "EUR", label: "Euro (€)", locale: "de-DE" },
  { code: "GBP", label: "British Pound (£)", locale: "en-GB" },
  { code: "CAD", label: "Canadian Dollar (C$)", locale: "en-CA" },
  { code: "AUD", label: "Australian Dollar (A$)", locale: "en-AU" },
  { code: "SGD", label: "Singapore Dollar (S$)", locale: "en-SG" },
  { code: "AED", label: "UAE Dirham (AED)", locale: "en-AE" },
  { code: "SAR", label: "Saudi Riyal (SAR)", locale: "en-SA" },
  { code: "JPY", label: "Japanese Yen (¥)", locale: "ja-JP" },
  { code: "CNY", label: "Chinese Yuan (¥)", locale: "zh-CN" },
  { code: "NZD", label: "New Zealand Dollar (NZ$)", locale: "en-NZ" },
  { code: "CHF", label: "Swiss Franc (CHF)", locale: "de-CH" },
  { code: "SEK", label: "Swedish Krona (kr)", locale: "sv-SE" },
  { code: "NOK", label: "Norwegian Krone (kr)", locale: "nb-NO" },
  { code: "DKK", label: "Danish Krone (kr)", locale: "da-DK" },
  { code: "PLN", label: "Polish Zloty (zł)", locale: "pl-PL" },
  { code: "BRL", label: "Brazilian Real (R$)", locale: "pt-BR" },
  { code: "MXN", label: "Mexican Peso (MX$)", locale: "es-MX" },
  { code: "ZAR", label: "South African Rand (R)", locale: "en-ZA" },
];

const REGION_CURRENCY: Record<string, CurrencyCode> = {
  IN: "INR", US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", SG: "SGD",
  AE: "AED", SA: "SAR", JP: "JPY", CN: "CNY", NZ: "NZD", CH: "CHF",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", PT: "EUR", NL: "EUR",
  IE: "EUR", BE: "EUR", AT: "EUR", FI: "EUR", GR: "EUR",
  SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", BR: "BRL", MX: "MXN", ZA: "ZAR",
};

const FX_TTL = 60 * 60 * 1000;
const fxCache = new Map<string, { rate: number; at: number }>();

async function getFxRate(from: string, to: string): Promise<number> {
  if (!from || !to || from === to) return 1;
  const key = `${from}->${to}`;
  const cached = fxCache.get(key);
  if (cached && Date.now() - cached.at < FX_TTL) return cached.rate;

  // Source A: jsDelivr-hosted currency-api — keyless, sends Access-Control-Allow-Origin:*
  // (covers all currencies incl. AED/SAR and is reachable from any browser origin).
  const sourceA = async (): Promise<number> => {
    const res = await fetch(
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${from.toLowerCase()}.json`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error("bad status");
    const json = await res.json();
    const rate = Number(json?.[from.toLowerCase()]?.[to.toLowerCase()]);
    if (!(rate > 0)) throw new Error("missing rate");
    return rate;
  };

  // Source B: Frankfurter (ECB) — fails on browsers that enforce CORS, used as backup only.
  const sourceB = async (): Promise<number> => {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${from}&to=${to}&amount=1`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error("bad status");
    const json = await res.json();
    const rate = Number(json?.rates?.[to]);
    if (!(rate > 0)) throw new Error("missing rate");
    return rate;
  };

  for (const source of [sourceA, sourceB]) {
    try {
      const rate = await source();
      fxCache.set(key, { rate, at: Date.now() });
      return rate;
    } catch {
      /* try next source */
    }
  }

  console.warn(`[currency] FX unavailable for ${from}->${to}; falling back to 1:1`);
  return 1;
}

export function detectCurrency(): CurrencyCode {
  try {
    const lang = navigator.language || "en-US";
    const region = (lang.split("-")[1] || lang).toUpperCase();
    return REGION_CURRENCY[region] ?? "USD";
  } catch {
    return "USD";
  }
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  try {
    const meta = CURRENCIES.find((c) => c.code === currency);
    return new Intl.NumberFormat(meta?.locale ?? "en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function currencySymbol(currency: CurrencyCode): string {
  try {
    const meta = CURRENCIES.find((c) => c.code === currency);
    return new Intl.NumberFormat(meta?.locale ?? "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .format(0)
      .replace(/[\d.,\s\u00a0]/g, "");
  } catch {
    return currency;
  }
}

interface CurrencyContextValue {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  baseCurrency: CurrencyCode;
  setBaseCurrency: (c: CurrencyCode) => void;
  convertFromBase: (amount: number) => number;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "USD",
  setCurrency: () => {},
  baseCurrency: "USD",
  setBaseCurrency: () => {},
  convertFromBase: (a) => a,
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const seededRef = useRef(false);

  const base = settings.base_currency as CurrencyCode;
  const display = settings.currency as CurrencyCode;

  const [rate, setRate] = useState(1);

  useEffect(() => {
    if (!settings.user_id || seededRef.current) return;
    seededRef.current = true;
    if (settings.currency === "USD" && settings.base_currency === "USD") {
      const detected = detectCurrency();
      if (detected !== "USD") {
        updateSettings({ currency: detected, base_currency: detected });
      }
    }
  }, [settings.user_id, settings.currency, settings.base_currency, updateSettings]);

  useEffect(() => {
    let active = true;
    setRate(1);
    getFxRate(base, display).then((r) => { if (active) setRate(r); });
    return () => { active = false; };
  }, [base, display]);

  const convertFromBase = (amount: number) => amount * rate;

  return (
    <CurrencyContext.Provider
      value={{
        currency: display,
        setCurrency: (c) => updateSettings({ currency: c }),
        baseCurrency: base,
        setBaseCurrency: (c) => updateSettings({ base_currency: c }),
        convertFromBase,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
