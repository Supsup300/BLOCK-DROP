package fr.adriansalard.blockdrop.ads;

import android.app.Activity;

import androidx.annotation.NonNull;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

import java.util.concurrent.atomic.AtomicBoolean;

public final class AdMobAdsGateway implements AdsGateway {
    private final Activity activity;
    private boolean initializationRequested;
    private RewardedAd rewardedAd;
    private InterstitialAd interstitialAd;
    private boolean loadingRewarded;
    private boolean loadingInterstitial;

    public AdMobAdsGateway(Activity activity) {
        this.activity = activity;
    }

    @Override
    public void initialize() {
        activity.runOnUiThread(() -> {
            if (initializationRequested) return;
            initializationRequested = true;
            MobileAds.initialize(activity, ignored -> {
                loadRewarded();
                loadInterstitial();
            });
        });
    }

    private void loadRewarded() {
        if (loadingRewarded || rewardedAd != null) return;
        loadingRewarded = true;
        RewardedAd.load(
            activity,
            AdConfig.REWARDED_UNIT_ID,
            new AdRequest.Builder().build(),
            new RewardedAdLoadCallback() {
                @Override
                public void onAdLoaded(@NonNull RewardedAd ad) {
                    loadingRewarded = false;
                    rewardedAd = ad;
                }

                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError error) {
                    loadingRewarded = false;
                    rewardedAd = null;
                }
            }
        );
    }

    private void loadInterstitial() {
        if (loadingInterstitial || interstitialAd != null) return;
        loadingInterstitial = true;
        InterstitialAd.load(
            activity,
            AdConfig.INTERSTITIAL_UNIT_ID,
            new AdRequest.Builder().build(),
            new InterstitialAdLoadCallback() {
                @Override
                public void onAdLoaded(@NonNull InterstitialAd ad) {
                    loadingInterstitial = false;
                    interstitialAd = ad;
                }

                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError error) {
                    loadingInterstitial = false;
                    interstitialAd = null;
                }
            }
        );
    }

    @Override
    public void showRewarded(ResultCallback callback) {
        activity.runOnUiThread(() -> {
            RewardedAd ad = rewardedAd;
            rewardedAd = null;
            if (ad == null) {
                loadRewarded();
                callback.onResult(false, false, "rewarded_not_ready");
                return;
            }

            AtomicBoolean rewardEarned = new AtomicBoolean(false);
            AtomicBoolean callbackSent = new AtomicBoolean(false);
            ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override
                public void onAdDismissedFullScreenContent() {
                    if (callbackSent.compareAndSet(false, true)) {
                        callback.onResult(true, rewardEarned.get(), rewardEarned.get() ? "reward_earned" : "closed_without_reward");
                    }
                    loadRewarded();
                }

                @Override
                public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                    if (callbackSent.compareAndSet(false, true)) {
                        callback.onResult(false, false, "rewarded_show_failed");
                    }
                    loadRewarded();
                }
            });
            ad.show(activity, rewardItem -> rewardEarned.set(true));
        });
    }

    @Override
    public void showInterstitial(ResultCallback callback) {
        activity.runOnUiThread(() -> {
            InterstitialAd ad = interstitialAd;
            interstitialAd = null;
            if (ad == null) {
                loadInterstitial();
                callback.onResult(false, false, "interstitial_not_ready");
                return;
            }

            AtomicBoolean callbackSent = new AtomicBoolean(false);
            ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override
                public void onAdDismissedFullScreenContent() {
                    if (callbackSent.compareAndSet(false, true)) {
                        callback.onResult(true, false, "closed");
                    }
                    loadInterstitial();
                }

                @Override
                public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                    if (callbackSent.compareAndSet(false, true)) {
                        callback.onResult(false, false, "interstitial_show_failed");
                    }
                    loadInterstitial();
                }
            });
            ad.show(activity);
        });
    }
}
