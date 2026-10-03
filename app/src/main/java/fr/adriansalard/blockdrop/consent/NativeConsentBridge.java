package fr.adriansalard.blockdrop.consent;

import android.app.Activity;
import android.webkit.JavascriptInterface;

public final class NativeConsentBridge {
    private final Activity activity;
    private final ConsentManager consentManager;
    private final Runnable onStateChanged;

    public NativeConsentBridge(Activity activity, ConsentManager consentManager, Runnable onStateChanged) {
        this.activity = activity;
        this.consentManager = consentManager;
        this.onStateChanged = onStateChanged;
    }

    @JavascriptInterface
    public boolean isPrivacyOptionsRequired() {
        return consentManager.isPrivacyOptionsRequired();
    }

    @JavascriptInterface
    public void showPrivacyOptions() {
        activity.runOnUiThread(() -> consentManager.showPrivacyOptions(onStateChanged));
    }
}
