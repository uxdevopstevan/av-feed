export type SignageConfig = {
  spaceId: number | null;
  daysBack: number;
  maxPosts: number;
  maxCommentsPerPost: number;
  maxTotalComments: number;
  commentAdvanceMs: number;
  postMinMs: number;
  postMaxMs: number;
  promoSlideMs: number;
  videoMinMs: number;
  videoMaxMs: number;
  themeColor: string;
  commentAreaBgColor: string;
  sidebarTextColor: string;
  sidebarBackgroundMediaUrl: string;
  sidebarJoinHeadline: string;
  promoCtaMessage: string;
  logoUrl: string;
  qrUrl: string;
  promoImageUrls: string[];
  backgroundMediaUrl: string;
};

export const SIGNAGE_CONFIG_LS_KEY = "circle:config:v1";

export const DEFAULT_SIGNAGE_CONFIG: SignageConfig = {
  spaceId: null,
  daysBack: 0,
  maxPosts: 200,
  maxCommentsPerPost: 10,
  maxTotalComments: 800,
  commentAdvanceMs: 4000,
  postMinMs: 10_000,
  postMaxMs: 40_000,
  promoSlideMs: 8_000,
  videoMinMs: 10_000,
  videoMaxMs: 60_000,
  themeColor: "#701a56",
  commentAreaBgColor: "#1A1A1A",
  sidebarTextColor: "#FFFFFF",
  sidebarBackgroundMediaUrl: "",
  sidebarJoinHeadline: "Scan to join the live feed!",
  promoCtaMessage: "",
  logoUrl: "",
  qrUrl: "",
  promoImageUrls: [],
  backgroundMediaUrl: "",
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

/** Trims only leading/trailing newlines; inner content unchanged. */
function normalizePlainText(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  return input.replace(/^\n+|\n+$/g, "");
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
  const backgroundMediaUrl = normalizeUrl(obj.backgroundMediaUrl) ?? DEFAULT_SIGNAGE_CONFIG.backgroundMediaUrl;
  const sidebarBackgroundMediaUrl =
    normalizeUrl(obj.sidebarBackgroundMediaUrl) ?? DEFAULT_SIGNAGE_CONFIG.sidebarBackgroundMediaUrl;
  const sidebarJoinHeadline =
    normalizePlainText(obj.sidebarJoinHeadline) ?? DEFAULT_SIGNAGE_CONFIG.sidebarJoinHeadline;
  const promoImageUrls = normalizePromoUrls(obj.promoImageUrls).filter((u) => !LEGACY_DEFAULT_PROMOS.has(u));
  const spaceId = normalizeSpaceId(obj.spaceId) ?? DEFAULT_SIGNAGE_CONFIG.spaceId;
  const daysBack = normalizeNonNegativeInt(obj.daysBack) ?? DEFAULT_SIGNAGE_CONFIG.daysBack;
  const maxPosts = normalizeNonNegativeInt(obj.maxPosts) ?? DEFAULT_SIGNAGE_CONFIG.maxPosts;
  const maxCommentsPerPost =
    normalizeNonNegativeInt(obj.maxCommentsPerPost) ?? DEFAULT_SIGNAGE_CONFIG.maxCommentsPerPost;
  const maxTotalComments =
    normalizeNonNegativeInt(obj.maxTotalComments) ?? DEFAULT_SIGNAGE_CONFIG.maxTotalComments;

  const commentAdvanceMs =
    normalizeNonNegativeInt(obj.commentAdvanceMs) ?? DEFAULT_SIGNAGE_CONFIG.commentAdvanceMs;
  const postMinMs = normalizeNonNegativeInt(obj.postMinMs) ?? DEFAULT_SIGNAGE_CONFIG.postMinMs;
  const postMaxMsRaw = normalizeNonNegativeInt(obj.postMaxMs) ?? DEFAULT_SIGNAGE_CONFIG.postMaxMs;
  const postMaxMs = Math.max(postMinMs, postMaxMsRaw);
  const promoSlideMs =
    normalizeNonNegativeInt(obj.promoSlideMs) ?? DEFAULT_SIGNAGE_CONFIG.promoSlideMs;
  const videoMinMs = normalizeNonNegativeInt(obj.videoMinMs) ?? DEFAULT_SIGNAGE_CONFIG.videoMinMs;
  const videoMaxMsRaw = normalizeNonNegativeInt(obj.videoMaxMs) ?? DEFAULT_SIGNAGE_CONFIG.videoMaxMs;
  const videoMaxMs = Math.max(videoMinMs, videoMaxMsRaw);

  return {
    spaceId,
    daysBack,
    maxPosts,
    maxCommentsPerPost,
    maxTotalComments,
    commentAdvanceMs,
    postMinMs,
    postMaxMs,
    promoSlideMs,
    videoMinMs,
    videoMaxMs,
    themeColor: normalizeHexColor(obj.themeColor) ?? DEFAULT_SIGNAGE_CONFIG.themeColor,
    commentAreaBgColor:
      normalizeHexColor(obj.commentAreaBgColor) ?? DEFAULT_SIGNAGE_CONFIG.commentAreaBgColor,
    sidebarTextColor:
      normalizeHexColor(obj.sidebarTextColor) ?? DEFAULT_SIGNAGE_CONFIG.sidebarTextColor,
    sidebarBackgroundMediaUrl,
    sidebarJoinHeadline,
    promoCtaMessage:
      normalizePlainText(obj.promoCtaMessage) ?? DEFAULT_SIGNAGE_CONFIG.promoCtaMessage,
    logoUrl: logoUrl === LEGACY_DEFAULT_LOGO ? "" : logoUrl,
    qrUrl: qrUrl === LEGACY_DEFAULT_QR ? "" : qrUrl,
    promoImageUrls,
    backgroundMediaUrl,
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

