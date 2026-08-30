package ar.com.fulbito.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Contenedor mínimo de la web pública de Fulbito.
 * No expone ningún puente JavaScript-nativo ni guarda credenciales fuera del
 * almacenamiento protegido que usa WebView para la sesión de la propia web.
 */
public final class MainActivity extends Activity {
    private static final String APP_URL = "https://enriquetortorella-ctrl.github.io/Fulbito/";
    private static final String APP_HOST = "enriquetortorella-ctrl.github.io";
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(10, 14, 20));
        window.setNavigationBarColor(Color.rgb(10, 14, 20));

        webView = createConfiguredWebView();
        setContentView(webView);

        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private WebView createConfiguredWebView() {
        WebView configuredWebView = new WebView(this);
        WebSettings settings = configuredWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(configuredWebView, false);

        configuredWebView.setWebViewClient(new SafeFulbitoClient());
        return configuredWebView;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private final class SafeFulbitoClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // La app sólo navega dentro de Fulbito; no se permite cargar otro sitio en este contenedor.
            return !APP_HOST.equals(request.getUrl().getHost());
        }

    }
}
