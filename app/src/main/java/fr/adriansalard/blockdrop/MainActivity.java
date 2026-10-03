package fr.adriansalard.blockdrop;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

import fr.adriansalard.blockdrop.ads.AdMobAdsGateway;
import fr.adriansalard.blockdrop.ads.NativeAdsBridge;
import fr.adriansalard.blockdrop.consent.ConsentManager;
import fr.adriansalard.blockdrop.consent.NativeConsentBridge;

public final class MainActivity extends Activity {
    private static final String LOCAL_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + LOCAL_HOST + "/assets/public/index.html";

    private WebView webView;
    private ConsentManager consentManager;
    private AdMobAdsGateway adsGateway;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWindow();
        configureWebView();

        adsGateway = new AdMobAdsGateway(this);
        consentManager = new ConsentManager(this);
        webView.addJavascriptInterface(new NativeAdsBridge(this, webView, adsGateway), "AndroidAdsBridge");
        webView.addJavascriptInterface(
            new NativeConsentBridge(this, consentManager, this::refreshPrivacyControl),
            "AndroidConsentBridge"
        );

        consentManager.requestConsent(adsGateway::initialize, this::refreshPrivacyControl);
        webView.loadUrl(START_URL);
    }

    private void configureWindow() {
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.rgb(3, 21, 43));
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(3, 21, 43));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (LOCAL_HOST.equals(uri.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // No compatible external activity: keep the game open.
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                refreshPrivacyControl();
            }
        });

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(3, 21, 43));
        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);
    }

    private void refreshPrivacyControl() {
        if (webView == null) return;
        runOnUiThread(() -> webView.evaluateJavascript(
            "window.BLOCK_DROP&&window.BLOCK_DROP.refreshPrivacyOptions();",
            null
        ));
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.evaluateJavascript("window.BLOCK_DROP&&window.BLOCK_DROP.saveNow();", null);
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

   

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidAdsBridge");
            webView.removeJavascriptInterface("AndroidConsentBridge");
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
