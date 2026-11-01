package su.rusapp.ruchat;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.view.View;
import android.view.ViewGroup;
import android.database.Cursor;
import android.provider.ContactsContract;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;

public class MainActivity extends Activity {
    private static final String HOST = "rusapp.su";
    private static final String START_URL = "https://" + HOST + "/";
    private static final int REQ_PERMS = 1;
    private static final int REQ_FILE = 2;
    private static final int REQ_CONTACTS = 3;

    private WebView web;
    private PermissionRequest pendingRequest;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0A0603"));
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#EEF1EC"));
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applySafeArea(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " RuChatAndroid/1.0");

        web.addJavascriptInterface(new Bridge(), "RuChatNative");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("https".equals(scheme) && HOST.equals(uri.getHost())) return false;
                openExternal(uri);
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handlePermission(request));
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent;
                try {
                    intent = params.createIntent();
                    if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    }
                    startActivityForResult(intent, REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        Uri data = getIntent() != null ? getIntent().getData() : null;
        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(data != null && HOST.equals(data.getHost()) ? data.toString() : START_URL);
        }
        web.setVisibility(View.VISIBLE);
    }

    private void applySafeArea(View root) {
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                int types = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout();
                android.graphics.Insets bars = insets.getInsets(types);
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                l = bars.left;
                t = bars.top;
                r = bars.right;
                b = Math.max(bars.bottom, ime.bottom);
            } else {
                l = insets.getSystemWindowInsetLeft();
                t = insets.getSystemWindowInsetTop();
                r = insets.getSystemWindowInsetRight();
                b = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(l, t, r, b);
            return insets;
        });
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(light, light);
            }
        }
        root.requestApplyInsets();
    }

    private void handlePermission(PermissionRequest request) {
        List<String> need = new ArrayList<>();
        for (String r : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && !granted(Manifest.permission.CAMERA)) {
                need.add(Manifest.permission.CAMERA);
            }
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && !granted(Manifest.permission.RECORD_AUDIO)) {
                need.add(Manifest.permission.RECORD_AUDIO);
            }
        }
        if (need.isEmpty()) {
            request.grant(request.getResources());
        } else {
            pendingRequest = request;
            requestPermissions(need.toArray(new String[0]), REQ_PERMS);
        }
    }

    private boolean granted(String p) {
        return checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED;
    }

    private class Bridge {
        @JavascriptInterface
        public boolean hasContactsPermission() {
            return granted(Manifest.permission.READ_CONTACTS);
        }

        @JavascriptInterface
        public void requestContacts() {
            runOnUiThread(() -> {
                if (granted(Manifest.permission.READ_CONTACTS)) deliverContacts();
                else requestPermissions(new String[]{Manifest.permission.READ_CONTACTS}, REQ_CONTACTS);
            });
        }
    }

    private void deliverContacts() {
        new Thread(() -> {
            String json = readContacts();
            runOnUiThread(() -> web.evaluateJavascript(
                    "window.__ruchatContacts && window.__ruchatContacts(" + (json == null ? "null" : JSONObject.quote(json)) + ")", null));
        }).start();
    }

    private String readContacts() {
        Map<String, JSONObject> byId = new LinkedHashMap<>();
        String[] cols = {
                ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
        };
        try (Cursor c = getContentResolver().query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, cols, null, null, null)) {
            if (c == null) return "[]";
            while (c.moveToNext()) {
                String id = c.getString(0);
                String name = c.getString(1);
                String num = c.getString(2);
                if (num == null) continue;
                JSONObject o = byId.get(id);
                if (o == null) {
                    o = new JSONObject();
                    o.put("name", name == null ? "" : name);
                    o.put("phones", new JSONArray());
                    byId.put(id, o);
                }
                o.getJSONArray("phones").put(num);
            }
            JSONArray out = new JSONArray();
            for (JSONObject o : byId.values()) out.put(o);
            return out.toString();
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code == REQ_CONTACTS) {
            if (granted(Manifest.permission.READ_CONTACTS)) deliverContacts();
            else web.evaluateJavascript("window.__ruchatContacts && window.__ruchatContacts(null)", null);
            return;
        }
        if (code != REQ_PERMS || pendingRequest == null) return;
        List<String> allowed = new ArrayList<>();
        for (String r : pendingRequest.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && granted(Manifest.permission.CAMERA)) allowed.add(r);
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && granted(Manifest.permission.RECORD_AUDIO)) allowed.add(r);
        }
        if (allowed.isEmpty()) pendingRequest.deny();
        else pendingRequest.grant(allowed.toArray(new String[0]));
        pendingRequest = null;
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        if (code == REQ_FILE && fileCallback != null) {
            Uri[] uris = null;
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    uris = new Uri[n];
                    for (int i = 0; i < n; i++) uris[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    uris = new Uri[]{data.getData()};
                }
            }
            fileCallback.onReceiveValue(uris);
            fileCallback = null;
            return;
        }
        super.onActivityResult(code, result, data);
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Uri data = intent.getData();
        if (data != null && HOST.equals(data.getHost())) web.loadUrl(data.toString());
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }
}
