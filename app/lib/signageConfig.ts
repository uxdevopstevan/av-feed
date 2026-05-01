export type SignageConfig = {
  spaceId: number | null;
  daysBack: number;
  maxPosts: number;
  maxCommentsPerPost: number;
  maxTotalComments: number;
  themeColor: string;
  logoUrl: string;
  qrUrl: string;
  promoImageUrls: string[];
};

export const SIGNAGE_CONFIG_LS_KEY = "staypost:config:v1";

export const DEFAULT_SIGNAGE_CONFIG: SignageConfig = {
  spaceId: null,
  daysBack: 0,
  maxPosts: 200,
  maxCommentsPerPost: 10,
  maxTotalComments: 800,
  themeColor: "#701a56",
  logoUrl: "",
  qrUrl: "",
  promoImageUrls: [],
};

const LEGACY_DEFAULT_LOGO = "/wia-logo.png";
const LEGACY_DEFAULT_QR = "/qr-code.svg";
const LEGACY_DEFAULT_PROMOS = new Set(["/promo1.png", "/promo2.png"]);

function normalizeHexColor(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const v = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`;
  return undefined;
}

function normalizeUrl(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const v = input.trim();
  return v ? v : undefined;
}

function normalizePromoUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const x of input) {
    const v = normalizeUrl(x);
    if (v) out.push(v);
  }
  return Array.from(new Set(out));
}

function normalizeSpaceId(input: unknown): number | null | undefined {
  if (input === null) return null;
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const n = Number(input);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function normalizeNonNegativeInt(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) return Math.max(0, Math.floor(input));
  if (typeof input === "string" && input.trim()) {
    const n = Number(input);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return undefined;
}

export function sanitizeSignageConfig(input: unknown): SignageConfig {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  const logoUrl = normalizeUrl(obj.logoUrl) ?? DEFAULT_SIGNAGE_CONFIG.logoUrl;
  const qrUrl = normalizeUrl(obj.qrUrl) ?? DEFAULT_SIGNAGE_CONFIG.qrUrl;
  const promoImageUrls = normalizePromoUrls(obj.promoImageUrls).filter((u) => !LEGACY_DEFAULT_PROMOS.has(u));
  const spaceId = normalizeSpaceId(obj.spaceId) ?? DEFAULT_SIGNAGE_CONFIG.spaceId;
  const daysBack = normalizeNonNegativeInt(obj.daysBack) ?? DEFAULT_SIGNAGE_CONFIG.daysBack;
  const maxPosts = normalizeNonNegativeInt(obj.maxPosts) ?? DEFAULT_SIGNAGE_CONFIG.maxPosts;
  const maxCommentsPerPost =
    normalizeNonNegativeInt(obj.maxCommentsPerPost) ?? DEFAULT_SIGNAGE_CONFIG.maxCommentsPerPost;
  const maxTotalComments =
    normalizeNonNegativeInt(obj.maxTotalComments) ?? DEFAULT_SIGNAGE_CONFIG.maxTotalComments;

  return {
    spaceId,
    daysBack,
    maxPosts,
    maxCommentsPerPost,
    maxTotalComments,
    themeColor: normalizeHexColor(obj.themeColor) ?? DEFAULT_SIGNAGE_CONFIG.themeColor,
    logoUrl: logoUrl === LEGACY_DEFAULT_LOGO ? "" : logoUrl,
    qrUrl: qrUrl === LEGACY_DEFAULT_QR ? "" : qrUrl,
    promoImageUrls,
  };
}

export function loadSignageConfigFromLocalStorage(): SignageConfig {
  try {
    const raw = window.localStorage.getItem(SIGNAGE_CONFIG_LS_KEY);
    if (!raw) return DEFAULT_SIGNAGE_CONFIG;
    return sanitizeSignageConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_SIGNAGE_CONFIG;
  }
}

export function saveSignageConfigToLocalStorage(cfg: SignageConfig): void {
  try {
    window.localStorage.setItem(SIGNAGE_CONFIG_LS_KEY, JSON.stringify(sanitizeSignageConfig(cfg)));
  } catch {
    // ignore
  }
}

