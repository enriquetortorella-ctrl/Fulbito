# Fulbito para Android

Este módulo construye una aplicación Android nativa mínima que abre la versión
publicada de Fulbito en un WebView endurecido. No incorpora claves, usuarios ni
datos de Supabase. Requiere conexión a Internet para consultar y registrar
información del club.

El APK de distribución se genera con:

```text
gradle :app:assembleDebug
```

El resultado queda en:

```text
app/build/outputs/apk/debug/app-debug.apk
```
