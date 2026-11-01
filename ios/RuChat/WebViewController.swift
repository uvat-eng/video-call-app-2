import UIKit
import WebKit
import Contacts
import AVFoundation

final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private static let host = "rusapp.su"
    private static let startURL = URL(string: "https://rusapp.su/")!

    private var webView: WKWebView!
    private let contactStore = CNContactStore()

    private static let bridgeJS = """
    (function () {
      if (window.RuChatNative) return;
      window.__ruchatContactsGranted = false;
      window.RuChatNative = {
        platform: 'ios',
        hasContactsPermission: function () { return !!window.__ruchatContactsGranted; },
        requestContacts: function () { window.webkit.messageHandlers.ruchat.postMessage({ type: 'contacts' }); }
      };
    })();
    """

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 10 / 255, green: 6 / 255, blue: 3 / 255, alpha: 1)

        let controller = WKUserContentController()
        controller.addUserScript(WKUserScript(source: Self.bridgeJS, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.addUserScript(WKUserScript(
            source: "window.__ruchatContactsGranted = \(contactsGranted() ? "true" : "false");",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        controller.add(WeakHandler(self), name: "ruchat")

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()
        config.applicationNameForUserAgent = "RuChatIOS/1.0"

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(webView)

        webView.load(URLRequest(url: Self.startURL))
    }

    // MARK: - Контакты

    private func contactsGranted() -> Bool {
        let status = CNContactStore.authorizationStatus(for: .contacts)
        if status == .authorized { return true }
        if #available(iOS 18.0, *), status == .limited { return true }
        return false
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], body["type"] as? String == "contacts" else { return }
        let status = CNContactStore.authorizationStatus(for: .contacts)
        if contactsGranted() {
            deliverContacts()
        } else if status == .notDetermined {
            contactStore.requestAccess(for: .contacts) { [weak self] granted, _ in
                DispatchQueue.main.async {
                    if granted { self?.deliverContacts() } else { self?.sendToPage(nil) }
                }
            }
        } else {
            sendToPage(nil)
            askOpenSettings()
        }
    }

    private func deliverContacts() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let keys: [CNKeyDescriptor] = [
                CNContactGivenNameKey as CNKeyDescriptor,
                CNContactFamilyNameKey as CNKeyDescriptor,
                CNContactOrganizationNameKey as CNKeyDescriptor,
                CNContactPhoneNumbersKey as CNKeyDescriptor,
            ]
            var list: [[String: Any]] = []
            do {
                try self.contactStore.enumerateContacts(with: CNContactFetchRequest(keysToFetch: keys)) { c, _ in
                    let phones = c.phoneNumbers.map { $0.value.stringValue }
                    guard !phones.isEmpty else { return }
                    var name = [c.givenName, c.familyName].filter { !$0.isEmpty }.joined(separator: " ")
                    if name.isEmpty { name = c.organizationName }
                    list.append(["name": name, "phones": phones])
                }
            } catch {
                DispatchQueue.main.async { self.sendToPage(nil) }
                return
            }
            let data = (try? JSONSerialization.data(withJSONObject: list)) ?? Data("[]".utf8)
            let json = String(data: data, encoding: .utf8) ?? "[]"
            DispatchQueue.main.async {
                self.webView.evaluateJavaScript("window.__ruchatContactsGranted = true;")
                self.sendToPage(json)
            }
        }
    }

    private func sendToPage(_ json: String?) {
        let arg: String
        if let json, let quoted = try? JSONSerialization.data(withJSONObject: [json]),
           let s = String(data: quoted, encoding: .utf8) {
            arg = String(s.dropFirst().dropLast())
        } else {
            arg = "null"
        }
        webView.evaluateJavaScript("window.__ruchatContacts && window.__ruchatContacts(\(arg));")
    }

    private func askOpenSettings() {
        let alert = UIAlertController(
            title: "Доступ к контактам",
            message: "Чтобы найти друзей в RuChat, разрешите доступ к контактам в настройках iPhone.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Не сейчас", style: .cancel))
        alert.addAction(UIAlertAction(title: "Открыть настройки", style: .default) { _ in
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        })
        present(alert, animated: true)
    }

    // MARK: - Камера и микрофон для звонков

    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.host == Self.host ? .grant : .deny)
    }

    // MARK: - Навигация

    func webView(_ webView: WKWebView,
                 decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == "https", url.host == Self.host || action.targetFrame?.isMainFrame == false {
            return decisionHandler(.allow)
        }
        if scheme == "about" || scheme == "blob" || scheme == "data" {
            return decisionHandler(.allow)
        }
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if url.host == Self.host { webView.load(URLRequest(url: url)) } else { UIApplication.shared.open(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        target?.userContentController(c, didReceive: m)
    }
}
