package fr.adriansalard.blockdrop.consent;

import android.app.Activity;

import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

public final class ConsentManager {
    private final Activity activity;
    private final ConsentInformation consentInformation;

    public ConsentManager(Activity activity) {
        this.activity = activity;
        this.consentInformation = UserMessagingPlatform.getConsentInformation(activity);
    }

    public void requestConsent(Runnable adsReady, Runnable stateChanged) {
        if (consentInformation.canRequestAds()) adsReady.run();
        ConsentRequestParameters parameters = new ConsentRequestParameters.Builder().build();
        consentInformation.requestConsentInfoUpdate(
            activity,
            parameters,
            () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, formError -> {
                if (consentInformation.canRequestAds()) adsReady.run();
                stateChanged.run();
            }),
            requestConsentError -> {
                if (consentInformation.canRequestAds()) adsReady.run();
                stateChanged.run();
            }
        );
    }

    public boolean isPrivacyOptionsRequired() {
        return consentInformation.getPrivacyOptionsRequirementStatus()
            == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
    }

    public void showPrivacyOptions(Runnable finished) {
        UserMessagingPlatform.showPrivacyOptionsForm(activity, formError -> finished.run());
    }
}
