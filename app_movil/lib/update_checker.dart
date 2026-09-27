import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

/// Cada build que sube el workflow de GitHub Actions publica un release con
/// tag `v<numero>` (el numero de corrida de esa Action, siempre creciente) y
/// el APK adjunto. Comparamos ese numero contra el buildNumber instalado.
const String _repoReleasesUrl =
    'https://api.github.com/repos/fcalle2bluu/SistContCoffe/releases/latest';

class InfoActualizacion {
  final int build;
  final String tag;
  final String apkUrl;

  InfoActualizacion({required this.build, required this.tag, required this.apkUrl});
}

Future<InfoActualizacion?> buscarUltimaVersion() async {
  try {
    final resp = await http
        .get(Uri.parse(_repoReleasesUrl), headers: {'Accept': 'application/vnd.github+json'})
        .timeout(const Duration(seconds: 10));
    if (resp.statusCode != 200) return null;

    final data = jsonDecode(resp.body) as Map<String, dynamic>;
    final tag = data['tag_name'] as String? ?? '';
    final build = int.tryParse(tag.replaceFirst('v', ''));
    if (build == null) return null;

    final assets = (data['assets'] as List?) ?? [];
    Map<String, dynamic>? apk;
    for (final a in assets) {
      final mapa = a as Map<String, dynamic>;
      if ((mapa['name'] as String? ?? '').toLowerCase().endsWith('.apk')) {
        apk = mapa;
        break;
      }
    }
    final url = apk?['browser_download_url'] as String?;
    if (url == null) return null;

    return InfoActualizacion(build: build, tag: tag, apkUrl: url);
  } catch (_) {
    return null;
  }
}

/// Devuelve la actualización disponible solo si es más nueva que la instalada.
Future<InfoActualizacion?> revisarSiHayActualizacion() async {
  final info = await buscarUltimaVersion();
  if (info == null) return null;
  final paquete = await PackageInfo.fromPlatform();
  final buildActual = int.tryParse(paquete.buildNumber) ?? 0;
  return info.build > buildActual ? info : null;
}

Future<void> descargarEInstalarActualizacion(
  InfoActualizacion info,
  void Function(double progreso) onProgreso,
) async {
  final dir = await getTemporaryDirectory();
  final archivo = File('${dir.path}/yanaloma-${info.tag}.apk');

  final peticion = http.Request('GET', Uri.parse(info.apkUrl));
  final respuesta = await peticion.send();
  final total = respuesta.contentLength ?? 0;
  var recibido = 0;

  final sink = archivo.openWrite();
  await respuesta.stream.map((trozo) {
    recibido += trozo.length;
    if (total > 0) onProgreso(recibido / total);
    return trozo;
  }).pipe(sink);

  await OpenFilex.open(archivo.path);
}
