/**
 * Rewarded-ad gate for hints (mobile only — the web build uses a cooldown
 * instead). One rewarded ad is kept preloaded; requestHintAd() shows it and
 * grants the hint once the reward is earned. If no ad is available (offline,
 * no fill, still loading), the hint is granted for free — an ad must never
 * block the game.
 *
 * Dev builds request Google's public TEST rewarded unit (AdMob policy:
 * never test against live units); release builds use the real unit id.
 * NOTE: an AdMob *unit* id contains a slash (ca-app-pub-…/…) — the tilde
 * form (ca-app-pub-…~…) is an *app* id and belongs in app.json instead.
 */
import { Platform } from "react-native";
import { requestTrackingPermissionsAsync } from "expo-tracking-transparency";
import mobileAds, {
  AdEventType,
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  AdsConsentStatus,
  MaxAdContentRating,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from "react-native-google-mobile-ads";

const REWARDED_UNIT_ID = __DEV__
  ? TestIds.REWARDED
  : "ca-app-pub-9617477795860410/4912754165";

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
    if (__DEV__) console.log("[ads] rewarded ad loaded");
    if (rewarded === ad) loaded = true;
    retryDelayMs = 10_000;
  });
  ad.addAdEventListener(AdEventType.ERROR, (err) => {
    // no-fill happens even on test units (see the library's "common reasons
    // for ads not showing" doc); retry with backoff so a later hint can
    // still be ad-gated (hints stay free in the meantime)
    if (__DEV__) console.warn("[ads] rewarded ad failed to load:", err);
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
    .catch((err) => {
      if (__DEV__) console.warn("[ads] ad inspector failed:", err);
    });
}

/** GDPR: where UMP reports a required privacy-options entry point (EEA/UK),
 * the app must offer a way to revisit consent after the initial form —
 * surfaced as a link on the privacy screen. */
let privacyOptionsRequired = false;

/** Cached synchronously so the privacy sheet can mount at its final size —
 * a post-mount async flip grows the sheet mid-entering-animation, and
 * Reanimated then settles it on the stale height (content overflows the
 * bottom safe-area padding). Warmed during initAds. */
export function adPrivacyOptionsRequiredSync(): boolean {
  return privacyOptionsRequired;
}

export async function adPrivacyOptionsRequired(): Promise<boolean> {
  try {
    const info = await AdsConsent.getConsentInfo();
    privacyOptionsRequired =
      info.privacyOptionsRequirementStatus ===
      AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
  } catch {
    // keep the last known value
  }
  return privacyOptionsRequired;
}

export function showAdPrivacyOptions() {
  AdsConsent.showPrivacyOptionsForm().catch((err) => {
    if (__DEV__) console.warn("[ads] privacy options form failed:", err);
  });
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
    if (__DEV__) console.log("[ads] consent info:", JSON.stringify(info));
    if (
      info.status === AdsConsentStatus.REQUIRED &&
      info.isConsentFormAvailable
    ) {
      const after = await AdsConsent.showForm();
      if (__DEV__)
        console.log("[ads] consent after form:", JSON.stringify(after));
    }
  } catch (err) {
    // consent state unavailable (e.g. offline) — proceed; ads may not fill
    if (__DEV__) console.warn("[ads] consent flow failed:", err);
  }
  // ATT must be resolved before the SDK starts, or iOS zeroes the ad
  // identifier without the user ever being asked (App Review 5.1.2). A
  // denial is fine — AdMob then serves non-personalized ads.
  if (Platform.OS === "ios") {
    try {
      await requestTrackingPermissionsAsync();
    } catch (err) {
      if (__DEV__) console.warn("[ads] ATT prompt failed:", err);
    }
  }
  try {
    // NOTE: iOS simulators frequently fail to serve even TEST ads (instant
    // no-fill or transport errors) — verify ad flows on a physical device.
    await mobileAds().setRequestConfiguration({
      // ads may not exceed the app's 4+ age rating (App Review 2.5.18)
      maxAdContentRating: MaxAdContentRating.G,
      testDeviceIdentifiers: ["SIMULATOR"],
    });
    await mobileAds().initialize();
    void adPrivacyOptionsRequired(); // warm the sync cache for the privacy screen
    preload();
  } catch (err) {
    // SDK failed to start; requestHintAd falls back to free hints
    if (__DEV__) console.warn("[ads] SDK init failed:", err);
  }
}

// QA/debug bridge: inspect ad state from the Metro debugger.
if (__DEV__) {
  (globalThis as unknown as Record<string, unknown>).__purrkourAds = {
    state: () => ({ hasAd: rewarded !== null, loaded }),
  };
}

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
