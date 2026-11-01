import SwiftUI

@main
struct RuChatApp: App {
    var body: some Scene {
        WindowGroup {
            WebScreen()
                .ignoresSafeArea(.container, edges: .bottom)
                .background(Color(red: 10 / 255, green: 6 / 255, blue: 3 / 255).ignoresSafeArea())
                .preferredColorScheme(.dark)
        }
    }
}

struct WebScreen: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> WebViewController { WebViewController() }
    func updateUIViewController(_ controller: WebViewController, context: Context) {}
}
