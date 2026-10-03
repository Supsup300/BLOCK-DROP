package fr.adriansalard.blockdrop.ads;

public interface AdsGateway {
    interface ResultCallback {
        void onResult(boolean completed, boolean rewarded, String reason);
    }

    void initialize();
    void showRewarded(ResultCallback callback);
    void showInterstitial(ResultCallback callback);
}
