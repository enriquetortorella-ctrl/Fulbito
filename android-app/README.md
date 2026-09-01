# Fulbito para Android

Este módulo construye una aplicación Android nativa mínima que abre la versión
publicada de Fulbito en un WebView endurecido. No incorpora claves, usuarios ni
datos de Supabase. Requiere conexión a Internet para consultar y registrar
información del club.

El proyecto incluye Gradle Wrapper 8.7, por lo que no requiere instalar Gradle
manualmente. Para compilar se necesita una única vez:

- JDK 17 configurado mediante `JAVA_HOME`.
- Android SDK Platform 34 y Build-Tools, instalables desde Android Studio.

Con esos requisitos, el APK de distribución se genera con:

```text
gradlew.bat :app:assembleDebug
```

El resultado queda en:

```text
app/build/outputs/apk/debug/app-debug.apk
```
