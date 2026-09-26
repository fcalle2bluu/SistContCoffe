import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

const String appUrl = 'https://sistcontcoffe.onrender.com/';

void main() {
  runApp(const YanalomaApp());
}

class YanalomaApp extends StatelessWidget {
  const YanalomaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Café Yanaloma',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFFD97706),
        scaffoldBackgroundColor: const Color(0xFF0A0A0A),
        useMaterial3: true,
      ),
      home: const WebViewScreen(),
    );
  }
}

class WebViewScreen extends StatefulWidget {
  const WebViewScreen({super.key});

  @override
  State<WebViewScreen> createState() => _WebViewScreenState();
}

class _WebViewScreenState extends State<WebViewScreen> {
  late final WebViewController _controller;
  double _progreso = 0;
  bool _sinConexion = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0A0A0A))
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (progreso) {
            setState(() => _progreso = progreso / 100);
          },
          onPageStarted: (_) => setState(() => _sinConexion = false),
          onWebResourceError: (error) {
            if (error.isForMainFrame ?? true) {
              setState(() => _sinConexion = true);
            }
          },
        ),
      )
      ..loadRequest(Uri.parse(appUrl));
  }

  Future<void> _reintentar() async {
    setState(() => _sinConexion = false);
    await _controller.loadRequest(Uri.parse(appUrl));
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        if (await _controller.canGoBack()) {
          await _controller.goBack();
        } else {
          Navigator.of(context).maybePop();
        }
      },
      child: Scaffold(
        body: SafeArea(
          child: Stack(
            children: [
              if (!_sinConexion) WebViewWidget(controller: _controller),
              if (_progreso < 1 && !_sinConexion)
                LinearProgressIndicator(
                  value: _progreso == 0 ? null : _progreso,
                  minHeight: 3,
                  color: const Color(0xFFD97706),
                  backgroundColor: Colors.transparent,
                ),
              if (_sinConexion)
                Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.wifi_off, color: Colors.white54, size: 48),
                        const SizedBox(height: 12),
                        const Text(
                          'No se pudo conectar con Café Yanaloma.\nRevisá tu conexión a internet.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.white70),
                        ),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: _reintentar,
                          child: const Text('Reintentar'),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
