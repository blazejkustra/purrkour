/**
 * Rewarded-ad gate for hints (mobile only — the web build uses a cooldown
 * instead). One rewarded ad is kept preloaded; requestHintAd() shows it and
 * grants the hint once the reward is earned. If no ad is available (offline,
 * no fill, still loading), the hint is granted for free — an ad must never
 * block the game.
 *
 * NOTE: runs on Google's public TEST ad units. Before release, replace
 * REWARDED_UNIT_ID below and the app ids in app.json with real AdMob ids.
 */
import mobileAds, {
  AdEventType,
  AdsConsent,
  AdsConsentStatus,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from "react-native-google-mobile-ads";

const REWARDED_UNIT_ID = TestIds.REWARDED;

let rewarded: RewardedAd | null = null;
let loaded = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelayMs = 10_000;

function preload() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  // No request options: consent gathered at init decides personalization —
  // forcing non-personalized requests caused no-fill even on test units.
  const ad = RewardedAd.createForAdRequest(REWARDED_UNIT_ID);
  rewarded = ad;
  loaded = false;
  ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
    console.log("[ads] rewarded ad loaded");
    if (rewarded === ad) loaded = true;
    retryDelayMs = 10_000;
  });
  ad.addAdEventListener(AdEventType.ERROR, (err) => {
    // no-fill happens even on test units (see the library's "common reasons
    // for ads not showing" doc); retry with backoff so a later hint can
    // still be ad-gated (hints stay free in the meantime)
    console.warn("[ads] rewarded ad failed to load:", err);
    if (rewarded === ad) {
      rewarded = null;
      loaded = false;
      retryTimer = setTimeout(preload, retryDelayMs);
      retryDelayMs = Math.min(60_000, retryDelayMs * 2);
    }
  });
  ad.load();
}

/** Google's Ad Inspector — shows per-request fill/failure reasons on-device.
 * Dev tooling: wired to a long-press on the hint bulb in dev builds. */
export function openAdInspector() {
  mobileAds()
    .openAdInspector()
    .catch((err) => console.warn("[ads] ad inspector failed:", err));
}

let initStarted = false;

/** Gather consent (UMP/ATT where applicable), start the SDK, preload an ad.
 * Every step is best-effort: a failure just means hints stay free. Runs once
 * per JS context — concurrent calls (remounts, Fast Refresh) would race the
 * consent form and initialize the SDK before consent resolves. */
export async function initAds() {
  if (initStarted) return;
  initStarted = true;
  try {
    // In consent regions (EEA/UK) ad requests are rejected with no-fill until
    // consent is resolved, so show the UMP form when it's required.
    const info = await AdsConsent.requestInfoUpdate();
    console.log("[ads] consent info:", JSON.stringify(info));
    if (
      info.status === AdsConsentStatus.REQUIRED &&
      info.isConsentFormAvailable
    ) {
      const after = await AdsConsent.showForm();
      console.log("[ads] consent after form:", JSON.stringify(after));
    }
  } catch (err) {
    // consent state unavailable (e.g. offline) — proceed; ads may not fill
    console.warn("[ads] consent flow failed:", err);
  }
  try {
    // NOTE: iOS simulators frequently fail to serve even TEST ads (instant
    // no-fill or transport errors) — verify ad flows on a physical device.
    await mobileAds().setRequestConfiguration({
      testDeviceIdentifiers: ["SIMULATOR"],
    });
    await mobileAds().initialize();
    preload();
  } catch (err) {
    // SDK failed to start; requestHintAd falls back to free hints
    console.warn("[ads] SDK init failed:", err);
  }
}

// QA/debug bridge: inspect ad state from the Metro debugger.
(globalThis as unknown as Record<string, unknown>).__purrkourAds = {
  state: () => ({ hasAd: rewarded !== null, loaded }),
};

/** Show the rewarded ad, granting the hint when the reward is earned.
 * Falls back to granting it immediately when no ad is ready — `viaAd` tells
 * the caller whether an ad was actually watched (false → apply a cooldown
 * so the free fallback can't be spammed). */
export function requestHintAd(grantHint: (viaAd: boolean) => void) {
  const ad = rewarded;
  if (!ad || !loaded) {
    grantHint(false);
    if (!ad) preload();
    return;
  }
  let earnedReward = false;
  const unsubEarned = ad.addAdEventListener(
    RewardedAdEventType.EARNED_REWARD,
    () => {
      earnedReward = true;
    },
  );
  const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
    unsubEarned();
    unsubClosed();
    if (earnedReward) grantHint(true);
    preload();
  });
  loaded = false;
  ad.show().catch(() => {
    unsubEarned();
    unsubClosed();
    grantHint(false);
    preload();
  });
}
