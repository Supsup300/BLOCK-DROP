package fr.adriansalard.blockdrop.ads;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

public final class NativeAdsBridge {
    private final Activity activity;
    private final WebView webView;
    private final AdsGateway adsGateway;

    public NativeAdsBridge(Activity activity, WebView webView, AdsGateway adsGateway) {
        this.activity = activity;
        this.webView = webView;
        this.adsGateway = adsGateway;
    }

    @JavascriptInterface
    public void showRewarded(String requestId, String placement) {
        activity.runOnUiThread(() -> adsGateway.showRewarded((completed, rewarded, reason) ->
            dispatch(requestId, completed, rewarded, reason)
        ));
    }

    @JavascriptInterface
    public void showInterstitial(String requestId, String placement) {
        activity.runOnUiThread(() -> adsGateway.showInterstitial((completed, rewarded, reason) ->
            dispatch(requestId, completed, rewarded, reason)
        ));
    }

    private void dispatch(String requestId, boolean completed, boolean rewarded, String reason) {
        activity.runOnUiThread(() -> {
            JSONObject payload = new JSONObject();
            try {
                payload.put("completed", completed);
                payload.put("rewarded", rewarded);
                payload.put("reason", reason == null ? JSONObject.NULL : reason);
            } catch (Exception ignored) {
                // The three primitive fields above are always serializable.
            }
            String script = "window.__blockDropNativeCallbacks&&window.__blockDropNativeCallbacks.resolve("
                + JSONObject.quote(requestId) + "," + JSONObject.quote(payload.toString()) + ");";
            webView.evaluateJavascript(script, null);
        });
    }
}
