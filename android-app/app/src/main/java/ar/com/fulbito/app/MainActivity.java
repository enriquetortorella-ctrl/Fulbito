package ar.com.fulbito.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
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
    private static final String APP_PATH = "/Fulbito";
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
            Uri uri = request.getUrl();
            if (isTrustedAppUrl(uri)) return false;

            // Los enlaces externos (por ejemplo la ubicación de la cancha en
            // Google Maps) se abren en la aplicación elegida por Android. Así
            // nunca se cargan sitios ajenos dentro del WebView ni se expone un
            // puente JavaScript nativo.
            String scheme = uri.getScheme();
            boolean canOpenExternally = "https".equalsIgnoreCase(scheme)
                || "http".equalsIgnoreCase(scheme)
                || "geo".equalsIgnoreCase(scheme);
            if (request.isForMainFrame() && request.hasGesture() && canOpenExternally) {
                try {
                    Intent externalIntent = new Intent(Intent.ACTION_VIEW, uri);
                    externalIntent.addCategory(Intent.CATEGORY_BROWSABLE);
                    startActivity(externalIntent);
                } catch (ActivityNotFoundException | SecurityException ignored) {
                    // El enlace queda bloqueado de forma segura si el equipo no
                    // tiene ninguna aplicación capaz de abrirlo.
                }
            }
            return true;
        }

        private boolean isTrustedAppUrl(Uri uri) {
            if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
            if (!APP_HOST.equalsIgnoreCase(uri.getHost())) return false;

            int port = uri.getPort();
            if (port != -1 && port != 443) return false;

            String path = uri.getPath();
            return APP_PATH.equals(path) || (path != null && path.startsWith(APP_PATH + "/"));
        }

    }
}
